"""Pipeline steps. Each one builds prompts, calls the provider and normalizes the JSON it gets back."""
import time
from typing import Any

from ..config import settings
from ..llm.base import LLMProvider
from . import prompts
from .glossary import glossary_block, load_glossary, terms_in
from .pii import mask_pii
from .retrieve import get_retriever
from .validate import check_reply

STYLES = ["empathetic", "concise", "step_by_step"]


class Timer:
    def __init__(self):
        self.ms: dict[str, int] = {}

    def run(self, name: str, fn, *args, **kwargs):
        start = time.perf_counter()
        try:
            return fn(*args, **kwargs)
        finally:
            self.ms[name] = round((time.perf_counter() - start) * 1000)


def _pick(value: Any, allowed: list[str], default: str) -> str:
    value = str(value or "").strip().lower()
    return value if value in allowed else default


def analyze(llm: LLMProvider, text: str, channel: str) -> dict:
    masked, pii_types = mask_pii(text)
    out = llm.complete_json(
        "analyze",
        prompts.ANALYZE_SYSTEM,
        f"CHANNEL: {channel}\nMESSAGE:\n{masked}",
        {"text": masked, "channel": channel},
    )
    return {
        "language": str(out.get("language") or "en")[:5],
        "translation_ko": out.get("translation_ko") or "",
        "intent_ko": out.get("intent_ko") or "",
        "category": _pick(out.get("category"), prompts.CATEGORIES, "other"),
        "sentiment": _pick(out.get("sentiment"), ["calm", "frustrated", "angry"], "calm"),
        "urgency": _pick(out.get("urgency"), ["low", "medium", "high"], "medium"),
        "search_query": out.get("search_query") or masked,
        "pii_masked": pii_types,
    }


def retrieve(query: str, original: str, category: str) -> list[dict]:
    """Search with the rewritten query and the original text, then merge by best score."""
    retriever = get_retriever()
    hint = category if category != "other" else None
    merged: dict[str, dict] = {}
    for q in {query, original}:
        for hit in retriever.search(q, top_k=settings.top_k, category_hint=hint):
            if hit["id"] not in merged or hit["score"] > merged[hit["id"]]["score"]:
                merged[hit["id"]] = hit
    return sorted(merged.values(), key=lambda h: -h["score"])[: settings.top_k]


def _history_block(history: list[dict]) -> str:
    lines = []
    for m in history[-8:]:
        who = "CUSTOMER" if m["role"] == "customer" else "AGENT"
        lines.append(f"{who}: {mask_pii(m['text'])[0]}")
    return "\n".join(lines)


def _sources_block(sources: list[dict]) -> str:
    if not sources:
        return "(no matching sources)"
    return "\n".join(f"[{s['id']}] {s['title']} / {s['section']}: {s['text']}" for s in sources)


def drafts(llm: LLMProvider, *, channel: str, customer_name: str, language: str, category: str,
           sentiment: str, history: list[dict], sources: list[dict]) -> list[dict]:
    fmt = {
        "brand": settings.brand_name,
        "agent_name": settings.agent_name,
        "customer_name": customer_name,
        "language": language,
        "channel": channel,
        "category": category,
        "sentiment": sentiment,
    }
    out = llm.complete_json(
        "drafts",
        prompts.DRAFTS_SYSTEM.format(**fmt),
        prompts.DRAFTS_USER.format(
            history=_history_block(history), sources=_sources_block(sources), glossary=glossary_block(), **fmt
        ),
        {**fmt, "sources": sources, "history": history},
    )
    results = []
    for i, d in enumerate((out.get("drafts") or [])[:3]):
        reply = str(d.get("reply") or "").strip()
        if not reply:
            continue
        cited = [str(c) for c in (d.get("source_ids") or [])]
        results.append(
            {
                "style": _pick(d.get("style"), STYLES, STYLES[i % 3]),
                "reply": reply,
                "reply_ko": str(d.get("reply_ko") or ""),
                "source_ids": cited,
                "validation": check_reply(reply, channel, sources, cited_ids=cited),
            }
        )
    return results


def translate_reply(llm: LLMProvider, *, text_ko: str, channel: str, customer_name: str,
                    language: str, sources: list[dict]) -> dict:
    fmt = {
        "brand": settings.brand_name,
        "agent_name": settings.agent_name,
        "customer_name": customer_name,
        "language": language,
        "channel": channel,
    }
    channel_rule = prompts.CHANNEL_RULES[channel].format(**fmt)
    out = llm.complete_json(
        "translate",
        prompts.TRANSLATE_SYSTEM.format(channel_rule=channel_rule, **fmt),
        prompts.TRANSLATE_USER.format(text_ko=text_ko, glossary=glossary_block()),
        {**fmt, "text_ko": text_ko, "glossary_hits": terms_in(text_ko, load_glossary())},
    )
    reply = str(out.get("reply") or "").strip()
    return {
        "reply": reply,
        "back_translation_ko": str(out.get("back_translation_ko") or ""),
        "validation": check_reply(reply, channel, sources, source_ko=text_ko),
    }


def summarize(llm: LLMProvider, *, channel: str, messages: list[dict], category: str | None) -> dict:
    transcript = "\n".join(
        f"{'CUSTOMER' if m['role'] == 'customer' else 'AGENT'}: {mask_pii(m['text'])[0]}" for m in messages
    )
    out = llm.complete_json(
        "summary",
        prompts.SUMMARY_SYSTEM,
        f"CHANNEL: {channel}\nTRANSCRIPT:\n{transcript}",
        {"messages": messages, "category": category},
    )
    return {
        "summary_ko": out.get("summary_ko") or "",
        "issue_ko": out.get("issue_ko") or "",
        "actions_ko": [str(a) for a in (out.get("actions_ko") or [])],
        "next_action_ko": out.get("next_action_ko") or "",
        "category": _pick(out.get("category"), prompts.CATEGORIES, category or "other"),
        "resolved": bool(out.get("resolved")),
        "escalate": bool(out.get("escalate")),
        "escalate_reason_ko": out.get("escalate_reason_ko") or "",
        "tags": [str(t) for t in (out.get("tags") or [])][:5],
    }
