"""Knowledge-base retrieval.

The KB is a folder of Markdown documents; each "## " section becomes one chunk with an id
like KB-REF-01#2. Ranking is BM25 so it runs offline with no model download. The
`Retriever` interface is small on purpose: a pgvector + embedding retriever can replace it.
"""
import math
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from ..config import settings

STOPWORDS = set(
    "a an the and or but if to of in on for with at by from is are was were be been am i me my we our "
    "you your it its this that these those do did does have has had can could would should will just "
    "not no so as please hi hello thanks thank any some what when why how who which there here".split()
)


@dataclass
class Chunk:
    id: str
    doc_id: str
    category: str
    title: str
    section: str
    text: str
    text_ko: str

    @property
    def tokens(self) -> list[str]:
        return tokenize(f"{self.title} {self.section} {self.text}")


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > 4 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def tokenize(text: str) -> list[str]:
    return [_stem(w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in STOPWORDS]


# Customers and the KB describe the same problem with different words. Expanding the query
# with CS synonyms closes the most common gaps that pure keyword search misses.
SYNONYMS = {
    "bought": ["purchas"], "buy": ["purchas"], "paid": ["purchas", "payment"], "pay": ["payment"],
    "got": ["receiv"], "get": ["receiv"], "never": ["receiv"], "missing": ["receiv"], "arrived": ["receiv"],
    "gem": ["crystal"], "diamond": ["crystal"], "currency": ["crystal"],
    "ban": ["suspend", "suspension"], "banned": ["suspend", "suspension"], "locked": ["suspend"],
    "money": ["refund"], "back": ["refund"], "cancel": ["refund"], "reimburse": ["refund"],
    "twice": ["duplicate"], "double": ["duplicate"], "charged": ["charg", "payment"],
    "hack": ["compromis"], "hacked": ["compromis"], "stolen": ["compromis"],
    "lag": ["disconnect"], "crash": ["disconnect", "bug"], "kicked": ["disconnect"], "freeze": ["disconnect"],
    "glitch": ["bug"], "broken": ["bug"], "disappeared": ["lost", "bug"], "vanished": ["lost", "bug"],
    "downtime": ["maintenance"], "extended": ["extend", "maintenance"], "delay": ["extend"],
    "reward": ["compensation"], "compensate": ["compensation"],
}


def expand_query(text: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", text.lower())
    tokens = tokenize(text)
    for w in raw:
        tokens.extend(SYNONYMS.get(w, []))
    return tokens


def parse_kb(kb_dir: Path) -> list[Chunk]:
    chunks: list[Chunk] = []
    for path in sorted(kb_dir.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        title = re.search(r"^# (.+)$", raw, re.M).group(1).strip()
        doc_id = re.search(r"^id:\s*(\S+)", raw, re.M).group(1)
        category = re.search(r"^category:\s*(\S+)", raw, re.M).group(1)
        for n, part in enumerate(re.split(r"^## ", raw, flags=re.M)[1:], start=1):
            section, _, body = part.partition("\n")
            ko = re.search(r"^> ko:\s*(.+)$", body, re.M)
            body = re.sub(r"^> ko:.*$", "", body, flags=re.M).strip()
            chunks.append(
                Chunk(
                    id=f"{doc_id}#{n}",
                    doc_id=doc_id,
                    category=category,
                    title=title,
                    section=section.strip(),
                    text=" ".join(body.split()),
                    text_ko=ko.group(1).strip() if ko else "",
                )
            )
    return chunks


class BM25Retriever:
    def __init__(self, chunks: list[Chunk], k1: float = 1.4, b: float = 0.75):
        self.chunks = chunks
        self.k1, self.b = k1, b
        self.docs = [Counter(c.tokens) for c in chunks]
        self.lengths = [sum(d.values()) for d in self.docs]
        self.avg_len = sum(self.lengths) / max(len(self.lengths), 1)
        df = Counter(t for d in self.docs for t in d)
        n = len(chunks)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def search(self, query: str, top_k: int = 3, category_hint: str | None = None) -> list[dict]:
        q = expand_query(query)
        scored = []
        for chunk, doc, length in zip(self.chunks, self.docs, self.lengths):
            score = 0.0
            for t in q:
                tf = doc.get(t, 0)
                if tf:
                    score += self.idf[t] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * length / self.avg_len))
            if category_hint and chunk.category == category_hint:
                score *= 1.25  # the classifier's category is a soft prior, not a filter
            if score > 0:
                scored.append((score, chunk))
        scored.sort(key=lambda s: -s[0])
        return [
            {
                "id": c.id,
                "doc_id": c.doc_id,
                "category": c.category,
                "title": c.title,
                "section": c.section,
                "text": c.text,
                "text_ko": c.text_ko,
                "score": round(s, 3),
            }
            for s, c in scored[:top_k]
        ]


@lru_cache
def get_retriever() -> BM25Retriever:
    return BM25Retriever(parse_kb(settings.kb_dir))
