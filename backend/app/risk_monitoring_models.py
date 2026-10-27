
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
)

from app.database import Base


class RiskMonitoringEvent(Base):
    __tablename__ = "risk_monitoring_events"

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )

    prediction_id = Column(
        Integer,
        ForeignKey("attrition_predictions.id"),
        nullable=False,
        index=True,
    )

    previous_risk_level = Column(String(20), nullable=True)
    current_risk_level = Column(String(20), nullable=False)

    previous_probability = Column(Numeric(6, 5), nullable=True)
    current_probability = Column(Numeric(6, 5), nullable=False)

    event_type = Column(String(40), nullable=False)
    scanned_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
