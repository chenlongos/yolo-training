"""FastAPI dependencies — file-based, no database."""

from fastapi import Header, Query, Request
from backend.store import db


def resolve_project_dataset(project_id: str) -> dict:
    """Resolve the (single) dataset for a project. Auto-creates one if none exists."""
    dss = db["datasets"].filter(lambda d: d["project_id"] == project_id)
    if not dss:
        from backend.services.dataset_service import get_or_create_default_class
        ds = db["datasets"].create({
            "project_id": project_id, "name": "default",
            "description": "", "current_version": 1, "image_count": 0,
        })
        get_or_create_default_class(ds["id"])
        return db["datasets"].get(ds["id"])
    return dss[0]


def get_current_user(
    x_user: str = Header(default="dev", alias="X-User"),
) -> dict:
    """Return user by X-User header. Creates user if not exists.

    NOTE: When calling directly (not via FastAPI DI), pass the username as a string.
    For <img> tag / raw fetch support, endpoints should also accept ?user= query param
    and pass it to this function.
    """
    users = db["users"]
    user = next((u for u in users.all() if u["username"] == x_user), None)
    if not user:
        user = users.create({
            "username": x_user, "email": f"{x_user}@local",
            "password_hash": "", "is_active": True, "is_superuser": False,
            "storage_used_bytes": 0,
        })
    return user
