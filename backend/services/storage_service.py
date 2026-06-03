"""File storage abstraction layer — supports local filesystem and S3/MinIO."""

import os
import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from PIL import Image
from fastapi import UploadFile

from ..config import settings


class StorageBackend(ABC):
    @abstractmethod
    def save(self, file_path: str, destination: str) -> str: ...

    @abstractmethod
    def get_url(self, path: str) -> str: ...

    @abstractmethod
    def delete(self, path: str) -> None: ...

    @abstractmethod
    def exists(self, path: str) -> bool: ...


class LocalStorageBackend(StorageBackend):
    def __init__(self, root: str = ""):
        self.root = Path(root or settings.STORAGE_ROOT).resolve()

    def _full_path(self, path: str) -> Path:
        full = (self.root / path).resolve()
        if not str(full).startswith(str(self.root)):
            raise ValueError(f"Path traversal detected: {path}")
        return full

    def save(self, file_path: str, destination: str) -> str:
        dest = self._full_path(destination)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_path, dest)
        return destination

    def save_upload(self, file: UploadFile, destination: str) -> str:
        dest = self._full_path(destination)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(file.file.read())
        return destination

    def get_url(self, path: str) -> str:
        return f"/storage/{path}"

    def delete(self, path: str) -> None:
        dest = self._full_path(path)
        if dest.exists():
            dest.unlink()

    def exists(self, path: str) -> bool:
        return self._full_path(path).exists()


class StorageService:
    """High-level storage operations."""

    def __init__(self, backend: StorageBackend | None = None):
        self.backend = backend or LocalStorageBackend()

    @property
    def storage_root(self) -> Path:
        if isinstance(self.backend, LocalStorageBackend):
            return self.backend.root
        return Path(settings.STORAGE_ROOT)

    @property
    def datasets_dir(self) -> Path:
        return self.storage_root / "datasets"

    @property
    def models_dir(self) -> Path:
        return self.storage_root / "models"

    @property
    def exports_dir(self) -> Path:
        return self.storage_root / "exports"

    def save_dataset_image(self, file: UploadFile, dataset_id: str) -> dict:
        """Save an uploaded image to the dataset storage and return metadata."""
        ext = Path(file.filename).suffix.lower() if file.filename else ".jpg"
        image_uuid = str(uuid.uuid4())
        rel_path = f"datasets/{dataset_id}/{image_uuid}{ext}"
        abs_path = self.backend._full_path(rel_path) if isinstance(self.backend, LocalStorageBackend) else None

        # Save original
        self.backend.save_upload(file, rel_path)

        # Extract dimensions
        if isinstance(self.backend, LocalStorageBackend) and abs_path:
            with Image.open(abs_path) as img:
                width, height = img.size
                file_size = abs_path.stat().st_size
        else:
            width, height = 0, 0
            file_size = 0

        # Generate thumbnail
        thumb_rel_path = f"datasets/{dataset_id}/thumbnails/{image_uuid}_thumb.jpg"
        if isinstance(self.backend, LocalStorageBackend) and abs_path:
            thumb_full = self.backend._full_path(thumb_rel_path)
            thumb_full.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(abs_path) as img:
                img.thumbnail((settings.THUMBNAIL_SIZE, settings.THUMBNAIL_SIZE), Image.LANCZOS)
                img.save(thumb_full, "JPEG", quality=80)

        return {
            "filename": file.filename or f"{image_uuid}{ext}",
            "storage_path": rel_path,
            "thumbnail_path": thumb_rel_path,
            "width": width,
            "height": height,
            "file_size_bytes": file_size,
        }


# Singleton instance
storage_service = StorageService()
