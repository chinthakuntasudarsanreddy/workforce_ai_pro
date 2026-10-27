
import json
from datetime import datetime
from typing import Dict, Set

from fastapi import (
    APIRouter, Depends, HTTPException, Query, WebSocket,
    WebSocketDisconnect
)
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, func
from sqlalchemy.orm import Session

from app.config import SECRET_KEY, ALGORITHM
from app.database import SessionLocal, get_db
from app.models import User
from app.chat_models import ChatMessage
from app.security_dependencies import get_current_user
from jose import JWTError, jwt


router = APIRouter(prefix="/api/chat", tags=["Chat"])


class SendMessageRequest(BaseModel):
    recipient_user_id: int
    message: str = Field(min_length=1, max_length=5000)


class ConnectionManager:
    def __init__(self):
        self.connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        sockets = self.connections.get(user_id, set())
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, payload: dict):
        for socket in list(self.connections.get(user_id, set())):
            try:
                await socket.send_json(payload)
            except Exception:
                self.disconnect(user_id, socket)


manager = ConnectionManager()


def serialize_message(item: ChatMessage):
    return {
        "id": item.id,
        "sender_user_id": item.sender_user_id,
        "recipient_user_id": item.recipient_user_id,
        "message": item.message,
        "sent_at": item.sent_at.isoformat(),
        "read_at": item.read_at.isoformat() if item.read_at else None,
    }


def require_active_user(db: Session, user_id: int):
    target = db.get(User, user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="Active user not found")
    return target


@router.get("/contacts")
def contacts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    users = db.scalars(
        select(User)
        .where(User.is_active.is_(True), User.id != current_user.id)
        .order_by(User.full_name)
    ).all()

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        }
        for user in users
    ]


@router.post("/messages", status_code=201)
async def send_message(
    data: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message_text = data.message.strip()
    if not message_text:
        raise HTTPException(status_code=422, detail="Message cannot be blank")

    if data.recipient_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    require_active_user(db, data.recipient_user_id)

    item = ChatMessage(
        sender_user_id=current_user.id,
        recipient_user_id=data.recipient_user_id,
        message=message_text,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    result = serialize_message(item)
    await manager.send_to_user(
        data.recipient_user_id,
        {"type": "new_message", "message": result},
    )
    return result


@router.get("/messages/{other_user_id}")
def message_history(
    other_user_id: int,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_active_user(db, other_user_id)

    rows = db.scalars(
        select(ChatMessage)
        .where(
            or_(
                and_(
                    ChatMessage.sender_user_id == current_user.id,
                    ChatMessage.recipient_user_id == other_user_id,
                ),
                and_(
                    ChatMessage.sender_user_id == other_user_id,
                    ChatMessage.recipient_user_id == current_user.id,
                ),
            )
        )
        .order_by(ChatMessage.sent_at.desc(), ChatMessage.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return [serialize_message(row) for row in reversed(rows)]


@router.patch("/messages/{message_id}/read")
async def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.get(ChatMessage, message_id)
    if not item or item.recipient_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Message not found")

    if item.read_at is None:
        item.read_at = datetime.utcnow()
        db.commit()
        db.refresh(item)

    result = serialize_message(item)
    await manager.send_to_user(
        item.sender_user_id,
        {"type": "read_receipt", "message": result},
    )
    return result


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.scalar(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.recipient_user_id == current_user.id,
            ChatMessage.read_at.is_(None),
        )
    )
    return {"unread_count": count or 0}


@router.websocket("/ws/{other_user_id}")
async def chat_websocket(websocket: WebSocket, other_user_id: int):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Authentication required")
        return

    db = SessionLocal()
    current_user = None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        if not subject:
            raise ValueError("Missing subject")
        current_user = db.get(User, int(subject))
        if not current_user or not current_user.is_active:
            raise ValueError("Inactive user")
        other_user = db.get(User, other_user_id)
        if not other_user or not other_user.is_active:
            raise ValueError("Recipient unavailable")
    except (JWTError, ValueError, TypeError):
        db.close()
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    if other_user_id == current_user.id:
        db.close()
        await websocket.close(code=1008, reason="Cannot chat with yourself")
        return

    user_id = current_user.id
    await manager.connect(user_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                text_value = str(data.get("message", "")).strip()
            except (json.JSONDecodeError, AttributeError):
                await websocket.send_json({
                    "type": "error", "detail": "Send JSON with a message field"
                })
                continue

            if not text_value or len(text_value) > 5000:
                await websocket.send_json({
                    "type": "error",
                    "detail": "Message must contain 1 to 5000 characters",
                })
                continue

            # Reload recipient status for each incoming message.
            recipient = db.get(User, other_user_id)
            if not recipient or not recipient.is_active:
                await websocket.send_json({
                    "type": "error", "detail": "Recipient unavailable"
                })
                continue

            item = ChatMessage(
                sender_user_id=user_id,
                recipient_user_id=other_user_id,
                message=text_value,
            )
            db.add(item)
            db.commit()
            db.refresh(item)
            result = serialize_message(item)

            await websocket.send_json({
                "type": "message_sent", "message": result
            })
            await manager.send_to_user(
                other_user_id,
                {"type": "new_message", "message": result},
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user_id, websocket)
        db.close()
