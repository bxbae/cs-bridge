"""Offline provider: deterministic answers built from the pipeline context.

It lets the app, the tests and CI run with no API key. Classification uses keyword rules,
drafts are assembled from the retrieved KB sections, and translations come from a small
fixture file (demo messages) or fall back to a glossary-only rendering. Real quality comes
from LLM_PROVIDER=anthropic.
"""
import json
import re
from pathlib import Path
from typing import Any

FIXTURES = json.loads((Path(__file__).parent / "mock_fixtures.json").read_text(encoding="utf-8"))

CATEGORY_KEYWORDS = [
    ("refund", ["refund", "money back", "reimburse", "cancel my purchase"]),
    ("maintenance", ["maintenance", "downtime", "patch", "server was down", "extended"]),
    ("account", ["banned", "ban", "suspend", "suspension", "hacked", "compromised", "appeal", "unban", "locked out"]),
    ("billing", ["bought", "purchase", "purchased", "charged", "payment", "paid", "receipt", "pack", "never received", "didn't receive", "not received"]),
    ("bug", ["bug", "glitch", "disappeared", "vanished", "lost my", "missing item", "broken"]),
    ("technical", ["log in", "login", "disconnect", "error", "crash", "lag", "connection", "freez"]),
]
ANGRY = re.compile(r"!!|\b(ridiculous|unacceptable|worst|scam|terrible|furious|chargeback|lawyer)\b", re.I)
SHOUT = re.compile(r"\b[A-Z]{3,}\b")  # case-sensitive: "NOW", "UNBAN"
ACRONYMS = {"UTC", "GPA", "FAQ", "USD", "KRW", "VIP", "PVP", "PVE", "NPC", "iOS", "API", "EMAIL", "CARD", "PHONE"}
FRUSTRATED = re.compile(r"\b(still|again|already|third time|nobody|waiting|days)\b", re.I)

AGENT_TO_CUSTOMER = [
    (r"\bAsk the player to\b", "Could you please"),
    (r"\bask the player to\b", "please"),
    (r"\bAsk the player for\b", "Could you please share"),
    (r"\bask for\b", "please share"),
    (r"\bAsk for\b", "Please share"),
    (r"\bthe player's\b", "your"),
    (r"\bIf the player believes\b", "If you believe"),
    (r"\bthe player believes\b", "you believe"),
    (r"\bask them to\b", "please"),
    (r"\btheir\b", "your"),
    (r"\bthe player was\b", "you were"),
    (r"\bthe player\b", "you"),
    (r"\bplayers\b", "you"),
    (r"\bPlayers\b", "You"),
    (r"\bThe player\b", "You"),
]
INTERNAL = re.compile(r"\b(agents?|do not promise|do not ask|should not|cannot lift|detection details|billing lead|tell the player)\b", re.I)


def _customer_facing(text: str) -> str:
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text) if s and not INTERNAL.search(s)]
    out = " ".join(sentences)
    for pattern, repl in AGENT_TO_CUSTOMER:
        out = re.sub(pattern, repl, out)
    return out.strip()


def _first_name(name: str) -> str:
    return (name or "there").split()[0]


class MockProvider:
    name = "mock"

    def complete_json(self, task: str, system: str, user: str, context: dict[str, Any]) -> dict[str, Any]:
        return getattr(self, f"_{task}")(context)

    def _analyze(self, ctx: dict) -> dict:
        text = ctx["text"]
        lower = text.lower()
        scores = {cat: sum(k in lower for k in kws) for cat, kws in CATEGORY_KEYWORDS}
        best = max(scores, key=lambda c: scores[c])  # dict order = priority on ties
        category = best if scores[best] else "other"
        shouting = any(w not in ACRONYMS for w in SHOUT.findall(text))
        sentiment = "angry" if ANGRY.search(text) or shouting else "frustrated" if FRUSTRATED.search(text) else "calm"
        urgency = (
            "high" if sentiment == "angry" or "charged twice" in lower or "hacked" in lower
            else "medium" if category in {"billing", "refund", "account", "bug"} else "low"
        )
        fixture = FIXTURES["analyze"].get(text.strip(), {})
        return {
            "language": "en",
            "translation_ko": fixture.get("translation_ko", f"[mock 번역 · LLM 연결 시 실제 번역] {text}"),
            "intent_ko": fixture.get("intent_ko", f"{category} 관련 문의"),
            "category": category,
            "sentiment": sentiment,
            "urgency": urgency,
            "search_query": text,
        }

    def _drafts(self, ctx: dict) -> dict:
        # Skip sections that are internal-only guidance (nothing customer-facing left after rewriting).
        sources = [s for s in ctx["sources"] if _customer_facing(s["text"])]
        name = _first_name(ctx["customer_name"])
        channel = ctx["channel"]
        if not sources:
            body = {"empathetic": "I'm sorry for the trouble. Let me check this with the team and get back to you shortly.",
                    "concise": "Let me check this with the team and get back to you.",
                    "step_by_step": "1. I'll forward your case to the right team.\n2. We'll reply here as soon as we have an update."}
            ko = "관련 정책을 찾지 못해 팀에 확인 후 답변드린다는 내용입니다."
            ids: list[str] = []
        else:
            top = sources[0]
            main = _customer_facing(top["text"])
            extra = _customer_facing(sources[1]["text"]) if len(sources) > 1 and sources[1]["doc_id"] == top["doc_id"] and sources[1]["score"] >= 0.6 * top["score"] else ""
            steps = [s for s in re.split(r"(?<=[.!?])\s+", (main + " " + extra).strip()) if s]
            body = {
                "empathetic": f"I'm really sorry for the trouble, and thank you for your patience. {main}",
                "concise": steps[0] if steps else main,
                "step_by_step": "\n".join(f"{i}. {s}" for i, s in enumerate(steps[:4], 1)),
            }
            ko = " ".join(s["text_ko"] for s in sources[:2] if s["text_ko"])
            ids = [top["id"]] + ([sources[1]["id"]] if extra else [])
        drafts = []
        for style in ["empathetic", "concise", "step_by_step"]:
            if channel == "email":
                reply = f"Hi {name},\n\n{body[style]}\n\nBest regards,\n{ctx['agent_name']}\n{ctx['brand']}"
            else:
                reply = f"Hi {name}! {body[style]}" if style != "step_by_step" else f"Hi {name}! Here's what to do:\n{body[style]}"
            drafts.append({"style": style, "reply": reply, "reply_ko": f"[근거 요약] {ko}", "source_ids": ids})
        return {"drafts": drafts}

    def _translate(self, ctx: dict) -> dict:
        text_ko = ctx["text_ko"].strip()
        fixture = FIXTURES["translate"].get(text_ko)
        if fixture:
            body = fixture
        else:
            body = text_ko
            for ko, en in sorted(ctx["glossary_hits"].items(), key=lambda kv: -len(kv[0])):
                body = body.replace(ko, en)
            body = f"[mock translation] {body}"
        if ctx["channel"] == "email" and not re.match(r"^\s*(hi|hello|dear)\b", body, re.I):
            body = f"Hi {_first_name(ctx['customer_name'])},\n\n{body}\n\nBest regards,\n{ctx['agent_name']}\n{ctx['brand']}"
        return {"reply": body, "back_translation_ko": text_ko}

    def _summary(self, ctx: dict) -> dict:
        msgs = ctx["messages"]
        first = next((m for m in msgs if m["role"] == "customer"), None)
        agent_msgs = [m for m in msgs if m["role"] == "agent"]
        category = ctx.get("category") or "other"
        issue = (first or {}).get("text_ko") or (first or {}).get("text", "")
        return {
            "summary_ko": f"[mock 요약] {category} 문의. 고객 메시지 {len(msgs) - len(agent_msgs)}건, 상담원 답변 {len(agent_msgs)}건.",
            "issue_ko": issue[:160],
            "actions_ko": [(m.get("text_ko") or m["text"])[:120] for m in agent_msgs],
            "next_action_ko": "없음" if agent_msgs else "상담원 답변 필요",
            "category": category,
            "resolved": bool(agent_msgs),
            "escalate": category in {"refund", "account"} and bool(agent_msgs),
            "escalate_reason_ko": "결제 리드·보안팀 확인이 필요한 유형" if category in {"refund", "account"} else "",
            "tags": [category, "mock"],
        }
