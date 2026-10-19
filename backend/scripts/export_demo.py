"""Export a static demo snapshot for the browser-only build (GitHub Pages).

Runs the real backend (mock provider, fresh database, demo seed) and writes:
  frontend/public/demo/snapshot.json   data the static site serves instead of the API
  frontend/scripts/demo-parity.json    guard inputs + Python results, used to prove the
                                       TypeScript port of the guards gives identical output

    python -m scripts.export_demo
"""
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
tmp = tempfile.mkdtemp()
os.environ.update({"DATABASE_URL": f"sqlite:///{tmp}/demo.db", "LLM_PROVIDER": "mock", "SEED_DEMO": "1", "SEED_HISTORY": "1"})
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import service  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.llm.mock_provider import FIXTURES  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Conversation, FeedbackEvent  # noqa: E402
from app.pipeline.retrieve import get_retriever  # noqa: E402
from app.pipeline.validate import check_reply  # noqa: E402

NAME = "__NAME__"  # placeholder customer name in cached drafts; replaced in the browser


def preset_messages() -> list[dict]:
    src = (ROOT / "frontend/components/NewInquiryModal.tsx").read_text(encoding="utf-8")
    return [{"channel": ch, "message": json.loads(msg)}
            for ch, msg in re.findall(r'channel: "(chat|email)".*?message: ("(?:[^"\\]|\\.)*")', src)]


def main():
    with TestClient(app) as c:
        listing = c.get("/api/conversations").json()
        snapshot = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "health": {**c.get("/api/health").json(), "llm_provider": "demo"},
            "conversations": [c.get(f"/api/conversations/{x['id']}").json() for x in listing],
            "dashboards": {str(d): c.get(f"/api/dashboard?days={d}").json() for d in (7, 14, 30, 60)},
            "kb": [{**k, "doc_id": k["id"].split("#")[0]} for k in c.get("/api/kb").json()],
            "glossary": c.get("/api/glossary").json(),
            "translate_fixtures": FIXTURES["translate"],
            "settings": {"agent_name": "Eric", "brand_name": "Starfall Odyssey Support"},
        }
        with SessionLocal() as db:
            snapshot["feedback"] = [
                {"conversation_id": e.conversation_id, "action": e.action, "edit_ratio": e.edit_ratio, "draft_style": e.draft_style}
                for e in db.scalars(select(FeedbackEvent))
            ]

            # Pipeline results for inquiries the demo can analyze: modal presets + eval messages.
            eval_msgs = [json.loads(l)["message"] for l in (ROOT / "backend/eval/triage_cases.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
            todo = preset_messages() + [{"channel": ch, "message": m} for m in eval_msgs for ch in ("chat", "email")]
            cache = {}
            for item in todo:
                conv = service.create_conversation(db, channel=item["channel"], customer_name=NAME, message=item["message"])
                msg = conv.messages[0]
                cache[f"{item['channel']}|{item['message']}"] = {"text_ko": msg.text_ko, "analysis": msg.analysis}
                db.delete(conv)
                db.commit()
            snapshot["pipeline_cache"] = cache

    out = ROOT / "frontend/public/demo/snapshot.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")

    # Parity cases: eval guard cases, every stored draft, and translation-style checks.
    retriever = get_retriever()
    cases = []
    for line in (ROOT / "backend/eval/guard_cases.jsonl").read_text(encoding="utf-8").splitlines():
        g = json.loads(line)
        src = retriever.search(g["source_query"], top_k=3)
        cases.append({"reply": g["reply"], "channel": g["channel"], "sources": src, "cited_ids": None, "source_ko": g["source_ko"]})
    for conv in snapshot["conversations"]:
        for m in conv["messages"]:
            for d in (m.get("analysis") or {}).get("drafts", []):
                cases.append({"reply": d["reply"], "channel": conv["channel"], "sources": m["analysis"]["sources"], "cited_ids": d["source_ids"], "source_ko": None})
    extra = [
        ("Hi Sam, we will lift your suspension and send you 500 Crystals right away. Email me at sam@gmail.com", "chat", "account banned appeal", None),
        ("We will send you 500 Crystals right away as maintenance compensation.", "email", "maintenance extended compensation", "점검 보상으로 크리스탈 500개를 바로 보내드리겠습니다."),
        ("Please wait 3 days for the review.", "chat", "ban appeal", "이의 신청 결과는 영업일 3일, 최대 5일 안에 드립니다."),
        ("Card 4111 1111 1111 1111 and order GPA.3381-2210-4467-12345, call +1 415-555-0132", "chat", "purchase missing", None),
        ("x" * 720, "chat", "login error", None),
    ]
    for reply, ch, q, ko in extra:
        cases.append({"reply": reply, "channel": ch, "sources": retriever.search(q, top_k=3), "cited_ids": None, "source_ko": ko})
    for c_ in cases:
        c_["expected"] = check_reply(c_["reply"], c_["channel"], c_["sources"], cited_ids=c_["cited_ids"], source_ko=c_["source_ko"])
    parity = ROOT / "frontend/scripts/demo-parity.json"
    parity.parent.mkdir(parents=True, exist_ok=True)
    parity.write_text(json.dumps({"kb": snapshot["kb"], "glossary": snapshot["glossary"], "cases": cases}, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"snapshot: {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB), "
          f"{len(snapshot['conversations'])} conversations, {len(cache)} cached analyses; parity cases: {len(cases)}")


if __name__ == "__main__":
    main()
