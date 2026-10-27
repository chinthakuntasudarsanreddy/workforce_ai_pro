
from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    CheckConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    __table_args__ = (
        CheckConstraint(
            "rating >= 1 AND rating <= 5",
            name="ck_performance_review_rating",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )

    reviewer_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    review_period_start = Column(Date, nullable=False)
    review_period_end = Column(Date, nullable=False)

    rating = Column(Integer, nullable=False)
    feedback = Column(Text, nullable=False)

    goals = Column(Text, nullable=True)
    status = Column(
        String(30),
        nullable=False,
        default="DRAFT",
        index=True,
    )

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    employee = relationship("Employee")
    reviewer = relationship("User")
