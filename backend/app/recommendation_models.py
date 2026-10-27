
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.database import Base


class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"

    __table_args__ = (
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH')",
            name="ck_ai_recommendation_priority",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED')",
            name="ck_ai_recommendation_status",
        ),
    )

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

    category = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    suggested_action = Column(Text, nullable=False)

    priority = Column(String(10), nullable=False, default="MEDIUM")
    status = Column(String(20), nullable=False, default="PENDING")

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    completion_notes = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
