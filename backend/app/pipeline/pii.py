"""Mask personal data before it reaches the LLM, logs or a reply."""
import re

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# 13-19 digits, optionally grouped by spaces or dashes; confirmed with the Luhn check below.
CARD = re.compile(r"(?<![\w.])(?:\d[ -]?){12,18}\d(?![\w])")
# Formatted phone numbers only (+82 10-1234-5678, (415) 555-0132, 010-1234-5678).
PHONE = re.compile(r"(?<![\w.-])(?:\+\d{1,3}[ -]?)?(?:\(\d{2,4}\)|\d{2,4})[ -]\d{3,4}[ -]\d{4}(?![\w-])")

SUPPORT_DOMAINS = ("starfall-odyssey.com",)


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def find_pii(text: str) -> list[dict]:
    found: list[dict] = []
    for m in EMAIL.finditer(text):
        if not m.group().lower().endswith(SUPPORT_DOMAINS):
            found.append({"type": "email", "span": m.span()})
    for m in CARD.finditer(text):
        digits = re.sub(r"\D", "", m.group())
        if 13 <= len(digits) <= 19 and _luhn_ok(digits):
            found.append({"type": "card", "span": m.span()})
    for m in PHONE.finditer(text):
        if not any(f["span"][0] <= m.start() < f["span"][1] for f in found):
            found.append({"type": "phone", "span": m.span()})
    return sorted(found, key=lambda f: f["span"][0])


def mask_pii(text: str) -> tuple[str, list[str]]:
    """Return the text with personal data replaced by [EMAIL]/[CARD]/[PHONE] and the types found."""
    found = find_pii(text)
    out, last = [], 0
    for f in found:
        start, end = f["span"]
        if start < last:
            continue
        out.append(text[last:start])
        out.append(f"[{f['type'].upper()}]")
        last = end
    out.append(text[last:])
    return "".join(out), [f["type"] for f in found]
