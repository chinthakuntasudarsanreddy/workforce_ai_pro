
import os
import uuid
from pathlib import Path

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, UploadFile
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User
from app.document_models import EmployeeDocument
from app.security_dependencies import get_current_user


router = APIRouter(prefix="/api/documents", tags=["Documents"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "documents"
MAX_FILE_SIZE = 10 * 1024 * 1024

ALLOWED_TYPES = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".doc": {"application/msword", "application/octet-stream"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document",
        "application/octet-stream",
    },
}


def get_employee(db: Session, employee_id: int):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return employee


def can_access_employee(
    db: Session, current_user: User, employee: Employee
) -> bool:
    if current_user.role in ("ADMIN", "HR"):
        return True

    own_employee = db.scalar(
        select(Employee).where(Employee.user_id == current_user.id)
    )

    if not own_employee:
        return False

    if own_employee.id == employee.id:
        return True

    if current_user.role == "MANAGER":
        return employee.manager_id == own_employee.id

    return False


def require_employee_access(
    db: Session, current_user: User, employee_id: int
):
    employee = get_employee(db, employee_id)
    if not can_access_employee(db, current_user, employee):
        raise HTTPException(status_code=403, detail="Access denied")
    return employee


def document_response(doc: EmployeeDocument):
    return {
        "id": doc.id,
        "employee_id": doc.employee_id,
        "uploaded_by_user_id": doc.uploaded_by_user_id,
        "original_filename": doc.original_filename,
        "content_type": doc.content_type,
        "file_size": doc.file_size,
        "created_at": doc.created_at.isoformat(),
        "download_url": f"/api/documents/{doc.id}/download",
    }


def stored_path(doc: EmployeeDocument) -> Path:
    # Stored names are generated UUIDs, never user-supplied paths.
    path = (UPLOAD_DIR / doc.stored_filename).resolve()
    if path.parent != UPLOAD_DIR.resolve():
        raise HTTPException(status_code=500, detail="Invalid stored file path")
    return path


@router.post("", status_code=201)
async def upload_document(
    employee_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_employee_access(db, current_user, employee_id)

    original_name = Path(file.filename or "document").name
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Allowed formats: PDF, PNG, JPG, JPEG, DOC, DOCX",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES[extension]:
        raise HTTPException(
            status_code=415,
            detail="File extension and content type do not match",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty")
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, detail="Maximum file size is 10 MB"
        )

    # Check common file signatures for the formats that have stable signatures.
    signatures = {
        ".pdf": content.startswith(b"%PDF-"),
        ".png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": content.startswith(b"\xff\xd8\xff"),
        ".jpeg": content.startswith(b"\xff\xd8\xff"),
    }
    if extension in signatures and not signatures[extension]:
        raise HTTPException(
            status_code=415, detail="File content does not match its extension"
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name

    try:
        with destination.open("xb") as output:
            output.write(content)

        doc = EmployeeDocument(
            employee_id=employee_id,
            uploaded_by_user_id=current_user.id,
            original_filename=original_name[:255],
            stored_filename=stored_name,
            content_type=content_type,
            file_size=len(content),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return document_response(doc)

    except Exception:
        db.rollback()
        if destination.exists():
            destination.unlink()
        raise
    finally:
        await file.close()


@router.get("")
def list_documents(
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if employee_id is None:
        if current_user.role in ("ADMIN", "HR"):
            query = select(EmployeeDocument)
        else:
            own_employee = db.scalar(
                select(Employee).where(Employee.user_id == current_user.id)
            )
            if not own_employee:
                raise HTTPException(
                    status_code=403, detail="No employee profile is linked"
                )

            if current_user.role == "MANAGER":
                managed_ids = select(Employee.id).where(
                    Employee.manager_id == own_employee.id
                )
                query = select(EmployeeDocument).where(
                    (EmployeeDocument.employee_id == own_employee.id)
                    | EmployeeDocument.employee_id.in_(managed_ids)
                )
            else:
                query = select(EmployeeDocument).where(
                    EmployeeDocument.employee_id == own_employee.id
                )
    else:
        require_employee_access(db, current_user, employee_id)
        query = select(EmployeeDocument).where(
            EmployeeDocument.employee_id == employee_id
        )

    docs = db.scalars(
        query.order_by(EmployeeDocument.created_at.desc())
    ).all()
    return [document_response(doc) for doc in docs]


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(EmployeeDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    require_employee_access(db, current_user, doc.employee_id)
    path = stored_path(doc)

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stored file not found")

    return FileResponse(
        path=str(path),
        media_type=doc.content_type,
        filename=doc.original_filename,
        content_disposition_type="attachment",
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = db.get(EmployeeDocument, document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # HR/Admin may delete any document. Employees and managers may
    # delete documents only within their normal employee-access scope.
    require_employee_access(db, current_user, doc.employee_id)
    path = stored_path(doc)

    db.delete(doc)
    db.commit()

    if path.is_file():
        try:
            os.remove(path)
        except OSError:
            # The database record is deleted; a leftover file can be
            # removed by a maintenance job if the filesystem is unavailable.
            pass

    return {"message": "Document deleted", "document_id": document_id}
