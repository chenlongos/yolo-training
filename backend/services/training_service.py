"""Training service — file-based."""
import threading
from backend.store import db
from backend.tasks.training_task import run_training, run_training_sync


def create_training_job(user_id, config_id, dataset_id, name, project_id) -> dict:
    cfg = db["model_configs"].get(config_id)
    model = db["trained_models"].create({"project_id": project_id, "config_id": config_id, "dataset_id": dataset_id, "name": name, "status": "pending"})
    job = db["training_jobs"].create({
        "model_id": model["id"], "config_id": config_id, "dataset_id": dataset_id,
        "status": "queued", "progress": 0, "current_epoch": 0,
        "total_epochs": cfg.get("epochs", 100) if cfg else 100,
    })

    # Try dispatching Celery task
    try:
        task = run_training.delay(job["id"])
        db["training_jobs"].update(job["id"], {"celery_task_id": task.id})
    except Exception:
        # Celery unavailable — run in background thread
        t = threading.Thread(target=run_training_sync, args=(job["id"],), daemon=True)
        t.start()

    return job
