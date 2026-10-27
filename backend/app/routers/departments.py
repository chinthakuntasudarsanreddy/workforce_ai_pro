
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.security_dependencies import require_roles
from app.models import Department, Employee, User
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/departments", tags=["Departments"])


@router.get("/")
def list_departments(
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    query = select(Department)

    if search:
        query = query.where(Department.name.ilike(f"%{search}%"))

    departments = db.scalars(query.order_by(Department.name)).all()

    return [
        {
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "is_active": d.is_active,
            "employee_count": db.scalar(
                select(func.count(Employee.id)).where(
                    Employee.department_id == d.id,
                    Employee.status != "INACTIVE",
                )
            ),
        }
        for d in departments
    ]


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_department(
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    name = str(data.get("name", "")).strip()

    if not name or len(name) > 100:
        raise HTTPException(
            422, "Department name is required (max 100 characters)"
        )

    existing = db.scalar(
        select(Department).where(func.lower(Department.name) == name.lower())
    )
    if existing:
        raise HTTPException(409, "Department already exists")

    department = Department(
        name=name,
        description=data.get("description"),
    )
    db.add(department)

    try:
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="DEPARTMENT_CREATED",
            resource_type="department",
            resource_id=department.id,
            details={"name": department.name},
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
        db.refresh(department)
    except Exception:
        db.rollback()
        raise

    return {"id": department.id, "name": department.name}


@router.patch("/{department_id}")
def update_department(
    department_id: int,
    data: dict,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(404, "Department not found")

    changes = {}

    if "name" in data:
        name = str(data["name"]).strip()
        if not name or len(name) > 100:
            raise HTTPException(422, "Invalid department name")

        duplicate = db.scalar(
            select(Department).where(
                func.lower(Department.name) == name.lower(),
                Department.id != department_id,
            )
        )
        if duplicate:
            raise HTTPException(409, "Department name already exists")

        if department.name != name:
            changes["name"] = {"old": department.name, "new": name}
        department.name = name

    if "description" in data:
        if department.description != data["description"]:
            changes["description"] = {
                "old": department.description,
                "new": data["description"],
            }
        department.description = data["description"]

    try:
        if changes:
            write_audit_log(
                db=db,
                actor=user,
                action="DEPARTMENT_UPDATED",
                resource_type="department",
                resource_id=department.id,
                details=changes,
                ip_address=request.client.host if request.client else None,
            )

        db.commit()
        db.refresh(department)
    except Exception:
        db.rollback()
        raise

    return {"id": department.id, "name": department.name}


@router.delete(
    "/{department_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def deactivate_department(
    department_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(404, "Department not found")

    if not department.is_active:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    try:
        department.is_active = False

        write_audit_log(
            db=db,
            actor=user,
            action="DEPARTMENT_DEACTIVATED",
            resource_type="department",
            resource_id=department.id,
            details={"name": department.name},
            ip_address=request.client.host if request.client else None,
        )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return Response(status_code=status.HTTP_204_NO_CONTENT)
