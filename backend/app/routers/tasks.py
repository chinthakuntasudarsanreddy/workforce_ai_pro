
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User
from app.task_models import WorkflowTask
from app.task_schemas import (
    WorkflowTaskCreate,
    WorkflowTaskUpdate,
    WorkflowTaskResponse,
)
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log


router = APIRouter(
    prefix="/api/tasks",
    tags=["Workflow & Task Management"],
)


def employee_for_user(db: Session, user: User):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user.id)
        .first()
    )


def get_task_or_404(db: Session, task_id: int) -> WorkflowTask:
    task = db.get(WorkflowTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def can_manage_task(db: Session, task: WorkflowTask, user: User) -> bool:
    if user.role in ("ADMIN", "HR"):
        return True

    if user.role == "MANAGER":
        manager_employee = employee_for_user(db, user)
        assigned_employee = db.get(Employee, task.assigned_to)

        return (
            task.created_by == user.id
            or (
                manager_employee is not None
                and assigned_employee is not None
                and assigned_employee.manager_id == manager_employee.id
            )
        )

    return False


def ensure_task_access(
    db: Session,
    task: WorkflowTask,
    user: User,
) -> None:
    if can_manage_task(db, task, user):
        return

    if user.role == "EMPLOYEE":
        employee = employee_for_user(db, user)
        if employee and employee.id == task.assigned_to:
            return

    raise HTTPException(status_code=403, detail="Access denied")


@router.post(
    "/",
    response_model=WorkflowTaskResponse,
    status_code=201,
)
def create_task(
    payload: WorkflowTaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    employee = db.get(Employee, payload.assigned_to)
    if employee is None:
        raise HTTPException(status_code=404, detail="Assigned employee not found")

    if current_user.role == "MANAGER":
        manager_employee = employee_for_user(db, current_user)

        if (
            manager_employee is None
            or employee.manager_id != manager_employee.id
        ):
            raise HTTPException(
                status_code=403,
                detail="Managers can assign tasks only to their direct reports",
            )

    task = WorkflowTask(
        title=payload.title,
        description=payload.description,
        assigned_to=payload.assigned_to,
        created_by=current_user.id,
        due_date=payload.due_date,
        priority=payload.priority,
        status="PENDING",
    )

    try:
        db.add(task)
        db.flush()

        write_audit_log(
            db=db,
            actor=current_user,
            action="TASK_CREATED",
            resource_type="workflow_task",
            resource_id=task.id,
            details={
                "title": task.title,
                "assigned_to": task.assigned_to,
                "priority": task.priority,
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[WorkflowTaskResponse])
def list_tasks(
    status: str | None = Query(default=None),
    assigned_to: int | None = Query(default=None, gt=0),
    overdue_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(WorkflowTask)

    if current_user.role == "EMPLOYEE":
        employee = employee_for_user(db, current_user)
        if employee is None:
            return []
        query = query.filter(WorkflowTask.assigned_to == employee.id)

    elif current_user.role == "MANAGER":
        manager_employee = employee_for_user(db, current_user)

        if manager_employee is None:
            query = query.filter(WorkflowTask.created_by == current_user.id)
        else:
            query = query.join(
                Employee,
                WorkflowTask.assigned_to == Employee.id,
            ).filter(
                (Employee.manager_id == manager_employee.id)
                | (WorkflowTask.created_by == current_user.id)
            )

    elif current_user.role not in ("ADMIN", "HR"):
        raise HTTPException(status_code=403, detail="Access denied")

    if assigned_to is not None:
        query = query.filter(WorkflowTask.assigned_to == assigned_to)

    if status is not None:
        normalized_status = status.upper()
        if normalized_status not in ("PENDING", "IN_PROGRESS", "COMPLETED"):
            raise HTTPException(
                status_code=400,
                detail="Invalid task status",
            )
        query = query.filter(WorkflowTask.status == normalized_status)

    if overdue_only:
        from datetime import date

        query = query.filter(
            WorkflowTask.due_date < date.today(),
            WorkflowTask.status != "COMPLETED",
        )

    return (
        query.order_by(WorkflowTask.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get("/{task_id}", response_model=WorkflowTaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_task_access(db, task, current_user)
    return task


@router.patch("/{task_id}", response_model=WorkflowTaskResponse)
def update_task(
    task_id: int,
    payload: WorkflowTaskUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_task_access(db, task, current_user)

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    is_manager = can_manage_task(db, task, current_user)

    if not is_manager:
        # Employees may update progress notes/status only.
        permitted_fields = {"status", "completion_notes"}
        if set(changes) - permitted_fields:
            raise HTTPException(
                status_code=403,
                detail="Employees can update only task status and completion notes",
            )

    if task.status == "COMPLETED" and changes.get("status") != "COMPLETED":
        raise HTTPException(
            status_code=400,
            detail="Completed tasks cannot be reopened",
        )

    old_values = {
        key: str(getattr(task, key))
        if getattr(task, key) is not None
        else None
        for key in changes
    }

    try:
        for key, value in changes.items():
            setattr(task, key, value)

        db.flush()

        write_audit_log(
            db=db,
            actor=current_user,
            action="TASK_UPDATED",
            resource_type="workflow_task",
            resource_id=task.id,
            details={
                "changed_fields": list(changes.keys()),
                "old_values": old_values,
                "new_status": task.status,
            },
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise


@router.post("/{task_id}/complete", response_model=WorkflowTaskResponse)
def complete_task(
    task_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_task_access(db, task, current_user)

    if task.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Task is already completed")

    try:
        task.status = "COMPLETED"

        write_audit_log(
            db=db,
            actor=current_user,
            action="TASK_COMPLETED",
            resource_type="workflow_task",
            resource_id=task.id,
            details={"assigned_to": task.assigned_to},
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(task)
        return task
    except Exception:
        db.rollback()
        raise
