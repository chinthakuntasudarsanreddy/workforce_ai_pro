
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from app.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)

    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False, unique=True)
    file_path = Column(String(500), nullable=False)

    uploaded_by = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    total_rows = Column(Integer, default=0, nullable=False)
    valid_rows = Column(Integer, default=0, nullable=False)
    invalid_rows = Column(Integer, default=0, nullable=False)
    duplicate_rows = Column(Integer, default=0, nullable=False)

    status = Column(
        String(30),
        default="UPLOADED",
        nullable=False,
    )

    validation_report = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
