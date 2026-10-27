from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Date,
    DateTime,
    ForeignKey,
)
from app.database import Base


class HRIntervention(Base):
    __tablename__ = "hr_interventions"

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
        nullable=True,
        index=True,
    )

    action_type = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="OPEN")
    priority = Column(String(20), nullable=False, default="MEDIUM")

    due_date = Column(Date, nullable=True)
    outcome = Column(Text, nullable=True)

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    completed_at = Column(DateTime, nullable=True)
