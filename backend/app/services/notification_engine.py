from datetime import date

from sqlalchemy.orm import Session

from app.models import User, Notification
from app.prediction_models import AttritionPrediction
from app.intervention_models import HRIntervention


def create_notification_once(
    db: Session,
    recipient_id: int,
    title: str,
    message: str,
    notification_type: str = "SYSTEM",
) -> bool:
    """Avoid creating a duplicate while an identical notification is unread."""

    existing = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == recipient_id,
            Notification.title == title,
            Notification.message == message,
            Notification.is_read.is_(False),
        )
        .first()
    )

    if existing:
        return False

    notification = Notification(
        recipient_id=recipient_id,
        title=title,
        message=message,
        notification_type=notification_type,
        is_read=False,
    )

    db.add(notification)
    return True


def run_notification_engine(db: Session) -> dict:
    """Generate rule-based HR alerts for high-risk employees and overdue actions."""

    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.role.in_(["ADMIN", "HR"]),
        )
        .all()
    )

    if not recipients:
        return {
            "status": "completed",
            "notifications_created": 0,
            "message": "No active Admin or HR recipients found.",
        }

    created = 0
    today = date.today()

    # Rule 1: Alert HR about employees with high attrition risk.
    high_risk_predictions = (
        db.query(AttritionPrediction)
        .filter(AttritionPrediction.risk_level == "HIGH")
        .all()
    )

    for prediction in high_risk_predictions:
        if prediction.employee_id is None:
            continue

        title = f"High attrition risk: employee #{prediction.employee_id}"
        message = (
            f"Employee #{prediction.employee_id} has a high attrition-risk "
            f"prediction ({float(prediction.risk_probability):.0%}). "
            "Review the prediction and consider an appropriate retention action."
        )

        for recipient in recipients:
            if create_notification_once(
                db,
                recipient.id,
                title,
                message,
                "SYSTEM",
            ):
                created += 1

    # Rule 2: Alert HR about overdue interventions.
    overdue_interventions = (
        db.query(HRIntervention)
        .filter(
            HRIntervention.due_date < today,
            HRIntervention.status.in_(["OPEN", "IN_PROGRESS"]),
        )
        .all()
    )

    for intervention in overdue_interventions:
        title = f"Overdue HR intervention #{intervention.id}"
        message = (
            f"Intervention #{intervention.id} for employee "
            f"#{intervention.employee_id} was due on "
            f"{intervention.due_date.isoformat()}. "
            "Review its status and take the required action."
        )

        for recipient in recipients:
            if create_notification_once(
                db,
                recipient.id,
                title,
                message,
                "SYSTEM",
            ):
                created += 1

    db.commit()

    return {
        "status": "completed",
        "notifications_created": created,
        "high_risk_predictions_checked": len(high_risk_predictions),
        "overdue_interventions_checked": len(overdue_interventions),
        "recipient_count": len(recipients),
    }
