from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Employee
from app.prediction_models import AttritionPrediction
from app.intervention_models import HRIntervention
from app.security_dependencies import require_roles


router = APIRouter(
    prefix="/api/interventions",
    tags=["HR Interventions"],
)


class InterventionCreate(BaseModel):
    employee_id: int
    prediction_id: Optional[int] = None
    action_type: str = Field(min_length=2, max_length=50)
    description: str = Field(min_length=3)
    priority: str = "MEDIUM"
    due_date: Optional[date] = None


class InterventionUpdate(BaseModel):
    action_type: Optional[str] = Field(default=None, min_length=2, max_length=50)
    description: Optional[str] = Field(default=None, min_length=3)
    priority: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[date] = None
    outcome: Optional[str] = None


def intervention_response(item):
    return {
        "id": item.id,
        "employee_id": item.employee_id,
        "prediction_id": item.prediction_id,
        "action_type": item.action_type,
        "description": item.description,
        "priority": item.priority,
        "status": item.status,
        "due_date": item.due_date,
        "outcome": item.outcome,
        "created_by": item.created_by,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "completed_at": item.completed_at,
    }


@router.post("/")
def create_intervention(
    payload: InterventionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    employee = db.query(Employee).filter(
        Employee.id == payload.employee_id
    ).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if payload.prediction_id is not None:
        prediction = db.query(AttritionPrediction).filter(
            AttritionPrediction.id == payload.prediction_id
        ).first()

        if not prediction:
            raise HTTPException(status_code=404, detail="Prediction not found")

        if prediction.employee_id != payload.employee_id:
            raise HTTPException(
                status_code=400,
                detail="Prediction does not belong to this employee",
            )

    if payload.priority not in {"LOW", "MEDIUM", "HIGH"}:
        raise HTTPException(
            status_code=400,
            detail="Priority must be LOW, MEDIUM, or HIGH",
        )

    item = HRIntervention(
        employee_id=payload.employee_id,
        prediction_id=payload.prediction_id,
        action_type=payload.action_type,
        description=payload.description,
        priority=payload.priority,
        due_date=payload.due_date,
        status="OPEN",
        created_by=current_user.id,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return intervention_response(item)


@router.get("/")
def list_interventions(
    status: Optional[str] = Query(default=None),
    employee_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(HRIntervention)

    if status:
        query = query.filter(HRIntervention.status == status.upper())

    if employee_id is not None:
        query = query.filter(HRIntervention.employee_id == employee_id)

    items = (
        query.order_by(HRIntervention.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": query.count(),
        "items": [intervention_response(item) for item in items],
    }


@router.get("/{intervention_id}")
def get_intervention(
    intervention_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    item = db.query(HRIntervention).filter(
        HRIntervention.id == intervention_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    return intervention_response(item)


@router.patch("/{intervention_id}")
def update_intervention(
    intervention_id: int,
    payload: InterventionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    item = db.query(HRIntervention).filter(
        HRIntervention.id == intervention_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Intervention not found")

    changes = payload.model_dump(exclude_unset=True)

    if "priority" in changes and changes["priority"] not in {
        "LOW", "MEDIUM", "HIGH"
    }:
        raise HTTPException(
            status_code=400,
            detail="Priority must be LOW, MEDIUM, or HIGH",
        )

    if "status" in changes:
        changes["status"] = changes["status"].upper()

        if changes["status"] not in {"OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"}:
            raise HTTPException(
                status_code=400,
                detail="Invalid status",
            )

        if changes["status"] == "COMPLETED":
            if not (changes.get("outcome") or item.outcome):
                raise HTTPException(
                    status_code=400,
                    detail="Provide an outcome before completing the intervention",
                )
            item.completed_at = datetime.utcnow()
        elif changes["status"] != "COMPLETED":
            item.completed_at = None

    for field, value in changes.items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)

    return intervention_response(item)
