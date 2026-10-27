
import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee
from app.dataset_models import Dataset
from app.prediction_models import AttritionPrediction
from app.security_dependencies import require_roles
from app.services.attrition_ml import (
    predict_attrition,
    train_attrition_model,
    get_feature_importance,
)

router = APIRouter(
    prefix="/api/attrition",
    tags=["AI Attrition Prediction"],
)


class PredictionRequest(BaseModel):
    employee_id: int | None = Field(default=None, gt=0)
    dataset_id: int | None = Field(default=None, gt=0)
    features: dict


@router.post("/train")
def train_model(
    dataset_id: int = Query(..., gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id)
        .first()
    )

    if not dataset:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found",
        )

    try:
        result = train_attrition_model(dataset.file_path)
    except (ValueError, FileNotFoundError, pd.errors.ParserError) as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Model training failed: {exc}",
        ) from exc

    dataset.status = "TRAINED"
    db.commit()

    return result


@router.post("/predict")
def predict(
    request: PredictionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    if request.employee_id is not None:
        employee = (
            db.query(Employee)
            .filter(Employee.id == request.employee_id)
            .first()
        )

        if not employee:
            raise HTTPException(
                status_code=404,
                detail="Employee not found",
            )

    if request.dataset_id is not None:
        dataset = (
            db.query(Dataset)
            .filter(Dataset.id == request.dataset_id)
            .first()
        )

        if not dataset:
            raise HTTPException(
                status_code=404,
                detail="Dataset not found",
            )

    try:
        result = predict_attrition(request.features)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {exc}",
        ) from exc

    record = AttritionPrediction(
        employee_id=request.employee_id,
        dataset_id=request.dataset_id,
        predicted_attrition=result["predicted_attrition"],
        risk_probability=result["risk_probability"],
        risk_level=result["risk_level"],
        model_version=result["model_version"],
        input_features=request.features,
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to save prediction history.",
        ) from exc

    return {
        "prediction_id": record.id,
        **result,
    }


@router.get("/history")
def prediction_history(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    records = (
        db.query(AttritionPrediction)
        .order_by(AttritionPrediction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "id": record.id,
            "employee_id": record.employee_id,
            "dataset_id": record.dataset_id,
            "predicted_attrition": record.predicted_attrition,
            "risk_probability": float(record.risk_probability),
            "risk_level": record.risk_level,
            "model_version": record.model_version,
            "input_features": record.input_features,
            "created_at": record.created_at,
        }
        for record in records
    ]


@router.get("/feature-importance")
def feature_importance(
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    try:
        return get_feature_importance()

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
