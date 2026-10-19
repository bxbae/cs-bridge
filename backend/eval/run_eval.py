"""Offline evaluation: triage accuracy, retrieval Hit@k, guard accuracy and latency.

    python -m eval.run_eval                 # uses LLM_PROVIDER (default: mock)
    LLM_PROVIDER=anthropic python -m eval.run_eval

Writes eval/report.md so results can be tracked over time.
"""
import json
import os
import statistics
import time
from collections import Counter
from pathlib import Path

os.environ.setdefault("SEED_DEMO", "0")

from app.pipeline import steps  # noqa: E402
from app.pipeline.retrieve import get_retriever  # noqa: E402
from app.pipeline.validate import check_reply  # noqa: E402
from app.service import get_llm  # noqa: E402

HERE = Path(__file__).parent


def load(name):
    return [json.loads(line) for line in (HERE / name).read_text(encoding="utf-8").splitlines() if line.strip()]


def outcome(result) -> str:
    if not result["passed"]:
        return "block"
    return "warn" if result["findings"] else "pass"


def main():
    llm = get_llm()
    triage = load("triage_cases.jsonl")
    guards = load("guard_cases.jsonl")

    cat_ok, hit1, hit3, doc3, latencies, misses = 0, 0, 0, 0, [], []
    confusion = Counter()
    answerable = [c for c in triage if c["expected_chunk"]]
    for case in triage:
        start = time.perf_counter()
        analysis = steps.analyze(llm, case["message"], "chat")
        sources = steps.retrieve(analysis["search_query"], case["message"], analysis["category"])
        latencies.append((time.perf_counter() - start) * 1000)
        cat_ok += analysis["category"] == case["category"]
        confusion[(case["category"], analysis["category"])] += 1
        if case["expected_chunk"]:
            ids = [s["id"] for s in sources]
            hit1 += bool(ids) and ids[0] == case["expected_chunk"]
            hit3 += case["expected_chunk"] in ids
            doc3 += case["expected_chunk"].split("#")[0] in {i.split("#")[0] for i in ids}
            if case["expected_chunk"] not in ids:
                misses.append(f"- `{case['message']}` → expected {case['expected_chunk']}, got {ids}")
        if analysis["category"] != case["category"]:
            misses.append(f"- category: `{case['message']}` → expected {case['category']}, got {analysis['category']}")

    retriever = get_retriever()
    guard_ok = 0
    guard_rows = []
    for g in guards:
        res = check_reply(g["reply"], g["channel"], retriever.search(g["source_query"], top_k=3), source_ko=g["source_ko"])
        got = outcome(res)
        guard_ok += got == g["expected"]
        guard_rows.append(f"| {g['reply'][:60]} | {g['expected']} | {got} | {'✅' if got == g['expected'] else '❌'} |")
    must_block = [g for g in guards if g["expected"] == "block"]
    caught = sum(1 for g in must_block if outcome(check_reply(g["reply"], g["channel"], retriever.search(g["source_query"], top_k=3), source_ko=g["source_ko"])) == "block")

    n, na = len(triage), len(answerable)
    metrics = {
        "provider": llm.name,
        "triage_cases": n,
        "category_accuracy": round(cat_ok / n, 3),
        "retrieval_hit@1": round(hit1 / na, 3),
        "retrieval_hit@3": round(hit3 / na, 3),
        "retrieval_doc_hit@3": round(doc3 / na, 3),
        "guard_cases": len(guards),
        "guard_accuracy": round(guard_ok / len(guards), 3),
        "guard_block_recall": round(caught / len(must_block), 3),
        "triage_latency_ms_p50": round(statistics.median(latencies), 1),
    }
    report = [
        "# CS Bridge evaluation report", "",
        f"Provider: **{metrics['provider']}**", "",
        "| Metric | Value |", "|---|---|",
        *[f"| {k} | {v} |" for k, v in metrics.items() if k != "provider"],
        "", "## Guard cases", "", "| Reply | Expected | Got | |", "|---|---|---|---|", *guard_rows,
        "", "## Misses", "", *(misses or ["- none"]),
    ]
    (HERE / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
    if misses:
        print("\n".join(misses))


if __name__ == "__main__":
    main()
