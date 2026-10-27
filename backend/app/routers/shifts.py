
from datetime import date, time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Shift, ShiftAssignment
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/shifts", tags=["Shifts"])


class ShiftCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    start_time: time
    end_time: time
    break_minutes: int = Field(default=60, ge=0, le=240)


class ShiftAssignmentCreate(BaseModel):
    employee_id: int = Field(gt=0)
    shift_id: int = Field(gt=0)
    effective_from: date = Field(default_factory=date.today)
    effective_until: date | None = None


@router.get("/")
def list_shifts(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    shifts = db.scalars(
        select(Shift)
        .where(Shift.is_active.is_(True))
        .order_by(Shift.start_time)
    ).all()

    return [
        {
            "id": s.id,
            "name": s.name,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "break_minutes": s.break_minutes,
            "is_active": s.is_active,
        }
        for s in shifts
    ]


@router.post("/", status_code=201)
def create_shift(
    data: ShiftCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    name = data.name.strip()

    if len(name) < 2:
        raise HTTPException(422, detail="Shift name must have at least 2 characters")

    if db.scalar(select(Shift).where(Shift.name.ilike(name))):
        raise HTTPException(409, detail="A shift with this name already exists")

    shift = Shift(
        name=name,
        start_time=data.start_time,
        end_time=data.end_time,
        break_minutes=data.break_minutes,
    )

    try:
        db.add(shift)
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="SHIFT_CREATED",
            resource_type="shift",
            resource_id=shift.id,
            details={
                "name": shift.name,
                "start_time": shift.start_time.isoformat(),
                "end_time": shift.end_time.isoformat(),
                "break_minutes": shift.break_minutes,
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(shift)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Shift created",
        "id": shift.id,
        "name": shift.name,
        "start_time": shift.start_time,
        "end_time": shift.end_time,
    }


@router.post("/assign", status_code=201)
def assign_shift(
    data: ShiftAssignmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    if data.effective_until and data.effective_until < data.effective_from:
        raise HTTPException(
            400, detail="effective_until cannot be before effective_from"
        )

    employee = db.get(Employee, data.employee_id)
    if not employee or employee.status != "ACTIVE":
        raise HTTPException(404, detail="Active employee not found")

    shift = db.get(Shift, data.shift_id)
    if not shift or not shift.is_active:
        raise HTTPException(404, detail="Active shift not found")

    assignment = ShiftAssignment(
        employee_id=data.employee_id,
        shift_id=data.shift_id,
        effective_from=data.effective_from,
        effective_until=data.effective_until,
        is_active=True,
    )

    try:
        db.add(assignment)
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="SHIFT_ASSIGNED",
            resource_type="shift_assignment",
            resource_id=assignment.id,
            details={
                "employee_id": assignment.employee_id,
                "shift_id": assignment.shift_id,
                "effective_from": assignment.effective_from.isoformat(),
                "effective_until": (
                    assignment.effective_until.isoformat()
                    if assignment.effective_until
                    else None
                ),
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(assignment)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Shift assigned successfully",
        "assignment_id": assignment.id,
        "employee_id": assignment.employee_id,
        "shift_id": assignment.shift_id,
        "effective_from": assignment.effective_from,
        "effective_until": assignment.effective_until,
    }


@router.get("/assignments")
def list_assignments(
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    query = select(ShiftAssignment).where(
        ShiftAssignment.is_active.is_(True)
    )

    if employee_id is not None:
        query = query.where(ShiftAssignment.employee_id == employee_id)

    assignments = db.scalars(
        query.order_by(ShiftAssignment.effective_from.desc())
    ).all()

    return [
        {
            "id": a.id,
            "employee_id": a.employee_id,
            "shift_id": a.shift_id,
            "effective_from": a.effective_from,
            "effective_until": a.effective_until,
        }
        for a in assignments
    ]
