
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User
from app.performance_models import PerformanceReview
from app.performance_schemas import (
    PerformanceReviewCreate,
    PerformanceReviewUpdate,
    PerformanceReviewResponse,
)
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log


router = APIRouter(
    prefix="/api/performance-reviews",
    tags=["Performance Reviews"],
)


def get_employee_for_user(db: Session, user: User):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user.id)
        .first()
    )


def get_review_or_404(db: Session, review_id: int):
    review = db.get(PerformanceReview, review_id)
    if not review:
        raise HTTPException(
            status_code=404,
            detail="Performance review not found",
        )
    return review


def check_review_access(
    db: Session,
    review: PerformanceReview,
    user: User,
):
    if user.role in ("ADMIN", "HR"):
        return

    if user.role == "EMPLOYEE":
        employee = get_employee_for_user(db, user)
        if not employee or employee.id != review.employee_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return

    if user.role == "MANAGER":
        manager_employee = get_employee_for_user(db, user)
        target_employee = db.get(Employee, review.employee_id)

        is_reviewer = review.reviewer_id == user.id
        is_direct_report = (
            manager_employee is not None
            and target_employee is not None
            and target_employee.manager_id == manager_employee.id
        )

        if not is_reviewer and not is_direct_report:
            raise HTTPException(status_code=403, detail="Access denied")
        return

    raise HTTPException(status_code=403, detail="Access denied")


@router.post(
    "/",
    response_model=PerformanceReviewResponse,
    status_code=201,
)
def create_review(
    payload: PerformanceReviewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    employee = db.get(Employee, payload.employee_id)

    if not employee:
        raise HTTPException(
            status_code=404,
            detail="Employee not found",
        )

    if payload.review_period_end < payload.review_period_start:
        raise HTTPException(
            status_code=400,
            detail="Review period end must not precede start",
        )

    review = PerformanceReview(
        employee_id=payload.employee_id,
        reviewer_id=current_user.id,
        review_period_start=payload.review_period_start,
        review_period_end=payload.review_period_end,
        rating=payload.rating,
        feedback=payload.feedback,
        goals=payload.goals,
        status=payload.status,
    )

    try:
        db.add(review)
        db.flush()

        write_audit_log(
            db=db,
            actor=current_user,
            action="PERFORMANCE_REVIEW_CREATED",
            resource_type="performance_review",
            resource_id=review.id,
            details={
                "employee_id": review.employee_id,
                "rating": review.rating,
                "status": review.status,
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(review)
        return review

    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[PerformanceReviewResponse])
def list_reviews(
    employee_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PerformanceReview)

    if current_user.role == "EMPLOYEE":
        employee = get_employee_for_user(db, current_user)

        if not employee:
            return []

        query = query.filter(
            PerformanceReview.employee_id == employee.id
        )

    elif current_user.role == "MANAGER":
        manager_employee = get_employee_for_user(db, current_user)

        if manager_employee:
            query = query.join(
                Employee,
                PerformanceReview.employee_id == Employee.id,
            ).filter(
                (Employee.manager_id == manager_employee.id)
                | (PerformanceReview.reviewer_id == current_user.id)
            )
        else:
            query = query.filter(
                PerformanceReview.reviewer_id == current_user.id
            )

    elif current_user.role not in ("ADMIN", "HR"):
        raise HTTPException(status_code=403, detail="Access denied")

    if employee_id is not None:
        query = query.filter(
            PerformanceReview.employee_id == employee_id
        )

    if status:
        query = query.filter(
            PerformanceReview.status == status.upper()
        )

    return (
        query.order_by(PerformanceReview.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get(
    "/{review_id}",
    response_model=PerformanceReviewResponse,
)
def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    review = get_review_or_404(db, review_id)
    check_review_access(db, review, current_user)
    return review


@router.patch(
    "/{review_id}",
    response_model=PerformanceReviewResponse,
)
def update_review(
    review_id: int,
    payload: PerformanceReviewUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    review = get_review_or_404(db, review_id)

    if current_user.role == "MANAGER":
        if review.reviewer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Managers may edit only reviews they created",
            )

    if review.status == "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail="Completed reviews cannot be edited",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            status_code=400,
            detail="No changes provided",
        )

    start = changes.get(
        "review_period_start",
        review.review_period_start,
    )
    end = changes.get(
        "review_period_end",
        review.review_period_end,
    )

    if start is not None and end is not None and end < start:
        raise HTTPException(
            status_code=400,
            detail="Review period end must not precede start",
        )

    old_values = {
        field: getattr(review, field)
        for field in changes
    }

    try:
        for field, value in changes.items():
            setattr(review, field, value)

        db.flush()

        write_audit_log(
            db=db,
            actor=current_user,
            action="PERFORMANCE_REVIEW_UPDATED",
            resource_type="performance_review",
            resource_id=review.id,
            details={
                "changed_fields": list(changes.keys()),
                "old_values": {
                    key: str(value) if value is not None else None
                    for key, value in old_values.items()
                },
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(review)
        return review

    except Exception:
        db.rollback()
        raise


@router.post(
    "/{review_id}/complete",
    response_model=PerformanceReviewResponse,
)
def complete_review(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    review = get_review_or_404(db, review_id)

    if current_user.role == "MANAGER":
        if review.reviewer_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Managers may complete only reviews they created",
            )

    if review.status != "SUBMITTED":
        raise HTTPException(
            status_code=400,
            detail="Only submitted reviews can be completed",
        )

    try:
        review.status = "COMPLETED"

        write_audit_log(
            db=db,
            actor=current_user,
            action="PERFORMANCE_REVIEW_COMPLETED",
            resource_type="performance_review",
            resource_id=review.id,
            details={"employee_id": review.employee_id},
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(review)
        return review

    except Exception:
        db.rollback()
        raise
