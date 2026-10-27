
from typing import Any

from sqlalchemy.orm import Session

from app.audit_models import AuditLog


def write_audit_log(
    db: Session,
    actor: Any,
    action: str,
    resource_type: str,
    resource_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Add an audit entry to the current transaction."""

    actor_id = getattr(actor, "id", None)
    actor_email = getattr(actor, "email", None)

    entry = AuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
    )

    db.add(entry)
    return entry
