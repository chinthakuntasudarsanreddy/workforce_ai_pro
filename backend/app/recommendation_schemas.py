
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


RecommendationStatus = Literal[
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
    "DISMISSED",
]


class RecommendationStatusUpdate(BaseModel):
    status: RecommendationStatus
    completion_notes: str | None = Field(default=None, max_length=2000)


class AIRecommendationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    prediction_id: int
    category: str
    title: str
    description: str
    suggested_action: str
    priority: str
    status: str
    created_by: int
    completion_notes: str | None
    created_at: datetime
    updated_at: datetime
