
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class WorkflowTask(Base):
    __tablename__ = "workflow_tasks"

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')",
            name="ck_workflow_task_status",
        ),
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH')",
            name="ck_workflow_task_priority",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    assigned_to = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )

    created_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    due_date = Column(Date, nullable=True, index=True)

    status = Column(
        String(20),
        nullable=False,
        default="PENDING",
        index=True,
    )

    priority = Column(
        String(10),
        nullable=False,
        default="MEDIUM",
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

    assignee = relationship("Employee")
    creator = relationship("User")
