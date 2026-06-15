"""SQLAlchemy database engine and session setup."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


def init_db():
    """Create all tables. Import models first to register them on Base."""
    import backend.models  # noqa: F401 — register ORM models
    Base.metadata.create_all(bind=engine)
