from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security_dependencies import require_roles
from app.services.notification_engine import run_notification_engine


router = APIRouter(
    prefix="/api/notification-engine",
    tags=["Smart Notification Engine"],
)


@router.post("/run")
def run_engine(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    return run_notification_engine(db)
