"""Conversation workflows: what happens when a customer writes, an agent replies, a case closes."""
import difflib
from functools import lru_cache

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .llm.anthropic_provider import AnthropicProvider
from .llm.base import LLMProvider
from .llm.mock_provider import MockProvider
from .models import Conversation, FeedbackEvent, Message
from .pipeline import steps


@lru_cache
def get_llm() -> LLMProvider:
    if settings.llm_provider == "anthropic":
        return AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
    return MockProvider()


def _history(conv: Conversation) -> list[dict]:
    return [{"role": m.role, "text": m.text, "text_ko": m.text_ko} for m in conv.messages]


def latest_sources(conv: Conversation) -> list[dict]:
    for m in reversed(conv.messages):
        if m.role == "customer" and m.analysis:
            return m.analysis.get("sources", [])
    return []


def handle_customer_message(db: Session, conv: Conversation, text: str, llm: LLMProvider | None = None) -> Message:
    """Translate + triage, retrieve policy, draft 3 replies and validate each one."""
    llm = llm or get_llm()
    timer = steps.Timer()
    analysis = timer.run("analyze", steps.analyze, llm, text, conv.channel)
    sources = timer.run("retrieve", steps.retrieve, analysis["search_query"], text, analysis["category"])

    msg = Message(conversation=conv, role="customer", text=text, text_ko=analysis["translation_ko"])
    db.add(msg)
    db.flush()

    drafts = timer.run(
        "drafts",
        steps.drafts,
        llm,
        channel=conv.channel,
        customer_name=conv.customer_name,
        language=analysis["language"],
        category=analysis["category"],
        sentiment=analysis["sentiment"],
        history=_history(conv),
        sources=sources,
    )
    timer.ms["total"] = sum(timer.ms.values())

    msg.analysis = {"classification": analysis, "sources": sources, "drafts": drafts, "timings_ms": timer.ms}
    conv.language = analysis["language"]
    conv.category = analysis["category"]
    conv.sentiment = analysis["sentiment"]
    # Urgency only escalates within a conversation; a calm follow-up does not hide an angry start.
    order = ["low", "medium", "high"]
    if conv.urgency is None or order.index(analysis["urgency"]) > order.index(conv.urgency):
        conv.urgency = analysis["urgency"]
    conv.status = "open"
    db.commit()
    return msg


def create_conversation(db: Session, *, channel: str, customer_name: str, message: str,
                        customer_email: str | None = None, subject: str | None = None,
                        llm: LLMProvider | None = None) -> Conversation:
    conv = Conversation(channel=channel, customer_name=customer_name, customer_email=customer_email, subject=subject)
    db.add(conv)
    db.flush()
    handle_customer_message(db, conv, message, llm)
    db.refresh(conv)
    return conv


def preview_translation(conv: Conversation, text_ko: str, llm: LLMProvider | None = None) -> dict:
    llm = llm or get_llm()
    return steps.translate_reply(
        llm,
        text_ko=text_ko,
        channel=conv.channel,
        customer_name=conv.customer_name,
        language=conv.language,
        sources=latest_sources(conv),
    )


def send_agent_message(db: Session, conv: Conversation, *, text: str, text_ko: str | None,
                       draft_style: str | None, draft_text: str | None) -> Message:
    from .pipeline.validate import check_reply

    validation = check_reply(text, conv.channel, latest_sources(conv))
    if not validation["passed"]:
        raise ValueError(validation)
    msg = Message(conversation=conv, role="agent", text=text, text_ko=text_ko, analysis={"validation": validation})
    db.add(msg)
    db.flush()
    if draft_text:
        ratio = 1 - difflib.SequenceMatcher(None, draft_text, text).ratio()
        action = "accepted" if ratio < 0.05 else "edited"
        db.add(FeedbackEvent(conversation_id=conv.id, message_id=msg.id, draft_style=draft_style,
                             action=action, edit_ratio=round(ratio, 3)))
    else:
        db.add(FeedbackEvent(conversation_id=conv.id, message_id=msg.id, action="manual"))
    db.commit()
    return msg


def record_rejection(db: Session, conv: Conversation, draft_style: str | None) -> None:
    db.add(FeedbackEvent(conversation_id=conv.id, draft_style=draft_style, action="rejected"))
    db.commit()


def summarize_conversation(db: Session, conv: Conversation, llm: LLMProvider | None = None) -> dict:
    llm = llm or get_llm()
    summary = steps.summarize(llm, channel=conv.channel, messages=_history(conv), category=conv.category)
    conv.summary = summary
    conv.status = "escalated" if summary["escalate"] else "resolved" if summary["resolved"] else conv.status
    db.commit()
    return summary


def kpi(db: Session) -> dict:
    events = db.execute(select(FeedbackEvent.action, func.count()).group_by(FeedbackEvent.action)).all()
    counts = {a: n for a, n in events}
    replies_from_drafts = counts.get("accepted", 0) + counts.get("edited", 0)
    replies = replies_from_drafts + counts.get("manual", 0)
    avg_edit = db.scalar(select(func.avg(FeedbackEvent.edit_ratio)).where(FeedbackEvent.edit_ratio.is_not(None)))

    customer_msgs = db.scalars(select(Message).where(Message.role == "customer")).all()
    latencies = [m.analysis["timings_ms"]["total"] for m in customer_msgs if m.analysis and "timings_ms" in m.analysis]
    drafts = [d for m in customer_msgs if m.analysis for d in m.analysis.get("drafts", [])]
    blocked = sum(1 for d in drafts if not d["validation"]["passed"])

    by_category = dict(db.execute(select(Conversation.category, func.count()).group_by(Conversation.category)).all())
    by_status = dict(db.execute(select(Conversation.status, func.count()).group_by(Conversation.status)).all())
    return {
        "conversations": sum(by_status.values()),
        "by_status": by_status,
        "by_category": {k or "other": v for k, v in by_category.items()},
        "agent_replies": replies,
        "draft_adoption_rate": round(replies_from_drafts / replies, 3) if replies else None,
        "accepted_as_is": counts.get("accepted", 0),
        "edited": counts.get("edited", 0),
        "rejected": counts.get("rejected", 0),
        "avg_edit_ratio": round(avg_edit, 3) if avg_edit is not None else None,
        "avg_first_draft_ms": round(sum(latencies) / len(latencies)) if latencies else None,
        "drafts_generated": len(drafts),
        "drafts_blocked_by_guard": blocked,
    }
