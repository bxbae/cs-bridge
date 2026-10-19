"""Rule-based guards run on every reply before an agent can send it.

The LLM writes; these checks decide whether the result is safe to send. Each finding is
{code, level, message}. level "error" blocks sending, "warning" asks the agent to look.
"""
import re

from .glossary import missing_terms
from .pii import find_pii
from .retrieve import get_retriever

PROMISE = re.compile(
    r"\b(we(?:'ll| will)|i(?:'ll| will)|you(?:'ll| will) (?:receive|get)|we(?:'ve| have) (?:refunded|sent|added|restored|delivered|lifted)|"
    r"we are (?:sending|refunding)|(?:are|is) (?:going to be )?(?:refunded|restored|compensated))\b",
    re.I,
)
PROMISE_OBJECT = re.compile(r"\b(refund\w*|compensat\w*|crystals?|restor\w*|reimburs\w*|free|lift\w*|unban\w*|deliver\w*)\b", re.I)
ABSOLUTE = re.compile(r"\b(guarantee\w*|definitely|100%|immediately lift|right away|for sure)\b", re.I)
PROHIBITION = re.compile(r"\b(cannot|can't|must not|do not promise|never)\b", re.I)
RESTRICTION = re.compile(r"\b(cannot|can't|not|only if|only given|must not|unless|require\w*)\b", re.I)
NUMBER = re.compile(r"\d+(?:[.,:]\d+)*")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def numbers_in(text: str) -> set[str]:
    return {n.replace(",", "") for n in NUMBER.findall(text)}


def check_reply(
    reply: str,
    channel: str,
    sources: list[dict],
    cited_ids: list[str] | None = None,
    source_ko: str | None = None,
) -> dict:
    """Validate a customer-facing reply.

    sources:   the KB chunks retrieved for this conversation (the only allowed grounding)
    cited_ids: chunk ids the draft claims to use
    source_ko: the agent's Korean text when `reply` is its translation
    """
    findings: list[dict] = []
    # Ground against every section of the retrieved documents: a policy document is valid
    # as a whole even when only one of its sections ranked in the top-k.
    doc_ids = {s.get("doc_id") or s["id"].split("#")[0] for s in sources}
    siblings = [c.text for c in get_retriever().chunks if c.doc_id in doc_ids]
    source_text = " ".join([s["text"] for s in sources] + siblings)
    source_numbers = numbers_in(source_text)
    retrieved_ids = {s["id"] for s in sources}

    # 1. Personal data must never go back out in a reply.
    for item in find_pii(reply):
        findings.append({"code": "pii", "level": "error", "message": f"답변에 개인정보({item['type']})가 포함되어 있습니다."})

    # 2. Promises (refunds, Crystals, restoration, unbans) need policy support in the retrieved sources.
    for sentence in _sentences(reply):
        if not (PROMISE.search(sentence) and PROMISE_OBJECT.search(sentence)):
            continue
        objects = {m.lower()[:6] for m in PROMISE_OBJECT.findall(sentence)}
        grounded_object = any(o in source_text.lower() for o in objects)
        unsupported_numbers = numbers_in(sentence) - source_numbers
        if not sources or not grounded_object or unsupported_numbers:
            detail = f" (근거 없는 수치: {', '.join(sorted(unsupported_numbers))})" if unsupported_numbers else ""
            findings.append(
                {
                    "code": "unsupported_promise",
                    "level": "error",
                    "message": f"정책 근거 없는 약속일 수 있습니다{detail}: \"{sentence[:90]}\"",
                }
            )
            continue
        # The object is in the policy, but the policy restricts it ("cannot be refunded once...").
        restricted = [
            s for s in _sentences(source_text)
            if RESTRICTION.search(s) and any(o in s.lower() for o in objects)
        ]
        permitted = [
            s for s in _sentences(source_text)
            if not RESTRICTION.search(s) and any(o in s.lower() for o in objects)
        ]
        if restricted and not permitted and any(PROHIBITION.search(s) for s in restricted):
            findings.append(
                {
                    "code": "prohibited_promise",
                    "level": "error",
                    "message": f"정책상 상담원이 할 수 없는 약속입니다 — \"{restricted[0][:90]}\"",
                }
            )
        elif restricted:
            findings.append(
                {
                    "code": "conditional_policy",
                    "level": "warning",
                    "message": f"조건이 있는 정책입니다. 고객이 조건을 충족하는지 확인하세요 — \"{restricted[0][:90]}\"",
                }
            )

    # 3. Over-confident wording that support policy does not allow.
    for m in ABSOLUTE.finditer(reply):
        findings.append({"code": "absolute_wording", "level": "warning", "message": f"단정적 표현 \"{m.group()}\" — 처리 기간·결과를 보장하지 않도록 수정하세요."})

    # 4. Citations must point at chunks that were actually retrieved.
    for cid in cited_ids or []:
        if cid not in retrieved_ids:
            findings.append({"code": "ungrounded_citation", "level": "error", "message": f"검색되지 않은 근거 {cid}를 인용했습니다."})

    # 5. Translation fidelity: numbers and official terms must survive translation.
    if source_ko is not None:
        lost = numbers_in(source_ko) - numbers_in(reply)
        if lost:
            findings.append({"code": "number_mismatch", "level": "error", "message": f"번역문에서 숫자가 빠지거나 바뀌었습니다: {', '.join(sorted(lost))}"})
        for term in missing_terms(source_ko, reply):
            findings.append({"code": "glossary", "level": "warning", "message": f"용어집: '{term['ko']}'는 \"{term['en']}\"로 번역해야 합니다."})

    # 6. Channel format.
    if channel == "email":
        if not re.match(r"^\s*(hi|hello|dear)\b", reply, re.I):
            findings.append({"code": "email_greeting", "level": "warning", "message": "이메일 첫 줄에 인사말(Hi/Hello/Dear)이 없습니다."})
        if not re.search(r"(regards|sincerely|best|thank you)[,!.]?\s*\n", reply, re.I):
            findings.append({"code": "email_signoff", "level": "warning", "message": "이메일 맺음말과 서명이 없습니다."})
    elif len(reply) > 700:
        findings.append({"code": "chat_length", "level": "warning", "message": "채팅 답변이 깁니다(700자 초과). 핵심만 짧게 줄이세요."})

    return {
        "passed": not any(f["level"] == "error" for f in findings),
        "findings": findings,
    }
