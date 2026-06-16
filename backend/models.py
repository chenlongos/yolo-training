"""SQLAlchemy ORM models for all 11 collections."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, JSON, BigInteger,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _new_id() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_new_id)
    username = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False, default="")
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    storage_used_bytes = Column(BigInteger, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=_new_id)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1024), default="")
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(String(36), primary_key=True, default=_new_id)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String(1024), default="")
    current_version = Column(Integer, default=1)
    image_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class DatasetVersion(Base):
    __tablename__ = "dataset_versions"

    id = Column(String(36), primary_key=True, default=_new_id)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False, index=True)
    version = Column(Integer, default=1)
    image_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class LabelClass(Base):
    __tablename__ = "label_classes"

    id = Column(String(36), primary_key=True, default=_new_id)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    yolo_index = Column(Integer, default=0)
    color = Column(String(7), default="#00FF00")
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class Image(Base):
    __tablename__ = "images"

    id = Column(String(36), primary_key=True, default=_new_id)
    dataset_id = Column(String(36), ForeignKey("datasets.id"), nullable=False, index=True)
    filename = Column(String(512), nullable=False)
    storage_path = Column(String(1024), nullable=False)
    thumbnail_path = Column(String(1024), nullable=True)
    width = Column(Integer, default=0)
    height = Column(Integer, default=0)
    file_size_bytes = Column(BigInteger, nullable=True)
    status = Column(String(32), default="uploaded")  # uploaded | annotated
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(String(36), primary_key=True, default=_new_id)
    image_id = Column(String(36), ForeignKey("images.id"), nullable=False, index=True)
    class_id = Column(String(36), ForeignKey("label_classes.id"), nullable=False)
    x_center = Column(Float, nullable=False)
    y_center = Column(Float, nullable=False)
    width = Column(Float, nullable=False)
    height = Column(Float, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class ModelConfig(Base):
    __tablename__ = "model_configs"

    id = Column(String(36), primary_key=True, default=_new_id)
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    base_model = Column(String(255), default="yolov8n.pt")
    epochs = Column(Integer, default=100)
    imgsz = Column(Integer, default=640)
    batch = Column(Integer, default=16)
    device = Column(String(64), default="")
    workers = Column(Integer, default=8)
    optimizer = Column(String(32), default="auto")
    lr0 = Column(Float, default=0.01)
    lrf = Column(Float, default=0.01)
    momentum = Column(Float, default=0.937)
    weight_decay = Column(Float, default=0.0005)
    warmup_epochs = Column(Float, default=3.0)
    augment = Column(Boolean, default=True)
    single_cls = Column(Boolean, default=False)
    extra_args = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class TrainedModel(Base):
    __tablename__ = "trained_models"

    id = Column(String(36), primary_key=True, default=_new_id)
    project_id = Column(String(36), nullable=True, index=True)
    config_id = Column(String(36), nullable=True)
    dataset_id = Column(String(36), nullable=True)
    name = Column(String(255), nullable=False)
    status = Column(String(32), default="pending")  # pending | running | completed | failed
    weights_path = Column(String(1024), nullable=True)
    onnx_path = Column(String(1024), nullable=True)
    fp16_onnx_path = Column(String(1024), nullable=True)
    int8_onnx_path = Column(String(1024), nullable=True)
    cvimodel_path = Column(String(1024), nullable=True)
    parent_model_id = Column(String(36), nullable=True)
    format_type = Column(String(32), nullable=True)  # pretrained | onnx | fp16_onnx | int8_onnx | cvimodel
    metrics = Column(JSON, nullable=True)
    training_time_seconds = Column(Integer, nullable=True)
    training_completed_at = Column(DateTime(timezone=True), nullable=True)
    # CVIModel conversion progress (dynamic fields)
    _cvimodel_status = Column("_cvimodel_status", String(32), nullable=True)
    _cvimodel_progress = Column("_cvimodel_progress", Integer, nullable=True)
    _cvimodel_step = Column("_cvimodel_step", String(255), nullable=True)
    _cvimodel_error = Column("_cvimodel_error", Text, nullable=True)
    _cvimodel_log = Column("_cvimodel_log", Text, nullable=True)
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=_utcnow)


class TrainingJob(Base):
    __tablename__ = "training_jobs"

    id = Column(String(36), primary_key=True, default=_new_id)
    model_id = Column(String(36), ForeignKey("trained_models.id"), nullable=False, index=True)
    config_id = Column(String(36), nullable=False)
    dataset_id = Column(String(36), nullable=False)
    status = Column(String(32), default="queued")  # queued | running | completed | failed | cancelled
    progress = Column(Float, default=0.0)
    current_epoch = Column(Integer, default=0)
    total_epochs = Column(Integer, nullable=True)
    current_metric = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    gpu_info = Column(JSON, nullable=True)
    celery_task_id = Column(String(255), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
