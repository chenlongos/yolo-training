"""Training task — file-based."""
import json, time
from datetime import datetime, timezone
from pathlib import Path
from backend.store import db
from backend.tasks.celery_app import celery_app
from backend.config import settings
from backend.services.yolo_export_service import generate_yolo_dataset
from backend.services.storage_service import storage_service


def run_training_sync(job_id: str):
    """Run training directly (no Celery). Called from background thread."""
    _run_training_impl(job_id)


@celery_app.task(bind=True, name="training.run_training")
def run_training(self, job_id: str):
    """Celery task entry point."""
    _run_training_impl(job_id, celery_task_id=self.request.id)


def _run_training_impl(job_id: str, celery_task_id: str = ""):
    """Core training logic — callable from Celery or thread."""
    job = db["training_jobs"].get(job_id)
    if not job: return

    try:
        patch = {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
        if celery_task_id:
            patch["celery_task_id"] = celery_task_id
        db["training_jobs"].update(job_id, patch)

        cfg = db["model_configs"].get(job["config_id"])
        ds = db["datasets"].get(job["dataset_id"])
        total_epochs = cfg.get("epochs", 100)

        # Generate YOLO dataset
        out = storage_service.exports_dir / f"dataset_{ds['id']}"
        yaml_path = generate_yolo_dataset(ds["id"], out, {"train": 0.7, "val": 0.2, "test": 0.1})

        # Training callbacks for real-time progress/metrics
        def on_fit_epoch_end(trainer):
            epoch = trainer.epoch + 1
            progress = min(100, (epoch / total_epochs) * 100)
            metrics = {}
            # Loss values from training
            if hasattr(trainer, 'loss_items') and trainer.loss_items is not None:
                try:
                    items = trainer.loss_items.cpu().numpy() if hasattr(trainer.loss_items, 'cpu') else trainer.loss_items
                    loss_names = ["box_loss", "cls_loss", "dfl_loss"]
                    for i, name in enumerate(loss_names):
                        if i < len(items):
                            metrics[name] = float(items[i])
                except Exception:
                    pass
            # Validation metrics
            if hasattr(trainer, 'metrics') and trainer.metrics:
                for k, v in trainer.metrics.items():
                    if isinstance(v, (int, float)):
                        key = k.replace("metrics/", "").replace("(", "").replace(")", "").replace("/", "_")
                        try:
                            metrics[key] = float(v)
                        except Exception:
                            pass
            db["training_jobs"].update(job_id, {
                "progress": progress,
                "current_epoch": epoch,
                "current_metric": metrics,
            })

        from training_engine.adapter import ModelAdapter
        adapter = ModelAdapter(cfg.get("base_model", "yolov8n.pt"))
        model_out = storage_service.models_dir / job["model_id"]

        results = adapter.train(data=str(yaml_path), epochs=total_epochs, imgsz=cfg.get("imgsz", 640),
                                batch=cfg.get("batch", 16), device=cfg.get("device", ""),
                                project=str(model_out), name="train", workers=cfg.get("workers", 8),
                                callbacks={"on_fit_epoch_end": on_fit_epoch_end})

        # Update model
        weights_dir = model_out / "train" / "weights"
        best = weights_dir / "best.pt"
        last = weights_dir / "last.pt"
        db["trained_models"].update(job["model_id"], {
            "status": "completed", "weights_path": str(best if best.exists() else last),
            "training_completed_at": datetime.now(timezone.utc).isoformat(),
        })

        metrics = {"mAP50": 0, "mAP50_95": 0, "precision": 0, "recall": 0}
        if hasattr(results, 'results_dict'):
            m = results.results_dict
            metrics = {"mAP50": float(m.get("metrics/mAP50(B)", 0)), "mAP50_95": float(m.get("metrics/mAP50-95(B)", 0)),
                       "precision": float(m.get("metrics/precision(B)", 0)), "recall": float(m.get("metrics/recall(B)", 0))}
        db["trained_models"].update(job["model_id"], {"metrics": metrics})
        db["training_jobs"].update(job_id, {"status": "completed", "progress": 100, "current_metric": metrics,
                                             "completed_at": datetime.now(timezone.utc).isoformat()})
    except Exception as e:
        db["training_jobs"].update(job_id, {"status": "failed", "error_message": str(e)})
        raise
