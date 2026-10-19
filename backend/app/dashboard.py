"""Aggregates for the dashboard page: daily trend, mix, queue and guard findings."""
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .models import Conversation, FeedbackEvent

URGENCY_RANK = {"high": 0, "medium": 1, "low": 2, None: 3}


def _local_date(dt: datetime, tz: ZoneInfo) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz).date()


def build_dashboard(db: Session, days: int = 14) -> dict:
    tz = ZoneInfo(settings.timezone)
    today = datetime.now(tz).date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)

    convs = db.scalars(select(Conversation).options(selectinload(Conversation.messages))).all()
    events = db.scalars(select(FeedbackEvent)).all()

    day_keys = [start + timedelta(days=i) for i in range(days)]
    daily = {d: {"date": d.isoformat(), "chat": 0, "email": 0, "replies": 0, "from_draft": 0, "blocked": 0, "drafts": 0} for d in day_keys}

    period_convs, prev_count = [], 0
    latencies: list[int] = []
    findings = Counter()
    for c in convs:
        d = _local_date(c.created_at, tz)
        if start <= d <= today:
            period_convs.append(c)
            daily[d][c.channel] += 1
        elif prev_start <= d < start:
            prev_count += 1
        for m in c.messages:
            md = _local_date(m.created_at, tz)
            if not (start <= md <= today):
                continue
            if m.role == "agent":
                daily[md]["replies"] += 1
            elif m.analysis:
                drafts = m.analysis.get("drafts", [])
                daily[md]["drafts"] += len(drafts)
                daily[md]["blocked"] += sum(1 for dr in drafts if not dr["validation"]["passed"])
                for dr in drafts:
                    findings.update(f["code"] for f in dr["validation"]["findings"])
                if "timings_ms" in m.analysis:
                    latencies.append(m.analysis["timings_ms"]["total"])

    adopted = manual = 0
    for e in events:
        d = _local_date(e.created_at, tz)
        if start <= d <= today and e.action in {"accepted", "edited"}:
            daily[d]["from_draft"] += 1
            adopted += 1
        elif start <= d <= today and e.action == "manual":
            manual += 1

    open_waiting = [c for c in convs if c.status == "open" and c.messages and c.messages[-1].role == "customer"]
    now = datetime.now(timezone.utc)
    queue = sorted(open_waiting, key=lambda c: (URGENCY_RANK.get(c.urgency, 3), c.messages[-1].created_at))[:5]

    recent = []
    for c in convs:
        for m in c.messages:
            recent.append((m.created_at if m.created_at.tzinfo else m.created_at.replace(tzinfo=timezone.utc), c, m))
    recent.sort(key=lambda r: r[0], reverse=True)

    total = len(period_convs)
    week_start = today - timedelta(days=6)
    this_week = sum(1 for c in period_convs if _local_date(c.created_at, tz) >= week_start)
    last_week = sum(1 for c in convs if week_start - timedelta(days=7) <= _local_date(c.created_at, tz) < week_start)
    return {
        "days": days,
        "timezone": settings.timezone,
        "daily": [
            {**v, "inquiries": v["chat"] + v["email"],
             "adoption_rate": round(v["from_draft"] / v["replies"], 3) if v["replies"] else None}
            for v in daily.values()
        ],
        "totals": {
            "inquiries": total,
            "inquiries_prev": prev_count,
            "inquiries_delta": round((total - prev_count) / prev_count, 3) if prev_count else None,
            "week": this_week,
            "week_prev": last_week,
            "week_delta": round((this_week - last_week) / last_week, 3) if last_week else None,
            "replies": sum(v["replies"] for v in daily.values()),
            "adoption_rate": round(adopted / (adopted + manual), 3) if adopted + manual else None,
            "avg_first_draft_ms": round(sum(latencies) / len(latencies)) if latencies else None,
            "drafts": sum(v["drafts"] for v in daily.values()),
            "blocked": sum(v["blocked"] for v in daily.values()),
            "open_waiting": len(open_waiting),
            "high_waiting": sum(1 for c in open_waiting if c.urgency == "high"),
        },
        "by_category": dict(Counter(c.category or "other" for c in period_convs).most_common()),
        "by_status": dict(Counter(c.status for c in convs)),
        "guard_findings": dict(findings.most_common(6)),
        "queue": [
            {
                "id": c.id, "customer_name": c.customer_name, "channel": c.channel, "category": c.category,
                "urgency": c.urgency, "sentiment": c.sentiment,
                "preview": (c.messages[-1].text_ko or c.messages[-1].text)[:90],
                "waiting_minutes": max(0, int((now - (c.messages[-1].created_at if c.messages[-1].created_at.tzinfo else c.messages[-1].created_at.replace(tzinfo=timezone.utc))).total_seconds() // 60)),
            }
            for c in queue
        ],
        "recent": [
            {
                "conversation_id": c.id, "customer_name": c.customer_name, "channel": c.channel, "role": m.role,
                "category": c.category, "at": at.isoformat(),
                "text": ((m.text_ko if m.role == "customer" else m.text) or m.text)[:110],
            }
            for at, c, m in recent[:8]
        ],
    }
