
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Department
from app.security_dependencies import require_roles

router = APIRouter(
    prefix="/api/forecasting",
    tags=["Workforce Forecasting"],
)


@router.get("/headcount")
def forecast_headcount(
    months: int = Query(default=3, ge=1, le=12),
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "HR")),
):
    """
    Estimate future workforce headcount using current headcount
    and historical monthly hiring/exit activity.

    This is a simple baseline forecast, not an ML prediction.
    Employees without a hire_date are excluded from the historical
    hiring calculation.
    """

    today = date.today()
    active_statuses = ["ACTIVE", "ON_LEAVE"]

    current_headcount = (
        db.query(func.count(Employee.id))
        .filter(Employee.status.in_(active_statuses))
        .scalar()
        or 0
    )

    # Look back over the most recent 6 months.
    history_start = today - timedelta(days=182)

    hired_count = (
        db.query(func.count(Employee.id))
        .filter(Employee.hire_date >= history_start)
        .filter(Employee.hire_date <= today)
        .scalar()
        or 0
    )

    # Inactive employees with a recorded hire date are not necessarily
    # exits during this period, so use a conservative baseline:
    # historical net change is not inferred from status alone.
    monthly_hiring_rate = hired_count / 6.0

    forecast = []
    running_headcount = current_headcount

    for month_offset in range(1, months + 1):
        month_number = today.month - 1 + month_offset
        year = today.year + month_number // 12
        month = month_number % 12 + 1

        projected_hires = round(monthly_hiring_rate)
        running_headcount += projected_hires

        forecast.append({
            "year": year,
            "month": month,
            "projected_headcount": running_headcount,
            "estimated_hires": projected_hires,
            "method": "six_month_average_hiring_baseline",
        })

    department_rows = (
        db.query(
            Department.id,
            Department.name,
            func.count(Employee.id),
        )
        .outerjoin(
            Employee,
            Employee.department_id == Department.id,
        )
        .filter(Department.is_active.is_(True))
        .filter(
            (Employee.status.in_(active_statuses))
            | (Employee.id.is_(None))
        )
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
        .all()
    )

    department_headcount = [
        {
            "department_id": department_id,
            "department": department_name,
            "current_headcount": count,
        }
        for department_id, department_name, count in department_rows
    ]

    return {
        "generated_for": today.isoformat(),
        "forecast_months": months,
        "current_headcount": current_headcount,
        "historical_hires_last_six_months": hired_count,
        "average_monthly_hires": round(monthly_hiring_rate, 2),
        "forecast": forecast,
        "department_headcount": department_headcount,
        "limitations": [
            "This baseline projects hiring only.",
            "Reliable exit dates are needed to estimate attrition-adjusted headcount.",
            "This is not a trained machine-learning forecast.",
        ],
    }
