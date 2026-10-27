
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


TaskStatus = Literal["PENDING", "IN_PROGRESS", "COMPLETED"]
TaskPriority = Literal["LOW", "MEDIUM", "HIGH"]


class WorkflowTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    assigned_to: int = Field(gt=0)
    due_date: date | None = None
    priority: TaskPriority = "MEDIUM"

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Task title cannot be empty")
        return value


class WorkflowTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    due_date: date | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    completion_notes: str | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("Task title cannot be empty")
        return value


class WorkflowTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    assigned_to: int
    created_by: int
    due_date: date | None
    status: str
    priority: str
    completion_notes: str | None
    created_at: datetime
    updated_at: datetime
