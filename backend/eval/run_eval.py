"""Evaluation: triage, retrieval, draft safety, translation fidelity, guards, latency, tokens.

    python -m eval.run_eval                                   # LLM_PROVIDER (default: mock)
    LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... python -m eval.run_eval

Writes eval/report-<provider>.md and eval/metrics-<provider>.json (mock also keeps
eval/report.md for history). Each case is isolated: one failed LLM call is counted as an
error instead of stopping the run.
"""
import json
import os
import statistics
import time
from collections import Counter
from pathlib import Path

os.environ.setdefault("SEED_DEMO", "0")

from app.config import settings  # noqa: E402
from app.llm.base import LLMError  # noqa: E402
from app.pipeline import steps  # noqa: E402
from app.pipeline.retrieve import get_retriever  # noqa: E402
from app.pipeline.validate import check_reply  # noqa: E402
from app.service import get_llm  # noqa: E402

HERE = Path(__file__).parent
DRAFT_RISK_CODES = ("unsupported_promise", "prohibited_promise", "ungrounded_citation", "pii")


def load(name):
    return [json.loads(line) for line in (HERE / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def outcome(result) -> str:
    if not result["passed"]:
        return "block"
    return "warn" if result["findings"] else "pass"


def pctl(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return round(s[min(len(s) - 1, int(round(q * (len(s) - 1))))], 1)


def rate(n: int, d: int) -> float | None:
    return round(n / d, 3) if d else None


def main():
    llm = get_llm()
    retriever = get_retriever()
    triage = load("triage_cases.jsonl")
    guards = load("guard_cases.jsonl")
    translations = load("translate_cases.jsonl")
    lat = {"analyze": [], "retrieve": [], "drafts": [], "translate": []}
    errors: list[str] = []
    misses: list[str] = []

    # ---------- 1. triage + retrieval + drafts (one pass per inquiry) ----------
    cat_ok = hit1 = hit3 = doc3 = 0
    answerable = [c for c in triage if c["expected_chunk"]]
    draft_total = draft_passed = cases_with_safe_draft = drafted_cases = 0
    risk = Counter()
    for case in triage:
        try:
            t = time.perf_counter()
            analysis = steps.analyze(llm, case["message"], "chat")
            lat["analyze"].append((time.perf_counter() - t) * 1000)
            t = time.perf_counter()
            sources = steps.retrieve(analysis["search_query"], case["message"], analysis["category"])
            lat["retrieve"].append((time.perf_counter() - t) * 1000)
        except LLMError as exc:
            errors.append(f"analyze: `{case['message'][:50]}` → {exc}")
            continue
        cat_ok += analysis["category"] == case["category"]
        if analysis["category"] != case["category"]:
            misses.append(f"- category: `{case['message']}` → expected {case['category']}, got {analysis['category']}")
        if case["expected_chunk"]:
            ids = [s["id"] for s in sources]
            hit1 += bool(ids) and ids[0] == case["expected_chunk"]
            hit3 += case["expected_chunk"] in ids
            doc3 += case["expected_chunk"].split("#")[0] in {i.split("#")[0] for i in ids}
            if case["expected_chunk"] not in ids:
                misses.append(f"- retrieval: `{case['message']}` → expected {case['expected_chunk']}, got {ids}")
        try:
            t = time.perf_counter()
            drafts = steps.drafts(
                llm, channel="chat", customer_name="Alex Kim", language=analysis["language"], category=analysis["category"],
                sentiment=analysis["sentiment"], history=[{"role": "customer", "text": case["message"]}], sources=sources,
            )
            lat["drafts"].append((time.perf_counter() - t) * 1000)
        except LLMError as exc:
            errors.append(f"drafts: `{case['message'][:50]}` → {exc}")
            continue
        drafted_cases += 1
        draft_total += len(drafts)
        passed = [d for d in drafts if d["validation"]["passed"]]
        draft_passed += len(passed)
        cases_with_safe_draft += bool(passed)
        for d in drafts:
            for f in d["validation"]["findings"]:
                if f["code"] in DRAFT_RISK_CODES:
                    risk[f["code"]] += 1
                    misses.append(f"- draft {d['style']} [{f['code']}]: `{case['message'][:60]}` → {f['message'][:120]}")

    # ---------- 2. translation fidelity (Korean agent reply → customer language) ----------
    tr_ok = tr_numbers_ok = tr_glossary_ok = tr_done = 0
    for case in translations:
        sources = retriever.search(case["source_query"], top_k=3)
        try:
            t = time.perf_counter()
            res = steps.translate_reply(llm, text_ko=case["text_ko"], channel=case["channel"], customer_name="Alex Kim", language="en", sources=sources)
            lat["translate"].append((time.perf_counter() - t) * 1000)
        except LLMError as exc:
            errors.append(f"translate: `{case['text_ko'][:30]}` → {exc}")
            continue
        tr_done += 1
        codes = {f["code"] for f in res["validation"]["findings"]}
        tr_ok += res["validation"]["passed"]
        tr_numbers_ok += "number_mismatch" not in codes
        tr_glossary_ok += "glossary" not in codes
        for f in res["validation"]["findings"]:
            if f["level"] == "error" or f["code"] == "glossary":
                misses.append(f"- translate [{f['code']}]: `{case['text_ko'][:40]}` → {f['message'][:120]}")

    # ---------- 3. guards (rule-based: identical for every provider) ----------
    guard_ok = caught = 0
    guard_rows = []
    must_block = [g for g in guards if g["expected"] == "block"]
    for g in guards:
        got = outcome(check_reply(g["reply"], g["channel"], retriever.search(g["source_query"], top_k=3), source_ko=g["source_ko"]))
        guard_ok += got == g["expected"]
        caught += g["expected"] == "block" and got == "block"
        guard_rows.append(f"| {g['reply'][:60]} | {g['expected']} | {got} | {'✅' if got == g['expected'] else '❌'} |")

    n, na = len(triage), len(answerable)
    metrics = {
        "provider": llm.name,
        "model": getattr(llm, "model", None),
        "effort": getattr(llm, "effort", None),
        "triage_cases": n,
        "category_accuracy": rate(cat_ok, n),
        "retrieval_hit@1": rate(hit1, na),
        "retrieval_hit@3": rate(hit3, na),
        "retrieval_doc_hit@3": rate(doc3, na),
        "drafts_generated": draft_total,
        "draft_guard_pass_rate": rate(draft_passed, draft_total),
        "cases_with_a_safe_draft": rate(cases_with_safe_draft, drafted_cases),
        "draft_risk_findings": dict(risk),
        "translation_cases": len(translations),
        "translation_guard_pass_rate": rate(tr_ok, tr_done),
        "translation_numbers_preserved": rate(tr_numbers_ok, tr_done),
        "translation_glossary_compliance": rate(tr_glossary_ok, tr_done),
        "guard_cases": len(guards),
        "guard_accuracy": rate(guard_ok, len(guards)),
        "guard_block_recall": rate(caught, len(must_block)),
        "latency_ms": {k: {"p50": pctl(v, 0.5), "p95": pctl(v, 0.95)} for k, v in lat.items()},
        "first_draft_ms_p50": pctl([a + r + d for a, r, d in zip(lat["analyze"], lat["retrieve"], lat["drafts"])], 0.5),
        "llm_errors": len(errors),
    }
    usage = getattr(llm, "usage", None)
    if usage:
        metrics["tokens"] = {
            task: {"calls": u["calls"], "input": u["input_tokens"], "output": u["output_tokens"],
                   "avg_output_per_call": round(u["output_tokens"] / u["calls"]) if u["calls"] else 0,
                   "stop_reasons": u["stop_reasons"]}
            for task, u in usage.items()
        }

    def row(label, key, fmt=lambda v: v):
        v = metrics.get(key)
        return f"| {label} | {'–' if v is None else fmt(v)} |"

    pct = lambda v: f"{v * 100:.1f}%"  # noqa: E731
    report = [
        f"# CS Bridge evaluation — {metrics['provider']}" + (f" ({metrics['model']}, effort={metrics['effort']})" if metrics["model"] else ""),
        "",
        "## Summary",
        "",
        "| Metric | Value |", "|---|---|",
        row("Category accuracy (30)", "category_accuracy", pct),
        row("Retrieval Hit@1 (28)", "retrieval_hit@1", pct),
        row("Retrieval Hit@3 (28)", "retrieval_hit@3", pct),
        row("Drafts passing guards", "draft_guard_pass_rate", pct),
        row("Inquiries with ≥1 sendable draft", "cases_with_a_safe_draft", pct),
        row("Translation: numbers preserved (10)", "translation_numbers_preserved", pct),
        row("Translation: glossary compliance (10)", "translation_glossary_compliance", pct),
        row("Translation: guard pass", "translation_guard_pass_rate", pct),
        row("Guard accuracy (12, rule-based)", "guard_accuracy", pct),
        row("Guard block recall", "guard_block_recall", pct),
        row("First draft latency p50 (ms)", "first_draft_ms_p50"),
        row("LLM call errors", "llm_errors"),
        "",
        "## Latency by stage (ms)", "", "| Stage | p50 | p95 |", "|---|---|---|",
        *[f"| {k} | {v['p50']} | {v['p95']} |" for k, v in metrics["latency_ms"].items()],
        "",
    ]
    if metrics.get("tokens"):
        report += ["## Tokens by task", "", "| Task | Calls | Input | Output | Avg output/call | Stop reasons |", "|---|---|---|---|---|---|",
                   *[f"| {k} | {v['calls']} | {v['input']} | {v['output']} | {v['avg_output_per_call']} | {v['stop_reasons']} |" for k, v in metrics["tokens"].items()], ""]
    report += [f"Draft risk findings: {dict(risk) or 'none'}", "",
               "## Guard cases", "", "| Reply | Expected | Got | |", "|---|---|---|---|", *guard_rows,
               "", "## Misses and findings", "", *(misses or ["- none"]),
               "", "## Errors", "", *(f"- {e}" for e in errors or ["none"])]

    name = metrics["provider"]
    (HERE / f"report-{name}.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    (HERE / f"metrics-{name}.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if name == "mock":
        (HERE / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("latency_ms", "tokens")}, indent=2, ensure_ascii=False))
    if errors:
        print(f"{len(errors)} LLM errors (see report)")


if __name__ == "__main__":
    main()
