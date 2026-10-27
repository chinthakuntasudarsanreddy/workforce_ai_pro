
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Department, Attendance
from app.prediction_models import AttritionPrediction
from app.security_dependencies import require_roles


router = APIRouter(
    prefix="/api/analytics",
    tags=["Workforce Intelligence"],
)


@router.get("/overview")
def workforce_overview(
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    """Return workforce, attendance, and attrition KPIs."""

    today = date.today()
    month_start = today.replace(day=1)

    # Employee KPIs
    total_employees = db.query(func.count(Employee.id)).scalar() or 0

    active_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "ACTIVE")
        .scalar()
        or 0
    )

    inactive_employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "INACTIVE")
        .scalar()
        or 0
    )

    employees_on_leave = (
        db.query(func.count(Employee.id))
        .filter(Employee.status == "ON_LEAVE")
        .scalar()
        or 0
    )

    # Department totals
    total_departments = (
        db.query(func.count(Department.id))
        .filter(Department.is_active.is_(True))
        .scalar()
        or 0
    )

    # Today's attendance
    attendance_today = (
        db.query(
            Attendance.status,
            func.count(Attendance.id),
        )
        .filter(Attendance.attendance_date == today)
        .group_by(Attendance.status)
        .all()
    )

    attendance_counts = {
        status: count for status, count in attendance_today
    }

    # Attendance for the current month
    attendance_month = (
        db.query(func.count(Attendance.id))
        .filter(Attendance.attendance_date >= month_start)
        .filter(Attendance.attendance_date <= today)
        .scalar()
        or 0
    )

    # Attrition prediction KPIs
    total_predictions = (
        db.query(func.count(AttritionPrediction.id)).scalar() or 0
    )

    predicted_yes = (
        db.query(func.count(AttritionPrediction.id))
        .filter(AttritionPrediction.predicted_attrition == "Yes")
        .scalar()
        or 0
    )

    risk_rows = (
        db.query(
            AttritionPrediction.risk_level,
            func.count(AttritionPrediction.id),
        )
        .group_by(AttritionPrediction.risk_level)
        .all()
    )

    risk_distribution = {
        level: count for level, count in risk_rows
    }

    # Predictions linked to employees, grouped by department
    department_rows = (
        db.query(
            Department.name,
            func.count(AttritionPrediction.id),
        )
        .join(Employee, Employee.department_id == Department.id)
        .join(
            AttritionPrediction,
            AttritionPrediction.employee_id == Employee.id,
        )
        .filter(
            AttritionPrediction.predicted_attrition == "Yes"
        )
        .group_by(Department.id, Department.name)
        .all()
    )

    department_attrition = [
        {
            "department": name,
            "predicted_attrition_count": count,
        }
        for name, count in department_rows
    ]

    return {
        "generated_for": today.isoformat(),
        "workforce": {
            "total_employees": total_employees,
            "active_employees": active_employees,
            "inactive_employees": inactive_employees,
            "employees_on_leave": employees_on_leave,
            "total_active_departments": total_departments,
        },
        "attendance": {
            "date": today.isoformat(),
            "present": attendance_counts.get("PRESENT", 0),
            "late": attendance_counts.get("LATE", 0),
            "half_day": attendance_counts.get("HALF_DAY", 0),
            "absent": attendance_counts.get("ABSENT", 0),
            "records_this_month": attendance_month,
        },
        "attrition": {
            "total_predictions": total_predictions,
            "predicted_to_leave": predicted_yes,
            "risk_distribution": risk_distribution,
            "department_insights": department_attrition,
        },
    }


@router.get("/departments")
def department_workforce_summary(
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    """Return employee counts by department."""

    rows = (
        db.query(
            Department.id,
            Department.name,
            func.count(Employee.id),
        )
        .outerjoin(Employee, Employee.department_id == Department.id)
        .filter(Department.is_active.is_(True))
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
        .all()
    )

    return [
        {
            "department_id": department_id,
            "department": department_name,
            "employee_count": employee_count,
        }
        for department_id, department_name, employee_count in rows
    ]


@router.get("/attendance-trend")
def attendance_trend(
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    """Return daily attendance counts for the requested period."""

    start_date = date.today() - timedelta(days=days - 1)

    rows = (
        db.query(
            Attendance.attendance_date,
            Attendance.status,
            func.count(Attendance.id),
        )
        .filter(Attendance.attendance_date >= start_date)
        .filter(Attendance.attendance_date <= date.today())
        .group_by(Attendance.attendance_date, Attendance.status)
        .order_by(Attendance.attendance_date)
        .all()
    )

    daily = {}

    for attendance_date, status, count in rows:
        day_key = attendance_date.isoformat()

        if day_key not in daily:
            daily[day_key] = {
                "date": day_key,
                "present": 0,
                "late": 0,
                "half_day": 0,
                "absent": 0,
                "total_records": 0,
            }

        status_key = {
            "PRESENT": "present",
            "LATE": "late",
            "HALF_DAY": "half_day",
            "ABSENT": "absent",
        }.get(status)

        if status_key:
            daily[day_key][status_key] = count

        daily[day_key]["total_records"] += count

    # Include dates with no attendance records.
    result = []

    for offset in range(days):
        current_date = start_date + timedelta(days=offset)
        day_key = current_date.isoformat()

        result.append(
            daily.get(
                day_key,
                {
                    "date": day_key,
                    "present": 0,
                    "late": 0,
                    "half_day": 0,
                    "absent": 0,
                    "total_records": 0,
                },
            )
        )

    return result

