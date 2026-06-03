"""Celery application configuration."""

from celery import Celery
from ..config import settings

celery_app = Celery(
    "yolo_training",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    result_expires=3600 * 24 * 7,
    broker_connection_retry_on_startup=True,
)

# Import tasks so Celery registers them
celery_app.autodiscover_tasks(["tasks"])
