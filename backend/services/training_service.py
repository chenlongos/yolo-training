"""Training service — file-based."""
from backend.store import db
from backend.tasks.training_task import run_training

def create_training_job(user_id, config_id, dataset_id, name, project_id) -> dict:
    cfg = db["model_configs"].get(config_id)
    model = db["trained_models"].create({"project_id": project_id, "config_id": config_id, "dataset_id": dataset_id, "name": name, "status": "pending"})
    job = db["training_jobs"].create({
        "model_id": model["id"], "config_id": config_id, "dataset_id": dataset_id,
        "status": "queued", "progress": 0, "current_epoch": 0,
        "total_epochs": cfg.get("epochs", 100) if cfg else 100,
    })
    # Try dispatching Celery task (non-blocking, best-effort)
    try:
        task = run_training.delay(job["id"])
        db["training_jobs"].update(job["id"], {"celery_task_id": task.id})
    except Exception:
        pass  # Celery unavailable — training can be triggered manually
    return job
