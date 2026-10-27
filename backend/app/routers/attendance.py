
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Attendance, Employee, User
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/attendance", tags=["Attendance"])


def get_employee_for_user(db: Session, user: User) -> Employee:
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
            detail="Only active employees can record attendance",
        )

    return employee


def attendance_response(record: Attendance) -> dict:
    return {
        "id": record.id,
        "employee_id": record.employee_id,
        "attendance_date": record.attendance_date,
        "clock_in": record.clock_in,
        "clock_out": record.clock_out,
        "work_minutes": record.work_minutes,
        "work_hours": round((record.work_minutes or 0) / 60, 2),
        "status": record.status,
        "notes": record.notes,
    }


@router.post("/clock-in")
def clock_in(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = get_employee_for_user(db, user)
    today = date.today()

    record = db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.attendance_date == today,
        )
    )

    if record and record.clock_in:
        raise HTTPException(
            status_code=409,
            detail="You have already clocked in today",
        )

    now = datetime.utcnow()

    if record is None:
        record = Attendance(
            employee_id=employee.id,
            attendance_date=today,
            clock_in=now,
            status="PRESENT",
        )
        db.add(record)
    else:
        record.clock_in = now
        record.status = "PRESENT"

    try:
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="ATTENDANCE_CLOCK_IN",
            resource_type="Attendance",
            resource_id=record.id,
            details={
                "employee_id": employee.id,
                "attendance_date": today.isoformat(),
                "status": record.status,
            },
        )

        db.commit()
        db.refresh(record)

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Attendance could not be recorded",
        ) from exc

    return {
        "message": "Clock-in recorded successfully",
        "attendance": attendance_response(record),
    }


@router.post("/clock-out")
def clock_out(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = get_employee_for_user(db, user)
    today = date.today()

    record = db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.id,
            Attendance.attendance_date == today,
        )
    )

    if record is None or record.clock_in is None:
        raise HTTPException(
            status_code=400,
            detail="Clock in before clocking out",
        )

    if record.clock_out is not None:
        raise HTTPException(
            status_code=409,
            detail="You have already clocked out today",
        )

    now = datetime.utcnow()

    if now < record.clock_in:
        raise HTTPException(
            status_code=400,
            detail="Clock-out cannot be earlier than clock-in",
        )

    record.clock_out = now
    record.work_minutes = int(
        (record.clock_out - record.clock_in).total_seconds() // 60
    )

    try:
        write_audit_log(
            db=db,
            actor=user,
            action="ATTENDANCE_CLOCK_OUT",
            resource_type="Attendance",
            resource_id=record.id,
            details={
                "employee_id": employee.id,
                "attendance_date": today.isoformat(),
                "work_minutes": record.work_minutes,
                "status": record.status,
            },
        )

        db.commit()
        db.refresh(record)

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save clock-out",
        ) from exc

    return {
        "message": "Clock-out recorded successfully",
        "attendance": attendance_response(record),
    }


@router.get("/me")
def my_attendance(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = get_employee_for_user(db, user)

    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date",
        )

    query = select(Attendance).where(
        Attendance.employee_id == employee.id
    )

    if start_date:
        query = query.where(
            Attendance.attendance_date >= start_date
        )

    if end_date:
        query = query.where(
            Attendance.attendance_date <= end_date
        )

    records = db.scalars(
        query.order_by(Attendance.attendance_date.desc())
    ).all()

    return {
        "employee_id": employee.id,
        "total_records": len(records),
        "records": [
            attendance_response(record) for record in records
        ],
    }


@router.get("/overview")
def attendance_overview(
    attendance_date: date | None = None,
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    target_date = attendance_date or date.today()

    query = select(Attendance).where(
        Attendance.attendance_date == target_date
    )

    if employee_id is not None:
        query = query.where(
            Attendance.employee_id == employee_id
        )

    records = db.scalars(
        query.order_by(Attendance.employee_id)
    ).all()

    return {
        "attendance_date": target_date,
        "total_records": len(records),
        "records": [
            attendance_response(record) for record in records
        ],
    }
