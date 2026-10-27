
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User, Department, Notification
from app.prediction_models import AttritionPrediction
from app.risk_monitoring_models import RiskMonitoringEvent
from app.security_dependencies import require_roles


router = APIRouter(
    prefix="/api/risk-monitoring",
    tags=["Employee Risk Monitoring"],
)

ALLOWED_ROLES = ("ADMIN", "HR")
HIGH_RISK_THRESHOLD = 0.70


def normalize_risk(level, probability):
    normalized = str(level or "").strip().upper().replace(" ", "_")

    if normalized in {"LOW", "MEDIUM", "HIGH"}:
        return normalized

    if probability >= HIGH_RISK_THRESHOLD:
        return "HIGH"
    if probability >= 0.40:
        return "MEDIUM"
    return "LOW"


def latest_employee_predictions(db):
    records = (
        db.query(AttritionPrediction)
        .filter(AttritionPrediction.employee_id.isnot(None))
        .order_by(
            AttritionPrediction.created_at.desc(),
            AttritionPrediction.id.desc(),
        )
        .all()
    )

    latest = {}
    for record in records:
        if record.employee_id not in latest:
            latest[record.employee_id] = record

    return list(latest.values())


def latest_monitor_event(db, employee_id):
    return (
        db.query(RiskMonitoringEvent)
        .filter(RiskMonitoringEvent.employee_id == employee_id)
        .order_by(
            RiskMonitoringEvent.created_at.desc(),
            RiskMonitoringEvent.id.desc(),
        )
        .first()
    )


@router.post("/scan")
def scan_employee_risks(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED_ROLES)),
):
    """
    Process each employee's latest prediction, record a monitoring
    snapshot, and notify HR/Admin when an employee becomes high risk.
    """
    predictions = latest_employee_predictions(db)

    if not predictions:
        return {
            "message": "No employee-linked predictions are available to scan.",
            "employees_scanned": 0,
            "high_risk_employees": 0,
            "alerts_created": 0,
            "events": [],
        }

    events = []
    high_risk_count = 0
    alerts_created = 0

    try:
        for prediction in predictions:
            probability = float(prediction.risk_probability)
            current_level = normalize_risk(
                prediction.risk_level,
                probability,
            )

            previous = latest_monitor_event(db, prediction.employee_id)
            previous_level = (
                previous.current_risk_level if previous else None
            )
            previous_probability = (
                float(previous.current_probability) if previous else None
            )

            is_high = (
                current_level == "HIGH"
                or probability >= HIGH_RISK_THRESHOLD
            )

            if is_high:
                high_risk_count += 1

            if is_high and previous_level != "HIGH":
                event_type = "HIGH_RISK_DETECTED"
            elif previous and previous_level != current_level:
                event_type = "RISK_LEVEL_CHANGED"
            elif is_high:
                event_type = "HIGH_RISK_CONTINUED"
            else:
                event_type = "MONITORED"

            event = RiskMonitoringEvent(
                employee_id=prediction.employee_id,
                prediction_id=prediction.id,
                previous_risk_level=previous_level,
                current_risk_level=current_level,
                previous_probability=previous_probability,
                current_probability=probability,
                event_type=event_type,
                scanned_by=current_user.id,
            )
            db.add(event)

            # Send alerts only for a new high-risk detection or a
            # change from a non-high risk to high risk.
            if event_type == "HIGH_RISK_DETECTED":
                employee = (
                    db.query(Employee)
                    .filter(Employee.id == prediction.employee_id)
                    .first()
                )

                if employee:
                    recipients = (
                        db.query(User)
                        .filter(
                            User.role.in_(["ADMIN", "HR"]),
                            User.is_active.is_(True),
                        )
                        .all()
                    )

                    for recipient in recipients:
                        db.add(
                            Notification(
                                recipient_id=recipient.id,
                                title="High attrition risk detected",
                                message=(
                                    f"Employee {employee.employee_code} "
                                    f"has a high attrition risk "
                                    f"({probability:.1%}). "
                                    f"Review the employee's latest "
                                    f"prediction and follow up."
                                ),
                                notification_type="SYSTEM",
                                is_read=False,
                            )
                        )
                        alerts_created += 1

            events.append({
                "employee_id": prediction.employee_id,
                "prediction_id": prediction.id,
                "previous_risk_level": previous_level,
                "current_risk_level": current_level,
                "risk_probability": probability,
                "event_type": event_type,
            })

        db.commit()

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Risk scan failed. No scan changes were committed.",
        ) from exc

    return {
        "message": "Employee risk scan completed.",
        "employees_scanned": len(predictions),
        "high_risk_employees": high_risk_count,
        "alerts_created": alerts_created,
        "events": events,
    }


@router.get("/overview")
def risk_monitoring_overview(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED_ROLES)),
):
    predictions = latest_employee_predictions(db)

    counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for prediction in predictions:
        level = normalize_risk(
            prediction.risk_level,
            float(prediction.risk_probability),
        )
        counts[level] += 1

    recent_events = (
        db.query(RiskMonitoringEvent)
        .order_by(RiskMonitoringEvent.created_at.desc())
        .limit(10)
        .all()
    )

    return {
        "employees_with_predictions": len(predictions),
        "low_risk": counts["LOW"],
        "medium_risk": counts["MEDIUM"],
        "high_risk": counts["HIGH"],
        "high_risk_threshold": HIGH_RISK_THRESHOLD,
        "recent_events": [
            {
                "id": event.id,
                "employee_id": event.employee_id,
                "prediction_id": event.prediction_id,
                "previous_risk_level": event.previous_risk_level,
                "current_risk_level": event.current_risk_level,
                "risk_probability": float(event.current_probability),
                "event_type": event.event_type,
                "created_at": event.created_at,
            }
            for event in recent_events
        ],
    }


@router.get("/employees")
def monitored_employees(
    risk_level: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED_ROLES)),
):
    requested_level = risk_level.upper() if risk_level else None
    if requested_level and requested_level not in {"LOW", "MEDIUM", "HIGH"}:
        raise HTTPException(
            status_code=400,
            detail="risk_level must be LOW, MEDIUM, or HIGH.",
        )

    results = []

    for prediction in latest_employee_predictions(db):
        probability = float(prediction.risk_probability)
        level = normalize_risk(prediction.risk_level, probability)

        if requested_level and level != requested_level:
            continue

        employee = (
            db.query(Employee)
            .filter(Employee.id == prediction.employee_id)
            .first()
        )
        if not employee:
            continue

        user = (
            db.query(User)
            .filter(User.id == employee.user_id)
            .first()
        )
        department = (
            db.query(Department)
            .filter(Department.id == employee.department_id)
            .first()
            if employee.department_id is not None
            else None
        )
        event = latest_monitor_event(db, employee.id)

        results.append({
            "employee_id": employee.id,
            "employee_code": employee.employee_code,
            "employee_name": user.full_name if user else None,
            "job_title": employee.job_title,
            "department": department.name if department else None,
            "prediction_id": prediction.id,
            "predicted_attrition": prediction.predicted_attrition,
            "risk_level": level,
            "risk_probability": probability,
            "prediction_created_at": prediction.created_at,
            "last_monitoring_event": (
                {
                    "event_type": event.event_type,
                    "previous_risk_level": event.previous_risk_level,
                    "current_risk_level": event.current_risk_level,
                    "created_at": event.created_at,
                }
                if event else None
            ),
        })

    results.sort(key=lambda item: item["risk_probability"], reverse=True)

    return {
        "total": len(results),
        "limit": limit,
        "offset": offset,
        "items": results[offset:offset + limit],
    }


@router.get("/logs")
def risk_monitoring_logs(
    employee_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*ALLOWED_ROLES)),
):
    query = db.query(RiskMonitoringEvent)

    if employee_id is not None:
        query = query.filter(
            RiskMonitoringEvent.employee_id == employee_id
        )

    total = query.count()
    records = (
        query.order_by(
            RiskMonitoringEvent.created_at.desc(),
            RiskMonitoringEvent.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": record.id,
                "employee_id": record.employee_id,
                "prediction_id": record.prediction_id,
                "previous_risk_level": record.previous_risk_level,
                "current_risk_level": record.current_risk_level,
                "previous_probability": (
                    float(record.previous_probability)
                    if record.previous_probability is not None
                    else None
                ),
                "current_probability": float(record.current_probability),
                "event_type": record.event_type,
                "scanned_by": record.scanned_by,
                "created_at": record.created_at,
            }
            for record in records
        ],
    }

