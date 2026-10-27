
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import APP_NAME
from app.database import Base, engine, get_db
from app.models import User
from app.dataset_models import Dataset
from app.schemas import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
)
from app.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from app.security_dependencies import get_current_user, require_roles
from app.routers import departments, employees
from app.routers import attendance, shifts, leave, payroll
from app.routers import notifications
from app.routers import datasets
from app.prediction_models import AttritionPrediction
from app.routers import attrition
from app.routers import analytics
from app.routers import chat, documents
from app.risk_monitoring_models import RiskMonitoringEvent
from app.routers import risk_monitoring
from app.routers import forecasting
from app.intervention_models import HRIntervention
from app.routers import interventions
from app.routers import notification_engine
from app.routers import workforce_monitoring
from app.routers import reports
from app.audit_models import AuditLog
from app.routers import audit_logs
from app.performance_models import PerformanceReview
from app.routers import performance_reviews
from app.task_models import WorkflowTask
from app.routers import tasks
from app.recommendation_models import AIRecommendation
from app.routers import recommendations

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description="HR management and workforce intelligence APIs",
    lifespan=lifespan,
)

# Allow requests from the local React/Vite frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(departments.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(shifts.router)
app.include_router(leave.router)
app.include_router(payroll.router)
app.include_router(notifications.router)
app.include_router(datasets.router)
app.include_router(attrition.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(risk_monitoring.router)
app.include_router(forecasting.router)
app.include_router(interventions.router)
app.include_router(notification_engine.router)
app.include_router(workforce_monitoring.router)
app.include_router(reports.router)
app.include_router(audit_logs.router)
app.include_router(performance_reviews.router)
app.include_router(tasks.router)
app.include_router(recommendations.router)

@app.get("/")
def root():
    return {"message": "WorkForce AI Pro API is running"}


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}


@app.post(
    "/api/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )

    user = User(
        full_name=data.full_name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role="EMPLOYEE",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@app.post("/api/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    email = str(data.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))

    if (
        not user
        or not verify_password(data.password, user.password_hash)
        or not user.is_active
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": user,
    }


@app.get("/api/auth/me", response_model=UserResponse)
def get_my_profile(user: User = Depends(get_current_user)):
    return user


@app.get("/api/admin/dashboard")
def admin_dashboard(
    user: User = Depends(require_roles("ADMIN")),
):
    return {
        "message": "Admin access granted",
        "user": user.full_name,
    }
