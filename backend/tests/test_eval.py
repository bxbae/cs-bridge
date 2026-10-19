import json

from app.llm.base import LLMError
from app.llm.mock_provider import MockProvider


class FlakyTrackedProvider(MockProvider):
    """Mock answers plus Anthropic-style usage tracking; every 7th call fails."""
    name = "flaky"
    model, effort = "fake-model", "low"

    def __init__(self):
        self.calls = 0
        self.usage = {}

    def complete_json(self, task, system, user, context):
        self.calls += 1
        u = self.usage.setdefault(task, {"calls": 0, "input_tokens": 0, "output_tokens": 0, "seconds": [], "stop_reasons": {}})
        u["calls"] += 1
        u["input_tokens"] += 200
        u["output_tokens"] += 50
        u["stop_reasons"]["end_turn"] = u["stop_reasons"].get("end_turn", 0) + 1
        if self.calls % 7 == 0:
            raise LLMError(f"{task}: simulated failure")
        return super().complete_json(task, system, user, context)


def test_eval_isolates_failures_and_reports_tokens(monkeypatch, tmp_path):
    import eval.run_eval as ev

    monkeypatch.setattr(ev, "get_llm", lambda: FlakyTrackedProvider())
    monkeypatch.setattr(ev, "HERE", tmp_path)
    for name in ("triage_cases.jsonl", "guard_cases.jsonl", "translate_cases.jsonl"):
        (tmp_path / name).write_text((ev.Path(ev.__file__).parent / name).read_text(encoding="utf-8"), encoding="utf-8")
    ev.main()
    m = json.loads((tmp_path / "metrics-flaky.json").read_text(encoding="utf-8"))
    assert m["llm_errors"] > 0  # failures counted, run completed
    assert m["tokens"]["analyze"]["calls"] > 0 and m["tokens"]["drafts"]["avg_output_per_call"] == 50
    assert m["guard_accuracy"] == 1.0  # rule-based part unaffected
    assert "## Tokens by task" in (tmp_path / "report-flaky.md").read_text(encoding="utf-8")
