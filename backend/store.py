"""File-based JSON store — no database required."""

import json
import os
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar, Callable

STORAGE_DIR = Path(os.environ.get("STORAGE_ROOT", Path(__file__).resolve().parent.parent / "storage"))
DATA_DIR = STORAGE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()
T = TypeVar("T")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Collection:
    """A collection of records stored in a JSON file."""

    def __init__(self, name: str):
        self.name = name
        self._path = DATA_DIR / f"{name}.json"

    def _read(self) -> list[dict]:
        if not self._path.exists():
            return []
        with open(self._path, "r") as f:
            return json.load(f)

    def _write(self, data: list[dict]):
        with open(self._path, "w") as f:
            json.dump(data, f, indent=2, default=str)

    def all(self) -> list[dict]:
        with _lock:
            return self._read()

    def filter(self, fn: Callable[[dict], bool]) -> list[dict]:
        return [r for r in self.all() if fn(r)]

    def get(self, id: str) -> dict | None:
        with _lock:
            for r in self._read():
                if r.get("id") == id:
                    return r
        return None

    def create(self, data: dict) -> dict:
        with _lock:
            records = self._read()
            data["id"] = data.get("id") or str(uuid.uuid4())
            data["created_at"] = data.get("created_at") or now()
            records.append(data)
            self._write(records)
            return data

    def update(self, id: str, patch: dict) -> dict | None:
        with _lock:
            records = self._read()
            for i, r in enumerate(records):
                if r.get("id") == id:
                    r.update(patch)
                    r["updated_at"] = now()
                    records[i] = r
                    self._write(records)
                    return r
        return None

    def delete(self, id: str) -> bool:
        with _lock:
            records = self._read()
            new_records = [r for r in records if r.get("id") != id]
            if len(new_records) < len(records):
                self._write(new_records)
                return True
        return False

    def count(self) -> int:
        return len(self._read())

    def paginate(self, page=1, per_page=20, fn: Callable[[dict], bool] | None = None) -> dict:
        items = self.filter(fn) if fn else self.all()
        total = len(items)
        start = (page - 1) * per_page
        return {"items": items[start : start + per_page], "total": total, "page": page, "per_page": per_page}


# Global collections
db = {
    "users": Collection("users"),
    "projects": Collection("projects"),
    "datasets": Collection("datasets"),
    "dataset_versions": Collection("dataset_versions"),
    "label_classes": Collection("label_classes"),
    "images": Collection("images"),
    "annotations": Collection("annotations"),
    "model_configs": Collection("model_configs"),
    "trained_models": Collection("trained_models"),
    "training_jobs": Collection("training_jobs"),
}


# Seed default dev user
def _seed():
    users = db["users"]
    if not users.filter(lambda u: u["email"] == "dev@example.com"):
        users.create({
            "username": "dev",
            "email": "dev@example.com",
            "password_hash": "$2b$12$LJ3m4ys3Lk0TSwHCpNqrFOXGF4LFTIqHBTjVGBqTLkSJ3vOLxDPTu",  # bcrypt hash of "dev"
            "is_active": True,
            "is_superuser": True,
            "storage_used_bytes": 0,
        })


_seed()
