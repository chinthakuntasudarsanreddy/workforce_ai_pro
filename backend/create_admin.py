
import getpass

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import User
from app.security import hash_password


def main():
    Base.metadata.create_all(bind=engine)

    email = input("Admin email: ").strip().lower()
    full_name = input("Admin full name: ").strip()
    password = getpass.getpass("Admin password (minimum 12 characters): ")

    if len(password) < 12 or len(password) > 72:
        print("Password must contain 12–72 characters.")
        return

    db = SessionLocal()

    try:
        existing = db.scalar(select(User).where(User.email == email))

        if existing:
            print("This email already exists. No changes made.")
            return

        admin = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role="ADMIN",
            is_active=True,
        )

        db.add(admin)
        db.commit()
        print("Administrator created successfully.")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
