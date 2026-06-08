"""FastAPI dependencies — file-based, no database."""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from backend.store import db
from backend.services.auth_service import decode_token


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

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def _get_or_create_default_user() -> dict:
    users = db["users"]
    user = next((u for u in users.all() if u["email"] == "dev@example.com"), None)
    if not user:
        user = users.create({
            "username": "dev", "email": "dev@example.com",
            "password_hash": "$2b$12$LJ3m4ys3Lk0TSwHCpNqrFOXGF4LFTIqHBTjVGBqTLkSJ3vOLxDPTu",
            "is_active": True, "is_superuser": True, "storage_used_bytes": 0,
        })
    return user


def get_current_user(token: str | None = Depends(oauth2_scheme)) -> dict:
    if token is None:
        return _get_or_create_default_user()
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return _get_or_create_default_user()
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return _get_or_create_default_user()

    users = db["users"]
    user = users.get(str(user_id))
    if not user:
        # Try to find by int ID
        for u in users.all():
            if u.get("id") == user_id:
                return u
        return _get_or_create_default_user()
    return user
