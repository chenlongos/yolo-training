"""Dataset-related Pydantic schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class LabelClassCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    color: str = Field(default="#00FF00", pattern=r"^#[0-9A-Fa-f]{6}$")


class LabelClassResponse(BaseModel):
    id: str
    dataset_id: str
    name: str
    yolo_index: int
    color: str

    model_config = {"from_attributes": True}


class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str
    current_version: int
    image_count: int
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ImageResponse(BaseModel):
    id: str
    dataset_id: str
    filename: str
    storage_path: str
    thumbnail_path: Optional[str] = None
    width: int
    height: int
    file_size_bytes: Optional[int] = None
    status: str
    uploaded_at: str

    model_config = {"from_attributes": True}


class AnnotationResponse(BaseModel):
    id: str
    image_id: str
    class_id: str
    class_name: str = ""
    x_center: float
    y_center: float
    width: float
    height: float

    model_config = {"from_attributes": True}


class AnnotationCreate(BaseModel):
    class_id: str
    x_center: float = Field(..., ge=0, le=1)
    y_center: float = Field(..., ge=0, le=1)
    width: float = Field(..., ge=0, le=1)
    height: float = Field(..., ge=0, le=1)


class AnnotationBulkUpdate(BaseModel):
    annotations: list[AnnotationCreate]


class ImageDetailResponse(BaseModel):
    image: ImageResponse
    annotations: list[AnnotationResponse]


class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    per_page: int


class DatasetExportRequest(BaseModel):
    split_config: dict = Field(default_factory=lambda: {"train": 0.7, "val": 0.2, "test": 0.1})
