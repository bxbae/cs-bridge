"""Service terminology (Korean -> customer-facing English) kept consistent across replies."""
import json
from functools import lru_cache
from pathlib import Path

from ..config import settings


@lru_cache
def load_glossary(path: str | None = None) -> dict[str, str]:
    data = json.loads(Path(path or settings.glossary_path).read_text(encoding="utf-8"))
    # Longest Korean term first so "길드 레이드" wins over "길드".
    return dict(sorted(data.items(), key=lambda kv: -len(kv[0])))


def terms_in(text_ko: str, glossary: dict[str, str] | None = None) -> dict[str, str]:
    glossary = glossary or load_glossary()
    remaining = text_ko
    hits: dict[str, str] = {}
    for ko, en in glossary.items():
        if ko in remaining:
            hits[ko] = en
            remaining = remaining.replace(ko, " ")
    return hits


def missing_terms(text_ko: str, text_en: str, glossary: dict[str, str] | None = None) -> list[dict]:
    """Glossary terms used in the Korean source whose official English term is absent in the output."""
    lower = text_en.lower()
    return [
        {"ko": ko, "en": en}
        for ko, en in terms_in(text_ko, glossary).items()
        if en.lower() not in lower
    ]


def glossary_block(glossary: dict[str, str] | None = None) -> str:
    glossary = glossary or load_glossary()
    return "\n".join(f"- {ko} => {en}" for ko, en in glossary.items())
