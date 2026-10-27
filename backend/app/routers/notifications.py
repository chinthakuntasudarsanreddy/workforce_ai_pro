
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification, User
from app.security_dependencies import get_current_user, require_roles

router = APIRouter(
    prefix="/api/notifications",
    tags=["Notifications"],
)


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    notification_type: str = "GENERAL"


ALLOWED_TYPES = {
    "GENERAL",
    "LEAVE",
    "PAYROLL",
    "ATTENDANCE",
    "SYSTEM",
}


def notification_data(item: Notification) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "message": item.message,
        "notification_type": item.notification_type,
        "is_read": item.is_read,
        "created_at": item.created_at,
        "read_at": item.read_at,
    }


@router.get("/")
def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    query = select(Notification).where(
        Notification.recipient_id == user.id
    )

    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    records = db.scalars(
        query.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return {
        "total_returned": len(records),
        "notifications": [notification_data(item) for item in records],
    }


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from sqlalchemy import func

    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.recipient_id == user.id,
            Notification.is_read.is_(False),
        )
    )

    return {"unread_count": count or 0}


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_id == user.id,
        )
    )

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    if not item.is_read:
        item.is_read = True
        item.read_at = datetime.utcnow()
        db.commit()
        db.refresh(item)

    return {
        "message": "Notification marked as read",
        "notification": notification_data(item),
    }


@router.patch("/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    records = db.scalars(
        select(Notification).where(
            Notification.recipient_id == user.id,
            Notification.is_read.is_(False),
        )
    ).all()

    now = datetime.utcnow()
    for item in records:
        item.is_read = True
        item.read_at = now

    db.commit()

    return {
        "message": "Unread notifications marked as read",
        "updated_count": len(records),
    }


@router.post("/announcement", status_code=201)
def send_announcement(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    title = data.title.strip()
    message = data.message.strip()
    notification_type = data.notification_type.upper().strip()

    if not title or not message:
        raise HTTPException(
            status_code=422,
            detail="Title and message cannot be blank",
        )

    if notification_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Type must be one of {sorted(ALLOWED_TYPES)}",
        )

    recipients = db.scalars(
        select(User).where(User.is_active.is_(True))
    ).all()

    if not recipients:
        raise HTTPException(
            status_code=400,
            detail="No active users are available",
        )

    records = [
        Notification(
            recipient_id=recipient.id,
            title=title,
            message=message,
            notification_type=notification_type,
        )
        for recipient in recipients
    ]

    db.add_all(records)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not send announcement",
        )

    return {
        "message": "Announcement sent successfully",
        "recipients_count": len(records),
    }
