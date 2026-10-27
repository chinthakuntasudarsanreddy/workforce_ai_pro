
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.audit_models import AuditLog
from app.database import get_db
from app.security_dependencies import require_roles

router = APIRouter(
    prefix="/api/audit-logs",
    tags=["Audit Logs"],
)


@router.get("/")
def list_audit_logs(
    action: str | None = None,
    resource_type: str | None = None,
    actor_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action)

    if resource_type:
        query = query.filter(
            AuditLog.resource_type == resource_type
        )

    if actor_id is not None:
        query = query.filter(AuditLog.actor_id == actor_id)

    if start_date:
        query = query.filter(
            AuditLog.created_at >= start_date
        )

    if end_date:
        query = query.filter(
            AuditLog.created_at <= end_date
        )

    total = query.count()

    entries = (
        query.order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "status": "success",
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": entry.id,
                "actor_id": entry.actor_id,
                "actor_email": entry.actor_email,
                "action": entry.action,
                "resource_type": entry.resource_type,
                "resource_id": entry.resource_id,
                "details": entry.details,
                "ip_address": entry.ip_address,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in entries
        ],
    }


@router.get("/summary")
def audit_log_summary(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    return {
        "status": "success",
        "total_audit_logs": db.query(AuditLog).count(),
    }
