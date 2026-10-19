from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[str] = mapped_column(String(10))  # "chat" | "email"
    customer_name: Mapped[str] = mapped_column(String(100))
    customer_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(300), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    category: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    urgency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | resolved | escalated
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.id", cascade="all, delete-orphan"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"))
    role: Mapped[str] = mapped_column(String(10))  # "customer" | "agent"
    text: Mapped[str] = mapped_column(Text)  # what the customer sees / wrote (customer language)
    text_ko: Mapped[str | None] = mapped_column(Text, nullable=True)  # Korean for the agent
    analysis: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # classification, drafts, sources, timings
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class FeedbackEvent(Base):
    """How the agent used a suggestion: accepted as-is, edited, or rejected."""

    __tablename__ = "feedback_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"))
    message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    draft_style: Mapped[str | None] = mapped_column(String(30), nullable=True)
    action: Mapped[str] = mapped_column(String(10))  # accepted | edited | rejected
    edit_ratio: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
