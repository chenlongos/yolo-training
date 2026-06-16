"""Application configuration via environment variables."""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Centralized settings loaded from environment variables."""

    # Application
    APP_NAME: str = "YOLO Training Platform"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-use-a-random-secret"

    # Database — defaults to SQLite for zero-dependency local dev;
    # Docker Compose / production overrides this via DATABASE_URL env var.
    DATABASE_URL: str = "sqlite:///./storage/app.db"

    # JWT Auth
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Celery / Redis
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # File Storage
    STORAGE_ROOT: str = str(Path(__file__).resolve().parent.parent / "storage")
    UPLOAD_MAX_SIZE_MB: int = 50
    THUMBNAIL_SIZE: int = 256

    # CORS
    CORS_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
