
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
)

from app.database import Base


class AttritionPrediction(Base):
    __tablename__ = "attrition_predictions"

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=True,
        index=True,
    )

    dataset_id = Column(
        Integer,
        ForeignKey("datasets.id"),
        nullable=True,
        index=True,
    )

    predicted_attrition = Column(
        String(10),
        nullable=False,
    )

    risk_probability = Column(
        Numeric(6, 5),
        nullable=False,
    )

    risk_level = Column(
        String(20),
        nullable=False,
    )

    model_version = Column(
        String(50),
        nullable=False,
    )

    input_features = Column(JSON, nullable=False)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
