
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, LeaveRequest, User
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log


router = APIRouter(prefix="/api/leave", tags=["Leave Management"])


class LeaveCreate(BaseModel):
    start_date: date
    end_date: date
    leave_type: str
    reason: str = Field(min_length=3, max_length=2000)


class LeaveReview(BaseModel):
    decision: str
    review_comment: str | None = Field(default=None, max_length=2000)


def get_employee(db: Session, user: User) -> Employee:
    employee = db.scalar(
        select(Employee).where(Employee.user_id == user.id)
    )

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="No employee profile is linked to this account",
        )

    if employee.status != "ACTIVE":
        raise HTTPException(
            status_code=403,
            detail="Only active employees can use leave management",
        )

    return employee


def leave_response(item: LeaveRequest) -> dict:
    return {
        "id": item.id,
        "employee_id": item.employee_id,
        "start_date": item.start_date,
        "end_date": item.end_date,
        "leave_type": item.leave_type,
        "reason": item.reason,
        "status": item.status,
        "reviewed_by": item.reviewed_by,
        "reviewed_at": item.reviewed_at,
        "review_comment": item.review_comment,
        "created_at": item.created_at,
    }


@router.post("/apply", status_code=201)
def apply_leave(
    data: LeaveCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = get_employee(db, user)

    if data.end_date < data.start_date:
        raise HTTPException(
            status_code=400,
            detail="End date cannot be before start date",
        )

    allowed_types = {"ANNUAL", "SICK", "CASUAL", "UNPAID", "OTHER"}
    leave_type = data.leave_type.strip().upper()

    if leave_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid leave type",
        )

    reason = data.reason.strip()
    if len(reason) < 3:
        raise HTTPException(
            status_code=400,
            detail="Please provide a meaningful leave reason",
        )

    overlapping = db.scalar(
        select(LeaveRequest.id).where(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.status.in_(["PENDING", "APPROVED"]),
            LeaveRequest.start_date <= data.end_date,
            LeaveRequest.end_date >= data.start_date,
        ).limit(1)
    )

    if overlapping is not None:
        raise HTTPException(
            status_code=409,
            detail="These dates overlap an existing pending or approved leave",
        )

    item = LeaveRequest(
        employee_id=employee.id,
        start_date=data.start_date,
        end_date=data.end_date,
        leave_type=leave_type,
        reason=reason,
        status="PENDING",
    )

    db.add(item)

    try:
        # Obtain the leave ID before creating the audit record.
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="LEAVE_APPLIED",
            resource_type="LeaveRequest",
            resource_id=item.id,
            details={
                "employee_id": employee.id,
                "leave_type": leave_type,
                "start_date": data.start_date.isoformat(),
                "end_date": data.end_date.isoformat(),
                "status": "PENDING",
            },
        )

        # Leave request and audit entry commit together.
        db.commit()
        db.refresh(item)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save leave application",
        )

    return {
        "message": "Leave application submitted successfully",
        "leave": leave_response(item),
    }


@router.get("/my")
def my_leave(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = get_employee(db, user)

    items = db.scalars(
        select(LeaveRequest)
        .where(LeaveRequest.employee_id == employee.id)
        .order_by(LeaveRequest.created_at.desc())
    ).all()

    return {
        "total": len(items),
        "leave_requests": [leave_response(item) for item in items],
    }


@router.get("/pending")
def pending_leave(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    items = db.scalars(
        select(LeaveRequest)
        .where(LeaveRequest.status == "PENDING")
        .order_by(LeaveRequest.created_at.asc())
    ).all()

    return {
        "total": len(items),
        "leave_requests": [leave_response(item) for item in items],
    }


@router.patch("/{leave_id}/review")
def review_leave(
    leave_id: int,
    data: LeaveReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    decision = data.decision.strip().upper()

    if decision not in {"APPROVED", "REJECTED"}:
        raise HTTPException(
            status_code=400,
            detail="Decision must be APPROVED or REJECTED",
        )

    item = db.get(LeaveRequest, leave_id)

    if item is None:
        raise HTTPException(
            status_code=404,
            detail="Leave request not found",
        )

    if item.status != "PENDING":
        raise HTTPException(
            status_code=409,
            detail="This leave request has already been reviewed",
        )

    if decision == "APPROVED":
        conflicting = db.scalar(
            select(LeaveRequest.id).where(
                LeaveRequest.employee_id == item.employee_id,
                LeaveRequest.id != item.id,
                LeaveRequest.status == "APPROVED",
                LeaveRequest.start_date <= item.end_date,
                LeaveRequest.end_date >= item.start_date,
            ).limit(1)
        )

        if conflicting is not None:
            raise HTTPException(
                status_code=409,
                detail="An approved leave already overlaps these dates",
            )

    item.status = decision
    item.reviewed_by = user.id
    item.reviewed_at = datetime.utcnow()
    item.review_comment = (
        data.review_comment.strip()
        if data.review_comment and data.review_comment.strip()
        else None
    )

    try:
        write_audit_log(
            db=db,
            actor=user,
            action=f"LEAVE_{decision}",
            resource_type="LeaveRequest",
            resource_id=item.id,
            details={
                "employee_id": item.employee_id,
                "leave_type": item.leave_type,
                "start_date": item.start_date.isoformat(),
                "end_date": item.end_date.isoformat(),
                "previous_status": "PENDING",
                "new_status": decision,
            },
        )

        # Review and audit record commit together.
        db.commit()
        db.refresh(item)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save leave review",
        )

    return {
        "message": f"Leave request {decision.lower()} successfully",
        "leave": leave_response(item),
    }
