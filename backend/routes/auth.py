"""Auth routes — file-based storage."""
from fastapi import APIRouter, Depends, HTTPException, status
from backend.store import db
from backend.schemas.auth import UserRegister, UserLogin, TokenResponse, RefreshRequest, UserResponse
from backend.services.auth_service import hash_password, verify_password, create_tokens, decode_token
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

@router.post("/register", status_code=201)
def register(data: UserRegister):
    users = db["users"]
    if any(u["email"] == data.email for u in users.all()):
        raise HTTPException(409, detail="Email already registered")
    u = users.create({"username": data.username, "email": data.email, "password_hash": hash_password(data.password), "is_active": True, "is_superuser": False, "storage_used_bytes": 0})
    return create_tokens(u["id"])

@router.post("/login")
def login(data: UserLogin):
    u = next((u for u in db["users"].all() if u["email"] == data.email), None)
    if not u or not verify_password(data.password, u["password_hash"]):
        raise HTTPException(401, detail="Invalid email or password")
    return create_tokens(u["id"])

@router.post("/refresh")
def refresh(data: RefreshRequest):
    try:
        p = decode_token(data.refresh_token)
        if p.get("type") != "refresh": raise HTTPException(401, detail="Invalid token type")
        return create_tokens(int(p["sub"]))
    except Exception:
        raise HTTPException(401, detail="Invalid refresh token")

@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
