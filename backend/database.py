"""SQLAlchemy database engine and session setup — works with SQLite and PostgreSQL."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from backend.config import settings


_IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")

_engine_kwargs = {}
if _IS_SQLITE:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    _engine_kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=10)

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


def init_db():
    """Create all tables. Import models first to register them on Base."""
    import backend.models  # noqa: F401 — register ORM models
    Base.metadata.create_all(bind=engine)
