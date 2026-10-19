"""Demo conversations created on first start (SEED_DEMO=0 to disable)."""

DEMO = [
    {
        "channel": "chat",
        "customer_name": "Alex Kim",
        "message": "Hi, I bought the 500 Crystals pack about an hour ago but nothing showed up in my mailbox. I already restarted the game twice. Can you help?",
    },
    {
        "channel": "email",
        "customer_name": "Jordan Lee",
        "customer_email": "jordan.lee@example.net",
        "subject": "Refund request - Season Pass",
        "message": "Hello, I bought the Season Pass yesterday by mistake and activated it before I realized. I would like a refund please. You can reach me at jordan.lee@gmail.com.",
    },
    {
        "channel": "chat",
        "customer_name": "Sam Rivera",
        "message": "This is ridiculous!! My account got banned for no reason. I have played for 3 years and never cheated. Unban me NOW.",
    },
    {
        "channel": "email",
        "customer_name": "Taylor Chen",
        "customer_email": "taylor.chen@example.org",
        "subject": "Maintenance extended - compensation?",
        "message": "Hi team, the maintenance on Wednesday was extended by 2 hours and I missed the Guild Raid event. Will there be any compensation?",
    },
]


# ---------------------------------------------------------------------------
# Demo history for the dashboard: real inquiry texts from the eval set, run through
# the actual pipeline, then backdated over the last 14 days. Agent actions are
# simulated (accept / edit / reject a draft) so the trend charts have something to show.
# Runs only with the offline mock provider unless SEED_HISTORY=1 (to avoid API cost).
# ---------------------------------------------------------------------------
import json  # noqa: E402
import random  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from pathlib import Path  # noqa: E402

NAMES = ["Chris Evans", "Mia Torres", "Noah Park", "Liam Brooks", "Emma Wright", "Olivia Chen", "Ethan Moore",
         "Ava Patel", "Lucas Silva", "Sofia Rossi", "Mason Lee", "Isabella Cruz", "Logan Diaz", "Zoe Kim",
         "Henry Adams", "Grace Liu", "Owen Clark", "Chloe Martin", "Jack Wilson", "Lily Nguyen"]


def seed_history(db, service, days: int = 14, rng_seed: int = 7) -> int:
    from .models import FeedbackEvent

    rng = random.Random(rng_seed)
    cases_path = Path(__file__).resolve().parents[1] / "eval" / "triage_cases.jsonl"
    messages = [json.loads(l)["message"] for l in cases_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    now = datetime.now(timezone.utc)
    created = 0
    for day in range(days - 1, 0, -1):  # 13 days ago .. yesterday; today belongs to the live demo
        for _ in range(rng.randint(1, 4) + (day % 3 == 0)):
            text = rng.choice(messages)
            channel = "email" if rng.random() < 0.4 else "chat"
            name = rng.choice(NAMES)
            conv = service.create_conversation(
                db, channel=channel, customer_name=name, message=text,
                subject=text[:48] if channel == "email" else None,
                customer_email=f"{name.split()[0].lower()}@example.com" if channel == "email" else None,
            )
            t0 = now - timedelta(days=day, hours=rng.randint(0, 9), minutes=rng.randint(0, 59))
            conv.created_at = conv.updated_at = t0
            conv.messages[0].created_at = t0

            drafts = [d for d in conv.messages[0].analysis.get("drafts", []) if d["validation"]["passed"]]
            roll = rng.random()
            if drafts and roll < 0.82:
                if rng.random() < 0.3:
                    service.record_rejection(db, conv, drafts[0]["style"])
                d = rng.choice(drafts)
                final = d["reply"] if rng.random() < 0.55 else d["reply"].replace("Hi ", "Hello ", 1) + (
                    "" if conv.channel == "email" else " Let me know if you need anything else.")
                msg = service.send_agent_message(db, conv, text=final, text_ko=None,
                                                 draft_style=d["style"], draft_text=d["reply"])
                t1 = t0 + timedelta(minutes=rng.randint(2, 40))
                msg.created_at = conv.updated_at = t1
                conv.status = "escalated" if conv.category in {"refund", "account"} and rng.random() < 0.35 else "resolved"
            elif roll < 0.92:
                # Agent ignored the drafts and wrote their own reply.
                first = name.split()[0]
                body = "Thanks for reaching out. I've passed this to the right team and will update you here shortly."
                text_out = f"Hi {first},\n\n{body}\n\nBest regards,\nEric\nStarfall Odyssey Support" if channel == "email" else f"Hi {first}! {body}"
                msg = service.send_agent_message(db, conv, text=text_out, text_ko=None, draft_style=None, draft_text=None)
                msg.created_at = conv.updated_at = t0 + timedelta(minutes=rng.randint(5, 50))
                conv.status = "resolved"
            # else: still open and waiting
            for e in db.scalars(__import__("sqlalchemy").select(FeedbackEvent).where(FeedbackEvent.conversation_id == conv.id)):
                e.created_at = t0 + timedelta(minutes=rng.randint(2, 40))
            db.commit()
            created += 1
    return created
