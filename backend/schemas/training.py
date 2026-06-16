"""Training-related Pydantic schemas."""

from pydantic import BaseModel, Field
from typing import Optional


class ModelConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    base_model: str = "yolov8n.pt"
    epochs: int = Field(100, ge=1, le=1000)
    imgsz: int = Field(640, ge=320, le=1920)
    batch: int = Field(16, ge=1, le=256)
    device: str = ""
    workers: int = Field(8, ge=0, le=32)
    optimizer: str = "auto"
    lr0: float = Field(0.01, gt=0, le=0.1)
    lrf: float = Field(0.01, gt=0, le=0.1)
    momentum: float = Field(0.937, ge=0, le=1)
    weight_decay: float = Field(0.0005, ge=0, le=0.1)
    warmup_epochs: float = Field(3.0, ge=0)
    augment: bool = True
    single_cls: bool = False
    extra_args: dict = Field(default_factory=dict)


class ModelConfigResponse(BaseModel):
    id: str
    project_id: str
    name: str
    base_model: str
    epochs: int
    imgsz: int
    batch: int
    device: str
    workers: int
    optimizer: str
    lr0: float
    lrf: float
    momentum: float
    weight_decay: float
    warmup_epochs: float
    augment: bool
    single_cls: bool = False
    created_at: str

    model_config = {"from_attributes": True}


class TrainingJobCreate(BaseModel):
    model_config_id: str
    dataset_id: str = ""  # Optional — auto-resolved from project if empty
    name: str = Field(..., min_length=1, max_length=255)


class TrainingJobResponse(BaseModel):
    id: str
    model_id: str
    config_id: str
    dataset_id: str
    status: str
    progress: float
    current_epoch: int
    total_epochs: Optional[int] = None
    current_metric: Optional[dict] = None
    error_message: Optional[str] = None
    gpu_info: Optional[dict] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str

    model_config = {"from_attributes": True}


class TrainedModelResponse(BaseModel):
    id: str
    project_id: str
    config_id: Optional[str] = None
    dataset_id: Optional[str] = None
    name: str
    status: str
    weights_path: Optional[str] = None
    onnx_path: Optional[str] = None
    int8_onnx_path: Optional[str] = None
    metrics: Optional[dict] = None
    training_time_seconds: Optional[int] = None
    created_at: str
    training_completed_at: Optional[str] = None

    model_config = {"from_attributes": True}
