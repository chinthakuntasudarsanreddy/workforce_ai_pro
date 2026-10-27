
import io
import json
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dataset_models import Dataset
from app.models import User
from app.security_dependencies import require_roles


router = APIRouter(
    prefix="/api/datasets",
    tags=["Dataset Management"],
)

UPLOAD_DIR = Path("uploads") / "datasets"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Only CSV files are supported.",
        )

    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds the 10 MB upload limit.",
        )

    try:
        df = pd.read_csv(io.BytesIO(contents))
    except (pd.errors.ParserError, UnicodeDecodeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="Invalid CSV file. Please check its format and encoding.",
        )

    if len(df.columns) == 0:
        raise HTTPException(
            status_code=400,
            detail="The CSV file must contain column headers.",
        )

    # Normalize header whitespace and reject empty or repeated headers.
    columns = [str(column).strip() for column in df.columns]

    if any(not column for column in columns):
        raise HTTPException(
            status_code=400,
            detail="Column names cannot be empty.",
        )

    if len(set(columns)) != len(columns):
        raise HTTPException(
            status_code=400,
            detail="The CSV contains duplicate column names.",
        )

    df.columns = columns

    # Count entirely blank rows and duplicate rows.
    blank_mask = df.isna().all(axis=1)
    blank_rows = int(blank_mask.sum())

    nonblank_df = df.loc[~blank_mask].copy()
    duplicate_rows = int(nonblank_df.duplicated().sum())

    total_rows = len(df)
    valid_rows = total_rows - blank_rows

    report = {
        "columns": columns,
        "total_rows": total_rows,
        "valid_rows": valid_rows,
        "invalid_rows": blank_rows,
        "duplicate_rows": duplicate_rows,
        "blank_row_numbers": [
            int(index) + 2
            for index, is_blank in enumerate(blank_mask.tolist())
            if is_blank
        ],
        "note": (
            "Invalid rows are entirely blank rows. Duplicate rows are counted "
            "separately and are not automatically removed."
        ),
    }

    stored_filename = f"{uuid.uuid4().hex}.csv"
    destination = UPLOAD_DIR / stored_filename

    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(contents)

        dataset = Dataset(
            filename=Path(file.filename).name,
            stored_filename=stored_filename,
            file_path=str(destination),
            uploaded_by=user.id,
            total_rows=total_rows,
            valid_rows=valid_rows,
            invalid_rows=blank_rows,
            duplicate_rows=duplicate_rows,
            status="VALIDATED",
            validation_report=json.dumps(report),
        )

        db.add(dataset)
        db.commit()
        db.refresh(dataset)

    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="Could not save the dataset. Check the backend logs.",
        )
    finally:
        await file.close()

    return {
        "message": "Dataset uploaded and validated successfully.",
        "dataset_id": dataset.id,
        "filename": dataset.filename,
        "total_rows": dataset.total_rows,
        "valid_rows": dataset.valid_rows,
        "invalid_rows": dataset.invalid_rows,
        "duplicate_rows": dataset.duplicate_rows,
        "validation_report": report,
    }


@router.get("/")
def list_datasets(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    datasets = (
        db.query(Dataset)
        .order_by(Dataset.created_at.desc())
        .all()
    )

    return [
        {
            "id": dataset.id,
            "filename": dataset.filename,
            "total_rows": dataset.total_rows,
            "valid_rows": dataset.valid_rows,
            "invalid_rows": dataset.invalid_rows,
            "duplicate_rows": dataset.duplicate_rows,
            "status": dataset.status,
            "uploaded_by": dataset.uploaded_by,
            "created_at": dataset.created_at,
        }
        for dataset in datasets
    ]


@router.get("/{dataset_id}")
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN", "HR")),
):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset not found.",
        )

    return {
        "id": dataset.id,
        "filename": dataset.filename,
        "total_rows": dataset.total_rows,
        "valid_rows": dataset.valid_rows,
        "invalid_rows": dataset.invalid_rows,
        "duplicate_rows": dataset.duplicate_rows,
        "status": dataset.status,
        "validation_report": (
            json.loads(dataset.validation_report)
            if dataset.validation_report
            else None
        ),
        "created_at": dataset.created_at,
    }

