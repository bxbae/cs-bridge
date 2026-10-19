from fastapi.testclient import TestClient

from app.main import app


def test_dashboard_shape_and_counts():
    with TestClient(app) as c:
        c.post("/api/conversations", json={"channel": "chat", "customer_name": "A", "message": "I can't log in, error 1002"})
        c.post("/api/conversations", json={"channel": "email", "customer_name": "B", "message": "refund my season pass"})
        d = c.get("/api/dashboard?days=7").json()
        assert len(d["daily"]) == 7
        today = d["daily"][-1]
        assert today["chat"] >= 1 and today["email"] >= 1
        assert d["totals"]["open_waiting"] >= 2
        assert d["queue"] and {"id", "urgency", "waiting_minutes"} <= d["queue"][0].keys()
        assert sum(d["by_category"].values()) == d["totals"]["inquiries"]
