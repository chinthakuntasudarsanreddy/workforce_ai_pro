
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee
from app.prediction_models import AttritionPrediction
from app.recommendation_models import AIRecommendation
from app.recommendation_schemas import (
    AIRecommendationResponse,
    RecommendationStatusUpdate,
)
from app.security_dependencies import require_roles
from app.services.audit import write_audit_log


router = APIRouter(
    prefix="/api/recommendations",
    tags=["AI Recommendation Engine"],
)

HR_ROLES = ("ADMIN", "HR")


def latest_predictions(db: Session):
    records = (
        db.query(AttritionPrediction)
        .filter(AttritionPrediction.employee_id.isnot(None))
        .order_by(
            AttritionPrediction.created_at.desc(),
            AttritionPrediction.id.desc(),
        )
        .all()
    )

    latest = {}
    for record in records:
        if record.employee_id not in latest:
            latest[record.employee_id] = record

    return list(latest.values())


def build_recommendations(prediction):
    probability = float(prediction.risk_probability)
    risk_level = str(prediction.risk_level or "").strip().upper()

    if risk_level not in {"LOW", "MEDIUM", "HIGH"}:
        risk_level = (
            "HIGH" if probability >= 0.70
            else "MEDIUM" if probability >= 0.40
            else "LOW"
        )

    recommendations = []

    if risk_level == "HIGH" or probability >= 0.70:
        recommendations.append({
            "category": "RETENTION",
            "title": "Schedule a retention conversation",
            "description": (
                "The latest model prediction indicates elevated attrition "
                "risk. A manager or HR representative should discuss the "
                "employee's concerns and career expectations privately."
            ),
            "suggested_action": (
                "Arrange a one-to-one meeting, document the employee's "
                "voluntarily shared concerns, and agree on follow-up actions."
            ),
            "priority": "HIGH",
        })
        recommendations.append({
            "category": "CAREER_DEVELOPMENT",
            "title": "Review career growth opportunities",
            "description": (
                "Assess whether suitable career development or internal "
                "mobility opportunities could address potential retention "
                "concerns."
            ),
            "suggested_action": (
                "Discuss development goals, available learning opportunities, "
                "and potential internal career paths with the employee."
            ),
            "priority": "HIGH",
        })

    elif risk_level == "MEDIUM" or probability >= 0.40:
        recommendations.append({
            "category": "ENGAGEMENT",
            "title": "Conduct an employee engagement check-in",
            "description": (
                "The prediction indicates moderate attrition risk. "
                "A supportive check-in may help identify concerns early."
            ),
            "suggested_action": (
                "Discuss workload, job satisfaction, manager support, "
                "and any assistance the employee would find useful."
            ),
            "priority": "MEDIUM",
        })

    else:
        recommendations.append({
            "category": "WORKFORCE_STABILITY",
            "title": "Maintain regular employee engagement",
            "description": (
                "The latest prediction indicates lower attrition risk. "
                "Continue normal engagement and development practices."
            ),
            "suggested_action": (
                "Continue routine feedback conversations, recognition, "
                "and career development planning."
            ),
            "priority": "LOW",
        })

    features = prediction.input_features or {}
    normalized_features = {
        str(key).strip().lower().replace(" ", "_"): value
        for key, value in features.items()
    }

    # Add a workload-related recommendation only when the input contains
    # an explicitly recognizable workload or overtime field.
    workload_keys = (
        "overtime",
        "over_time",
        "overtime_hours",
        "workload",
        "weekly_hours",
    )

    workload_value = next(
        (
            normalized_features[key]
            for key in workload_keys
            if key in normalized_features
        ),
        None,
    )

    if workload_value is not None:
        workload_text = str(workload_value).strip().lower()
        workload_is_concerning = workload_text in {
            "yes", "true", "1", "high", "excessive"
        }

        if isinstance(workload_value, (int, float)):
            workload_is_concerning = (
                workload_is_concerning or workload_value >= 45
            )

        if workload_is_concerning:
            recommendations.append({
                "category": "WORKLOAD",
                "title": "Review workload and working hours",
                "description": (
                    "The prediction input contains a workload or overtime "
                    "indicator that may warrant a discussion."
                ),
                "suggested_action": (
                    "Review workload distribution, overtime, available "
                    "support, and whether responsibilities can be adjusted."
                ),
                "priority": (
                    "HIGH" if risk_level == "HIGH" else "MEDIUM"
                ),
            })

    return recommendations


@router.post(
    "/generate",
    response_model=list[AIRecommendationResponse],
)
def generate_recommendations(
    employee_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*HR_ROLES)),
):
    """
    Generate recommendations from the latest prediction for each employee.
    Existing recommendations for the same prediction and category are kept.
    """
    predictions = latest_predictions(db)

    if employee_id is not None:
        predictions = [
            item for item in predictions
            if item.employee_id == employee_id
        ]

        if not predictions:
            employee = db.get(Employee, employee_id)
            if employee is None:
                raise HTTPException(
                    status_code=404,
                    detail="Employee not found.",
                )
            raise HTTPException(
                status_code=404,
                detail="No attrition prediction exists for this employee.",
            )

    created = []

    try:
        for prediction in predictions:
            for item in build_recommendations(prediction):
                existing = (
                    db.query(AIRecommendation)
                    .filter(
                        AIRecommendation.prediction_id == prediction.id,
                        AIRecommendation.category == item["category"],
                    )
                    .first()
                )

                if existing:
                    continue

                recommendation = AIRecommendation(
                    employee_id=prediction.employee_id,
                    prediction_id=prediction.id,
                    created_by=current_user.id,
                    status="PENDING",
                    **item,
                )
                db.add(recommendation)
                db.flush()

                write_audit_log(
                    db=db,
                    actor=current_user,
                    action="AI_RECOMMENDATION_CREATED",
                    resource_type="ai_recommendation",
                    resource_id=recommendation.id,
                    details={
                        "employee_id": prediction.employee_id,
                        "prediction_id": prediction.id,
                        "category": item["category"],
                        "priority": item["priority"],
                    },
                )

                created.append(recommendation)

        db.commit()

        for recommendation in created:
            db.refresh(recommendation)

        return created

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to generate recommendations.",
        ) from exc


@router.get(
    "/",
    response_model=list[AIRecommendationResponse],
)
def list_recommendations(
    employee_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*HR_ROLES)),
):
    query = db.query(AIRecommendation)

    if employee_id is not None:
        query = query.filter(
            AIRecommendation.employee_id == employee_id
        )

    if status is not None:
        status = status.upper()
        if status not in {
            "PENDING", "IN_PROGRESS", "COMPLETED", "DISMISSED"
        }:
            raise HTTPException(
                status_code=400,
                detail="Invalid status.",
            )
        query = query.filter(AIRecommendation.status == status)

    if priority is not None:
        priority = priority.upper()
        if priority not in {"LOW", "MEDIUM", "HIGH"}:
            raise HTTPException(
                status_code=400,
                detail="Priority must be LOW, MEDIUM, or HIGH.",
            )
        query = query.filter(AIRecommendation.priority == priority)

    return (
        query.order_by(
            AIRecommendation.created_at.desc(),
            AIRecommendation.id.desc(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get(
    "/{recommendation_id}",
    response_model=AIRecommendationResponse,
)
def get_recommendation(
    recommendation_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*HR_ROLES)),
):
    recommendation = db.get(AIRecommendation, recommendation_id)

    if recommendation is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )

    return recommendation


@router.patch(
    "/{recommendation_id}",
    response_model=AIRecommendationResponse,
)
def update_recommendation(
    recommendation_id: int,
    payload: RecommendationStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles(*HR_ROLES)),
):
    recommendation = db.get(AIRecommendation, recommendation_id)

    if recommendation is None:
        raise HTTPException(
            status_code=404,
            detail="Recommendation not found.",
        )

    if (
        recommendation.status == "COMPLETED"
        and payload.status != "COMPLETED"
    ):
        raise HTTPException(
            status_code=400,
            detail="Completed recommendations cannot be reopened.",
        )

    old_status = recommendation.status
    recommendation.status = payload.status

    if payload.completion_notes is not None:
        recommendation.completion_notes = payload.completion_notes

    try:
        write_audit_log(
            db=db,
            actor=current_user,
            action="AI_RECOMMENDATION_UPDATED",
            resource_type="ai_recommendation",
            resource_id=recommendation.id,
            details={
                "old_status": old_status,
                "new_status": recommendation.status,
            },
        )
        db.commit()
        db.refresh(recommendation)
        return recommendation

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to update recommendation.",
        ) from exc
