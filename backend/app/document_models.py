
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from app.database import Base


class EmployeeDocument(Base):
    __tablename__ = "employee_documents"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    uploaded_by_user_id = Column(
        Integer, ForeignKey("users.id"),
        nullable=False, index=True,
    )
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(100), unique=True, nullable=False)
    content_type = Column(String(120), nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
