
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("ADMIN", "HR", "MANAGER", "EMPLOYEE", name="user_roles"),
        nullable=False,
        default="EMPLOYEE",
    )
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    employee_profile = relationship(
        "Employee",
        back_populates="user",
        uselist=False,
    )


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    employees = relationship("Employee", back_populates="department")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    employee_code = Column(String(30), unique=True, nullable=False, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )
    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=True,
    )
    manager_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=True,
    )
    job_title = Column(String(120), nullable=False)
    phone = Column(String(25), nullable=True)
    hire_date = Column(Date, nullable=False, default=date.today)
    employment_type = Column(
        Enum(
            "FULL_TIME",
            "PART_TIME",
            "CONTRACT",
            name="employment_types",
        ),
        default="FULL_TIME",
        nullable=False,
    )
    salary = Column(Numeric(12, 2), nullable=True)
    status = Column(
        Enum(
            "ACTIVE",
            "INACTIVE",
            "ON_LEAVE",
            name="employee_statuses",
        ),
        default="ACTIVE",
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="employee_profile")
    department = relationship("Department", back_populates="employees")
    manager = relationship("Employee", remote_side="Employee.id")


class Attendance(Base):
    __tablename__ = "attendance_records"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "attendance_date",
            name="uq_attendance_employee_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )
    attendance_date = Column(Date, default=date.today, nullable=False)
    clock_in = Column(DateTime, nullable=True)
    clock_out = Column(DateTime, nullable=True)
    work_minutes = Column(Integer, default=0, nullable=False)
    status = Column(
        Enum(
            "PRESENT",
            "LATE",
            "HALF_DAY",
            "ABSENT",
            name="attendance_statuses",
        ),
        default="PRESENT",
        nullable=False,
    )
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    break_minutes = Column(Integer, default=60, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )
    shift_id = Column(
        Integer,
        ForeignKey("shifts.id"),
        nullable=False,
    )
    effective_from = Column(Date, default=date.today, nullable=False)
    effective_until = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    leave_type = Column(
        Enum(
            "ANNUAL",
            "SICK",
            "CASUAL",
            "UNPAID",
            "OTHER",
            name="leave_types",
        ),
        nullable=False,
    )
    reason = Column(Text, nullable=False)
    status = Column(
        Enum(
            "PENDING",
            "APPROVED",
            "REJECTED",
            name="leave_statuses",
        ),
        default="PENDING",
        nullable=False,
    )
    reviewed_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )
    reviewed_at = Column(DateTime, nullable=True)
    review_comment = Column(Text, nullable=True)
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )


class Payroll(Base):
    __tablename__ = "payroll_records"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "pay_year",
            "pay_month",
            name="uq_payroll_employee_period",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(
        Integer,
        ForeignKey("employees.id"),
        nullable=False,
        index=True,
    )
    pay_year = Column(Integer, nullable=False)
    pay_month = Column(Integer, nullable=False)

    # Salary breakdown
    base_salary = Column(Numeric(12, 2), nullable=False)
    allowances = Column(Numeric(12, 2), default=0, nullable=False)
    bonus = Column(Numeric(12, 2), default=0, nullable=False)
    incentives = Column(Numeric(12, 2), default=0, nullable=False)

    # Deductions and tax withholding
    deductions = Column(Numeric(12, 2), default=0, nullable=False)
    tax_rate = Column(Numeric(5, 2), default=0, nullable=False)
    tax_deduction = Column(Numeric(12, 2), default=0, nullable=False)

    # Final salary calculations
    gross_pay = Column(Numeric(12, 2), nullable=False)
    net_pay = Column(Numeric(12, 2), nullable=False)

    status = Column(
        Enum("GENERATED", "PAID", name="payroll_statuses"),
        default="GENERATED",
        nullable=False,
    )

    generated_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(
        Enum(
            "GENERAL",
            "LEAVE",
            "PAYROLL",
            "ATTENDANCE",
            "SYSTEM",
            name="notification_types",
        ),
        default="GENERAL",
        nullable=False,
    )
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    read_at = Column(DateTime, nullable=True)
