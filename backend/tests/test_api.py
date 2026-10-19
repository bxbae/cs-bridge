from fastapi.testclient import TestClient

from app.main import app


def test_full_agent_flow():
    with TestClient(app) as c:
        conv = c.post("/api/conversations", json={
            "channel": "email", "customer_name": "Taylor Chen", "subject": "Compensation?",
            "message": "Hi team, the maintenance on Wednesday was extended by 2 hours and I missed the Guild Raid event. Will there be any compensation?",
        }).json()
        cid = conv["id"]
        first = conv["messages"][0]
        assert first["text_ko"].startswith("안녕하세요")
        assert conv["category"] == "maintenance"
        assert first["analysis"]["sources"][0]["id"] == "KB-PAT-01#3"
        assert len(first["analysis"]["drafts"]) == 3

        # A translation that invents an amount is blocked by the guard.
        bad = c.post(f"/api/conversations/{cid}/translate", json={"text_ko": "점검 보상으로 크리스탈 500개를 바로 보내드리겠습니다."}).json()
        assert bad["validation"]["passed"] is False
        assert c.post(f"/api/conversations/{cid}/agent-messages", json={"text": bad["reply"]}).status_code == 422

        good = c.post(f"/api/conversations/{cid}/translate", json={
            "text_ko": "점검 연장으로 불편을 드려 죄송합니다. 공식 공지된 연장의 경우 7일 안에 접속하시면 우편함으로 크리스탈 300개가 지급됩니다."
        }).json()
        assert good["validation"]["passed"] is True
        assert good["reply"].startswith("Hi Taylor")

        draft = first["analysis"]["drafts"][1]
        sent = c.post(f"/api/conversations/{cid}/agent-messages", json={
            "text": draft["reply"], "draft_style": draft["style"], "draft_text": draft["reply"],
        })
        assert sent.status_code == 201

        summary = c.post(f"/api/conversations/{cid}/summary").json()
        assert summary["category"] == "maintenance" and summary["resolved"] is True

        kpi = c.get("/api/kpi").json()
        assert kpi["accepted_as_is"] >= 1 and kpi["drafts_generated"] >= 3


def test_customer_pii_is_masked_before_llm():
    with TestClient(app) as c:
        conv = c.post("/api/conversations", json={
            "channel": "chat", "customer_name": "Kim",
            "message": "My card 4111 1111 1111 1111 was charged twice!!",
        }).json()
        cls = conv["messages"][0]["analysis"]["classification"]
        assert cls["pii_masked"] == ["card"]
        assert "4111" not in cls["search_query"]
        assert conv["urgency"] == "high"
