
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text
from app.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    recipient_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_chat_sender_recipient_time",
              "sender_user_id", "recipient_user_id", "sent_at"),
        Index("ix_chat_recipient_sender_time",
              "recipient_user_id", "sender_user_id", "sent_at"),
    )
