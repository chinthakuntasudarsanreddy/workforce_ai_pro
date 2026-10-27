
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
import calendar

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)

from app.database import get_db
from app.models import Employee, Payroll, User
from app.security_dependencies import get_current_user, require_roles
from app.services.audit import write_audit_log


router = APIRouter(prefix="/api/payroll", tags=["Payroll Management"])

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


class PayrollCreate(BaseModel):
    employee_id: int = Field(gt=0)
    pay_year: int = Field(ge=2000, le=2100)
    pay_month: int = Field(ge=1, le=12)
    allowances: Decimal = Field(default=ZERO, ge=0)
    bonus: Decimal = Field(default=ZERO, ge=0)
    incentives: Decimal = Field(default=ZERO, ge=0)
    deductions: Decimal = Field(default=ZERO, ge=0)
    # Configurable withholding percentage, not a full tax assessment.
    tax_rate: Decimal = Field(default=ZERO, ge=0, le=100)


def payroll_response(item: Payroll) -> dict:
    return {
        "id": item.id,
        "employee_id": item.employee_id,
        "pay_year": item.pay_year,
        "pay_month": item.pay_month,
        "pay_period": (
            f"{calendar.month_name[item.pay_month]} {item.pay_year}"
        ),
        "base_salary": item.base_salary,
        "allowances": item.allowances,
        "bonus": item.bonus,
        "incentives": item.incentives,
        "gross_pay": item.gross_pay,
        "tax_rate": item.tax_rate,
        "tax_deduction": item.tax_deduction,
        "other_deductions": item.deductions,
        "net_pay": item.net_pay,
        "status": item.status,
        "generated_by": item.generated_by,
        "paid_at": item.paid_at,
        "created_at": item.created_at,
    }


@router.post("/generate", status_code=201)
def generate_payroll(
    data: PayrollCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, data.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    if employee.status == "INACTIVE":
        raise HTTPException(
            400, "Cannot generate payroll for an inactive employee"
        )

    if employee.salary is None or Decimal(employee.salary) < 0:
        raise HTTPException(
            400, "Set a valid employee base salary before payroll generation"
        )

    existing = db.scalar(
        select(Payroll.id).where(
            Payroll.employee_id == employee.id,
            Payroll.pay_year == data.pay_year,
            Payroll.pay_month == data.pay_month,
        )
    )

    if existing is not None:
        raise HTTPException(
            409, "Payroll already exists for this employee and month"
        )

    base = money(employee.salary)
    allowances = money(data.allowances)
    bonus = money(data.bonus)
    incentives = money(data.incentives)
    other_deductions = money(data.deductions)
    tax_rate = money(data.tax_rate)

    gross = money(base + allowances + bonus + incentives)
    tax_deduction = money(gross * tax_rate / Decimal("100"))

    if tax_deduction + other_deductions > gross:
        raise HTTPException(
            400, "Tax and other deductions cannot exceed gross pay"
        )

    net = money(gross - tax_deduction - other_deductions)

    item = Payroll(
        employee_id=employee.id,
        pay_year=data.pay_year,
        pay_month=data.pay_month,
        base_salary=base,
        allowances=allowances,
        bonus=bonus,
        incentives=incentives,
        deductions=other_deductions,
        tax_rate=tax_rate,
        tax_deduction=tax_deduction,
        gross_pay=gross,
        net_pay=net,
        status="GENERATED",
        generated_by=user.id,
    )

    db.add(item)

    try:
        # Generate the payroll ID before creating the audit entry.
        db.flush()

        write_audit_log(
            db=db,
            actor=user,
            action="PAYROLL_CREATED",
            resource_type="Payroll",
            resource_id=item.id,
            details={
                "employee_id": employee.id,
                "pay_year": data.pay_year,
                "pay_month": data.pay_month,
                "gross_pay": str(gross),
                "net_pay": str(net),
                "status": "GENERATED",
            },
        )

        # Payroll and its audit entry are committed together.
        db.commit()
        db.refresh(item)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Payroll already exists for this employee and month"
        )
    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not generate payroll")

    return {
        "message": "Payroll generated successfully",
        "payroll": payroll_response(item),
    }


@router.get("/my")
def my_payroll(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    employee = db.scalar(
        select(Employee).where(Employee.user_id == user.id)
    )

    if employee is None:
        raise HTTPException(
            404, "No employee profile is linked to this account"
        )

    records = db.scalars(
        select(Payroll)
        .where(Payroll.employee_id == employee.id)
        .order_by(Payroll.pay_year.desc(), Payroll.pay_month.desc())
    ).all()

    return {
        "total": len(records),
        "payroll_records": [payroll_response(item) for item in records],
    }


@router.get("/")
def list_payroll(
    pay_year: int | None = None,
    pay_month: int | None = None,
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    if pay_year is not None and not 2000 <= pay_year <= 2100:
        raise HTTPException(400, "Invalid pay year")

    if pay_month is not None and not 1 <= pay_month <= 12:
        raise HTTPException(400, "Invalid pay month")

    query = select(Payroll)

    if pay_year is not None:
        query = query.where(Payroll.pay_year == pay_year)

    if pay_month is not None:
        query = query.where(Payroll.pay_month == pay_month)

    if employee_id is not None:
        query = query.where(Payroll.employee_id == employee_id)

    records = db.scalars(
        query.order_by(Payroll.pay_year.desc(), Payroll.pay_month.desc())
    ).all()

    return {
        "total": len(records),
        "payroll_records": [payroll_response(item) for item in records],
    }


@router.patch("/{payroll_id}/pay")
def mark_payroll_paid(
    payroll_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    item = db.get(Payroll, payroll_id)

    if item is None:
        raise HTTPException(404, "Payroll record not found")

    if item.status == "PAID":
        raise HTTPException(409, "Payroll is already marked as paid")

    previous_status = item.status
    item.status = "PAID"
    item.paid_at = datetime.utcnow()

    try:
        write_audit_log(
            db=db,
            actor=user,
            action="PAYROLL_MARKED_PAID",
            resource_type="Payroll",
            resource_id=item.id,
            details={
                "employee_id": item.employee_id,
                "pay_year": item.pay_year,
                "pay_month": item.pay_month,
                "previous_status": previous_status,
                "new_status": "PAID",
            },
        )

        # Payment status and audit entry are committed together.
        db.commit()
        db.refresh(item)

    except Exception:
        db.rollback()
        raise HTTPException(500, "Could not update payment status")

    return {
        "message": "Payroll marked as paid",
        "payroll": payroll_response(item),
    }


@router.get("/{payroll_id}/payslip")
def download_payslip(
    payroll_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.get(Payroll, payroll_id)

    if item is None:
        raise HTTPException(404, "Payroll record not found")

    employee = db.get(Employee, item.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee profile not found")

    # Employees may download only their own payslips.
    if user.role not in ("ADMIN", "HR") and employee.user_id != user.id:
        raise HTTPException(
            403, "You cannot access another employee's payslip"
        )

    period = f"{calendar.month_name[item.pay_month]} {item.pay_year}"
    employee_name = employee.user.full_name if employee.user else "Employee"

    def rupees(value) -> str:
        return f"INR {Decimal(value):,.2f}"

    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()

    story = [
        Paragraph("WorkForce AI Pro", styles["Title"]),
        Paragraph("Employee Salary Payslip", styles["Heading2"]),
        Spacer(1, 5 * mm),
        Paragraph(f"<b>Employee:</b> {employee_name}", styles["Normal"]),
        Paragraph(
            f"<b>Employee code:</b> {employee.employee_code}",
            styles["Normal"],
        ),
        Paragraph(f"<b>Pay period:</b> {period}", styles["Normal"]),
        Paragraph(f"<b>Payment status:</b> {item.status}", styles["Normal"]),
        Spacer(1, 6 * mm),
    ]

    rows = [
        ["Salary component", "Amount"],
        ["Base salary", rupees(item.base_salary)],
        ["Allowances", rupees(item.allowances)],
        ["Bonus", rupees(item.bonus)],
        ["Incentives", rupees(item.incentives)],
        ["Gross pay", rupees(item.gross_pay)],
        [f"Tax withholding ({item.tax_rate}%)", rupees(item.tax_deduction)],
        ["Other deductions", rupees(item.deductions)],
        ["NET PAY", rupees(item.net_pay)],
    ]

    table = Table(rows, colWidths=[100 * mm, 55 * mm], repeatRows=1)

    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3A5F")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8F0FE")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    story.extend([
        table,
        Spacer(1, 8 * mm),
        Paragraph(
            "This payslip was generated electronically by WorkForce AI Pro.",
            styles["Italic"],
        ),
    ])

    document.build(story)
    buffer.seek(0)

    filename = (
        f"payslip_{employee.employee_code}_"
        f"{item.pay_year}_{item.pay_month:02d}.pdf"
    )

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )
