
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PerformanceReviewCreate(BaseModel):
    employee_id: int = Field(gt=0)
    review_period_start: date
    review_period_end: date
    rating: int = Field(ge=1, le=5)
    feedback: str = Field(min_length=1, max_length=10000)
    goals: Optional[str] = Field(default=None, max_length=10000)
    status: Literal["DRAFT", "SUBMITTED"] = "SUBMITTED"

    @model_validator(mode="after")
    def validate_period(self):
        if self.review_period_end < self.review_period_start:
            raise ValueError(
                "Review period end must be on or after the start date"
            )
        return self


class PerformanceReviewUpdate(BaseModel):
    review_period_start: Optional[date] = None
    review_period_end: Optional[date] = None
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    feedback: Optional[str] = Field(
        default=None, min_length=1, max_length=10000
    )
    goals: Optional[str] = Field(default=None, max_length=10000)
    status: Optional[Literal["DRAFT", "SUBMITTED", "COMPLETED"]] = None

    @model_validator(mode="after")
    def validate_period(self):
        if (
            self.review_period_start is not None
            and self.review_period_end is not None
            and self.review_period_end < self.review_period_start
        ):
            raise ValueError(
                "Review period end must be on or after the start date"
            )
        return self


class PerformanceReviewResponse(BaseModel):
    id: int
    employee_id: int
    reviewer_id: int
    review_period_start: date
    review_period_end: date
    rating: int
    feedback: str
    goals: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
