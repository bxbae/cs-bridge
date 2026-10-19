import os
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import service
from .config import settings
from .db import Base, SessionLocal, engine, get_db
from .llm.base import LLMError
from .models import Conversation
from .pipeline.retrieve import get_retriever
from .dashboard import build_dashboard
from .seed import DEMO, seed_history


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    if os.getenv("SEED_DEMO", "1") == "1":
        with SessionLocal() as db:
            if not db.scalar(select(Conversation.id).limit(1)):
                history = os.getenv("SEED_HISTORY", "auto")
                if history == "1" or (history == "auto" and service.get_llm().name == "mock"):
                    seed_history(db, service)
                for demo in DEMO:
                    service.create_conversation(db, **demo)
    yield


app = FastAPI(title="CS Bridge API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- schemas ----------
class NewConversation(BaseModel):
    channel: Literal["chat", "email"]
    customer_name: str = Field(min_length=1, max_length=100)
    customer_email: str | None = None
    subject: str | None = None
    message: str = Field(min_length=1, max_length=8000)


class CustomerMessage(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class TranslateRequest(BaseModel):
    text_ko: str = Field(min_length=1, max_length=8000)


class AgentMessage(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    text_ko: str | None = None
    draft_style: str | None = None
    draft_text: str | None = None


class Rejection(BaseModel):
    draft_style: str | None = None


class StatusUpdate(BaseModel):
    status: Literal["open", "resolved", "escalated"]


def _message_out(m) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text, "text_ko": m.text_ko,
            "analysis": m.analysis, "created_at": m.created_at.isoformat()}


def _conv_out(c: Conversation, full: bool = False) -> dict:
    out = {
        "id": c.id, "channel": c.channel, "customer_name": c.customer_name, "customer_email": c.customer_email,
        "subject": c.subject, "language": c.language, "category": c.category, "sentiment": c.sentiment,
        "urgency": c.urgency, "status": c.status, "updated_at": c.updated_at.isoformat(),
        "preview": (c.messages[-1].text_ko or c.messages[-1].text)[:80] if c.messages else "",
        "awaiting_reply": bool(c.messages) and c.messages[-1].role == "customer",
    }
    if full:
        out["messages"] = [_message_out(m) for m in c.messages]
        out["summary"] = c.summary
    return out


def _get(db: Session, conv_id: int) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "conversation not found")
    return conv


def _llm_guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except LLMError as exc:
        raise HTTPException(502, f"LLM error: {exc}") from exc


# ---------- routes ----------
@app.get("/api/health")
def health():
    return {"status": "ok", "llm_provider": service.get_llm().name, "kb_chunks": len(get_retriever().chunks)}


@app.get("/api/conversations")
def list_conversations(db: Session = Depends(get_db)):
    rows = db.scalars(select(Conversation).options(selectinload(Conversation.messages))).all()
    rank = {"high": 0, "medium": 1, "low": 2, None: 3}
    rows = sorted(rows, key=lambda c: (c.status != "open", not (c.messages and c.messages[-1].role == "customer"),
                                       rank.get(c.urgency, 3), -c.updated_at.timestamp()))
    return [_conv_out(c) for c in rows]


@app.post("/api/conversations", status_code=201)
def new_conversation(body: NewConversation, db: Session = Depends(get_db)):
    conv = _llm_guard(service.create_conversation, db, **body.model_dump())
    return _conv_out(conv, full=True)


@app.get("/api/conversations/{conv_id}")
def get_conversation(conv_id: int, db: Session = Depends(get_db)):
    return _conv_out(_get(db, conv_id), full=True)


@app.post("/api/conversations/{conv_id}/customer-messages", status_code=201)
def customer_message(conv_id: int, body: CustomerMessage, db: Session = Depends(get_db)):
    conv = _get(db, conv_id)
    _llm_guard(service.handle_customer_message, db, conv, body.text)
    db.refresh(conv)
    return _conv_out(conv, full=True)


@app.post("/api/conversations/{conv_id}/translate")
def translate(conv_id: int, body: TranslateRequest, db: Session = Depends(get_db)):
    return _llm_guard(service.preview_translation, _get(db, conv_id), body.text_ko)


@app.post("/api/conversations/{conv_id}/agent-messages", status_code=201)
def agent_message(conv_id: int, body: AgentMessage, db: Session = Depends(get_db)):
    conv = _get(db, conv_id)
    try:
        service.send_agent_message(db, conv, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(422, {"message": "검증을 통과하지 못해 보낼 수 없습니다.", "validation": exc.args[0]}) from exc
    db.refresh(conv)
    return _conv_out(conv, full=True)


@app.post("/api/conversations/{conv_id}/reject-draft", status_code=204)
def reject_draft(conv_id: int, body: Rejection, db: Session = Depends(get_db)):
    service.record_rejection(db, _get(db, conv_id), body.draft_style)


@app.post("/api/conversations/{conv_id}/summary")
def summary(conv_id: int, db: Session = Depends(get_db)):
    conv = _get(db, conv_id)
    return _llm_guard(service.summarize_conversation, db, conv)


@app.post("/api/conversations/{conv_id}/status")
def set_status(conv_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    conv = _get(db, conv_id)
    conv.status = body.status
    db.commit()
    return _conv_out(conv)


@app.get("/api/kpi")
def kpi(db: Session = Depends(get_db)):
    return service.kpi(db)


@app.get("/api/dashboard")
def dashboard(days: int = 14, db: Session = Depends(get_db)):
    return build_dashboard(db, days=max(7, min(days, 60)))


@app.get("/api/glossary")
def glossary():
    from .pipeline.glossary import load_glossary
    return load_glossary()


@app.get("/api/kb")
def knowledge_base():
    return [{"id": c.id, "category": c.category, "title": c.title, "section": c.section, "text": c.text, "text_ko": c.text_ko}
            for c in get_retriever().chunks]
