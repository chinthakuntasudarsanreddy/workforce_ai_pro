from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Attendance
from app.prediction_models import AttritionPrediction
from app.security_dependencies import require_roles


router = APIRouter(
    prefix="/api/workforce-monitoring",
    tags=["Real-Time Workforce Monitoring"],
)


@router.get("/live")
def live_workforce_status(
    risk_limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    today = date.today()

    total_employees = (
        db.query(func.count(Employee.id)).scalar() or 0
    )

    active_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "ACTIVE")
        .scalar()
        or 0
    )

    employees_on_leave = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "ON_LEAVE")
        .scalar()
        or 0
    )

    inactive_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "INACTIVE")
        .scalar()
        or 0
    )

    # Employees with a clock-in today and no clock-out yet.
    currently_clocked_in = (
        db.query(func.count(Attendance.id))
        .filter(Attendance.attendance_date == today)
        .filter(Attendance.clock_in.isnot(None))
        .filter(Attendance.clock_out.is_(None))
        .scalar()
        or 0
    )

    attendance_rows = (
        db.query(
            Attendance.status,
            func.count(Attendance.id),
        )
        .filter(Attendance.attendance_date == today)
        .group_by(Attendance.status)
        .all()
    )

    attendance_summary = {
        "PRESENT": 0,
        "LATE": 0,
        "HALF_DAY": 0,
        "ABSENT": 0,
    }

    for status, count in attendance_rows:
        attendance_summary[status] = count

    latest_high_risk_predictions = (
        db.query(AttritionPrediction)
        .filter(AttritionPrediction.risk_level == "HIGH")
        .order_by(AttritionPrediction.created_at.desc())
        .limit(risk_limit)
        .all()
    )

    high_risk_items = [
        {
            "prediction_id": item.id,
            "employee_id": item.employee_id,
            "risk_probability": float(item.risk_probability),
            "risk_level": item.risk_level,
            "predicted_attrition": item.predicted_attrition,
            "created_at": item.created_at.isoformat()
            if item.created_at else None,
        }
        for item in latest_high_risk_predictions
    ]

    return {
        "status": "success",
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        "refresh_hint_seconds": 30,
        "workforce": {
            "total_employees": total_employees,
            "active_employees": active_employees,
            "inactive_employees": inactive_employees,
            "employees_on_leave": employees_on_leave,
            "currently_clocked_in": currently_clocked_in,
        },
        "attendance_today": {
            "date": today.isoformat(),
            "summary": attendance_summary,
            "total_records": sum(attendance_summary.values()),
        },
        "latest_high_risk_predictions": high_risk_items,
        "high_risk_predictions_returned": len(high_risk_items),
    }
