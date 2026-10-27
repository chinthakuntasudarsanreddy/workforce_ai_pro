
import csv
import io
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.security_dependencies import require_roles
from app.models import Department, Employee, User
from app.security import hash_password
from app.services.audit import write_audit_log

router = APIRouter(prefix="/api/employees", tags=["Employees"])


class EmployeeCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=12, max_length=72)
    employee_code: str = Field(min_length=1, max_length=30)
    department_id: int | None = None
    manager_id: int | None = None
    job_title: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=25)
    hire_date: date
    employment_type: str = "FULL_TIME"
    salary: Decimal | None = Field(default=None, ge=0)


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    department_id: int | None = None
    manager_id: int | None = None
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=25)
    hire_date: date | None = None
    employment_type: str | None = None
    salary: Decimal | None = Field(default=None, ge=0)
    status: str | None = None


def serialize_employee(employee: Employee):
    return {
        "id": employee.id,
        "employee_code": employee.employee_code,
        "user_id": employee.user_id,
        "full_name": employee.user.full_name,
        "email": employee.user.email,
        "department_id": employee.department_id,
        "department": employee.department.name if employee.department else None,
        "manager_id": employee.manager_id,
        "job_title": employee.job_title,
        "phone": employee.phone,
        "hire_date": employee.hire_date,
        "employment_type": employee.employment_type,
        "salary": employee.salary,
        "status": employee.status,
    }


def build_employee_query(
    search: str | None,
    department_id: int | None,
    employee_status: str | None,
):
    query = (
        select(Employee)
        .join(Employee.user)
        .options(
            joinedload(Employee.user),
            joinedload(Employee.department),
        )
    )

    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                Employee.employee_code.ilike(pattern),
                Employee.job_title.ilike(pattern),
            )
        )

    if department_id is not None:
        query = query.where(Employee.department_id == department_id)

    if employee_status:
        if employee_status not in {"ACTIVE", "INACTIVE", "ON_LEAVE"}:
            raise HTTPException(422, "Invalid employee status")
        query = query.where(Employee.status == employee_status)

    return query


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_employee(
    data: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    email = data.email.strip().lower()
    code = data.employee_code.strip()

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Email already exists")

    if db.scalar(select(Employee).where(Employee.employee_code == code)):
        raise HTTPException(409, "Employee code already exists")

    if data.department_id is not None:
        department = db.get(Department, data.department_id)
        if not department or not department.is_active:
            raise HTTPException(400, "Invalid or inactive department")

    if data.manager_id is not None:
        manager = db.get(Employee, data.manager_id)
        if not manager or manager.status == "INACTIVE":
            raise HTTPException(400, "Invalid manager")

    if data.employment_type not in {"FULL_TIME", "PART_TIME", "CONTRACT"}:
        raise HTTPException(422, "Invalid employment type")

    user = User(
        full_name=data.full_name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role="EMPLOYEE",
    )
    db.add(user)
    db.flush()

    employee = Employee(
        employee_code=code,
        user_id=user.id,
        department_id=data.department_id,
        manager_id=data.manager_id,
        job_title=data.job_title.strip(),
        phone=data.phone,
        hire_date=data.hire_date,
        employment_type=data.employment_type,
        salary=data.salary,
    )
    db.add(employee)
    db.flush()

    write_audit_log(
        db=db,
        actor=current_user,
        action="EMPLOYEE_CREATED",
        resource_type="employee",
        resource_id=employee.id,
        details={
            "employee_code": employee.employee_code,
            "job_title": employee.job_title,
            "department_id": employee.department_id,
        },
    )

    db.commit()
    db.refresh(employee)

    employee = db.scalar(
        select(Employee)
        .options(joinedload(Employee.user), joinedload(Employee.department))
        .where(Employee.id == employee.id)
    )

    return serialize_employee(employee)


@router.get("/")
def list_employees(
    search: str | None = Query(default=None, max_length=100),
    department_id: int | None = None,
    employee_status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    query = build_employee_query(search, department_id, employee_status)

    employees = db.scalars(
        query.order_by(Employee.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()

    count_query = select(func.count(Employee.id)).join(Employee.user)

    if search:
        pattern = f"%{search.strip()}%"
        count_query = count_query.where(
            or_(
                User.full_name.ilike(pattern),
                User.email.ilike(pattern),
                Employee.employee_code.ilike(pattern),
                Employee.job_title.ilike(pattern),
            )
        )

    if department_id is not None:
        count_query = count_query.where(
            Employee.department_id == department_id
        )

    if employee_status:
        if employee_status not in {"ACTIVE", "INACTIVE", "ON_LEAVE"}:
            raise HTTPException(422, "Invalid employee status")
        count_query = count_query.where(Employee.status == employee_status)

    total = db.scalar(count_query) or 0

    return {
        "items": [serialize_employee(e) for e in employees],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/export/csv")
def export_employees_csv(
    search: str | None = Query(default=None, max_length=100),
    department_id: int | None = None,
    employee_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    query = build_employee_query(search, department_id, employee_status)

    employees = db.scalars(
        query.order_by(Employee.id.asc())
    ).unique().all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([
        "Employee Code",
        "Full Name",
        "Email",
        "Department",
        "Job Title",
        "Phone",
        "Hire Date",
        "Employment Type",
        "Salary",
        "Status",
    ])

    for employee in employees:
        writer.writerow([
            employee.employee_code,
            employee.user.full_name,
            employee.user.email,
            employee.department.name if employee.department else "",
            employee.job_title,
            employee.phone or "",
            employee.hire_date.isoformat() if employee.hire_date else "",
            employee.employment_type,
            str(employee.salary) if employee.salary is not None else "",
            employee.status,
        ])

    content = "\ufeff" + buffer.getvalue()
    buffer.close()

    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="employees.csv"'
        },
    )


@router.get("/{employee_id}")
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    employee = db.scalar(
        select(Employee)
        .options(joinedload(Employee.user), joinedload(Employee.department))
        .where(Employee.id == employee_id)
    )

    if not employee:
        raise HTTPException(404, "Employee not found")

    return serialize_employee(employee)


@router.patch("/{employee_id}")
def update_employee(
    employee_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, employee_id)

    if not employee:
        raise HTTPException(404, "Employee not found")

    values = data.model_dump(exclude_unset=True)
    changed_fields = sorted(values.keys())

    if "full_name" in values:
        if values["full_name"] is None:
            raise HTTPException(422, "Full name cannot be null")
        employee.user.full_name = values.pop("full_name").strip()

    if "department_id" in values and values["department_id"] is not None:
        department = db.get(Department, values["department_id"])
        if not department or not department.is_active:
            raise HTTPException(400, "Invalid or inactive department")

    if "manager_id" in values:
        manager_id = values["manager_id"]

        if manager_id == employee.id:
            raise HTTPException(400, "Employee cannot manage themselves")

        if manager_id is not None:
            manager = db.get(Employee, manager_id)
            if not manager or manager.status == "INACTIVE":
                raise HTTPException(400, "Invalid manager")

    if "employment_type" in values and values["employment_type"] not in {
        "FULL_TIME", "PART_TIME", "CONTRACT"
    }:
        raise HTTPException(422, "Invalid employment type")

    if "status" in values and values["status"] not in {
        "ACTIVE", "INACTIVE", "ON_LEAVE"
    }:
        raise HTTPException(422, "Invalid employee status")

    for field, value in values.items():
        setattr(employee, field, value)

    write_audit_log(
        db=db,
        actor=current_user,
        action="EMPLOYEE_UPDATED",
        resource_type="employee",
        resource_id=employee.id,
        details={
            "changed_fields": changed_fields,
        },
    )

    db.commit()

    employee = db.scalar(
        select(Employee)
        .options(joinedload(Employee.user), joinedload(Employee.department))
        .where(Employee.id == employee_id)
    )

    return serialize_employee(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, employee_id)

    if not employee:
        raise HTTPException(404, "Employee not found")

    previous_status = employee.status

    employee.status = "INACTIVE"
    employee.user.is_active = False

    write_audit_log(
        db=db,
        actor=current_user,
        action="EMPLOYEE_DEACTIVATED",
        resource_type="employee",
        resource_id=employee.id,
        details={
            "previous_status": previous_status,
            "new_status": "INACTIVE",
        },
    )

    db.commit()
    return None
