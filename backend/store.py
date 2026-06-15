"""SQLAlchemy-backed store — same Collection API, now with PostgreSQL."""

from datetime import datetime, timezone
from typing import Callable, TypeVar

from sqlalchemy import func
from sqlalchemy.orm.attributes import flag_modified

from backend.database import SessionLocal
from backend.models import (
    User, Project, Dataset, DatasetVersion, LabelClass,
    Image, Annotation, ModelConfig, TrainedModel, TrainingJob,
)

T = TypeVar("T")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _model_to_dict(row) -> dict:
    """Convert a SQLAlchemy model instance to a plain dict with ISO timestamps.

    Also merges top-level keys from extra_data JSONB column for backward compat
    with dynamic fields (e.g. cvimodel conversion progress).
    """
    if row is None:
        return None
    d = {}
    for c in row.__table__.columns:
        val = getattr(row, c.name)
        if c.name == "extra_data":
            continue  # Handled below
        if isinstance(val, datetime):
            d[c.name] = val.isoformat()
        else:
            d[c.name] = val
    # Merge extra_data keys at top level (only keys not already present)
    if hasattr(row, "extra_data"):
        extra = getattr(row, "extra_data") or {}
        if isinstance(extra, dict):
            for k, v in extra.items():
                if k not in d:
                    d[k] = v
    return d


class Collection:
    """A collection backed by a SQLAlchemy model, keeping the original dict-based API."""

    def __init__(self, model_cls):
        self.model = model_cls

    def _session(self):
        return SessionLocal()

    def all(self) -> list[dict]:
        with self._session() as session:
            rows = session.query(self.model).all()
            return [_model_to_dict(r) for r in rows]

    def filter(self, fn: Callable[[dict], bool]) -> list[dict]:
        """Load all rows and filter in Python. Compatible with existing lambda-based usage."""
        return [r for r in self.all() if fn(r)]

    def get(self, id: str) -> dict | None:
        with self._session() as session:
            row = session.get(self.model, id)
            return _model_to_dict(row) if row else None

    def create(self, data: dict) -> dict:
        with self._session() as session:
            data.setdefault("id", "")
            data.setdefault("created_at", now())
            if not data["id"]:
                from backend.models import _new_id
                data["id"] = _new_id()

            # Parse created_at string back to datetime for the DB column
            if isinstance(data.get("created_at"), str):
                try:
                    data["created_at"] = datetime.fromisoformat(data["created_at"])
                except (ValueError, TypeError):
                    data["created_at"] = datetime.now(timezone.utc)

            obj = self.model(**data)
            session.add(obj)
            session.commit()
            session.refresh(obj)
            return _model_to_dict(obj)

    def update(self, id: str, patch: dict) -> dict | None:
        with self._session() as session:
            row = session.get(self.model, id)
            if not row:
                return None

            patch.setdefault("updated_at", now())
            extra = {}
            for k, v in patch.items():
                if hasattr(row, k):
                    # Parse ISO datetime strings back to datetime objects
                    if isinstance(v, str) and k in ("created_at", "updated_at", "started_at",
                                                      "completed_at", "training_completed_at"):
                        try:
                            v = datetime.fromisoformat(v)
                        except (ValueError, TypeError):
                            pass
                    setattr(row, k, v)
                elif hasattr(row, "extra_data"):
                    # Dynamic field — store in extra_data JSONB
                    extra[k] = v
                # If neither column nor extra_data, silently skip

            # Merge extra fields into extra_data (in-place mutation for change tracking)
            if extra:
                current_extra = getattr(row, "extra_data")
                if current_extra is None:
                    current_extra = {}
                    setattr(row, "extra_data", current_extra)
                if isinstance(current_extra, dict):
                    current_extra.update(extra)
                    flag_modified(row, "extra_data")  # Ensure SQLAlchemy detects the mutation

            session.commit()
            session.refresh(row)
            return _model_to_dict(row)

    def delete(self, id: str) -> bool:
        with self._session() as session:
            row = session.get(self.model, id)
            if not row:
                return False
            session.delete(row)
            session.commit()
            return True

    def count(self) -> int:
        with self._session() as session:
            return session.query(func.count(self.model.id)).scalar()

    def paginate(self, page=1, per_page=20, fn: Callable[[dict], bool] | None = None) -> dict:
        items = self.filter(fn) if fn else self.all()
        total = len(items)
        start = (page - 1) * per_page
        return {"items": items[start : start + per_page], "total": total, "page": page, "per_page": per_page}


# Global collections — same names, same API, now SQL-backed
db = {
    "users": Collection(User),
    "projects": Collection(Project),
    "datasets": Collection(Dataset),
    "dataset_versions": Collection(DatasetVersion),
    "label_classes": Collection(LabelClass),
    "images": Collection(Image),
    "annotations": Collection(Annotation),
    "model_configs": Collection(ModelConfig),
    "trained_models": Collection(TrainedModel),
    "training_jobs": Collection(TrainingJob),
}


def _seed():
    """Seed default dev user."""
    users = db["users"]
    if not users.filter(lambda u: u["email"] == "dev@example.com"):
        users.create({
            "username": "dev",
            "email": "dev@example.com",
            "password_hash": "$2b$12$LJ3m4ys3Lk0TSwHCpNqrFOXGF4LFTIqHBTjVGBqTLkSJ3vOLxDPTu",
            "is_active": True,
            "is_superuser": True,
            "storage_used_bytes": 0,
        })
