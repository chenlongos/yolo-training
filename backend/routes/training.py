"""Training routes — file-based storage."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from backend.store import db
from backend.schemas.training import ModelConfigCreate, TrainingJobCreate
from backend.dependencies import get_current_user, resolve_project_dataset
from backend.services.training_service import create_training_job

router = APIRouter(prefix="/api/v1", tags=["training"])

def _own_project(pid: str, user: dict) -> dict:
    p = db["projects"].get(pid)
    if not p or str(p.get("user_id")) != str(user.get("id")): raise HTTPException(404, detail="Project not found")
    return p

# Configs
@router.get("/projects/{project_id}/configs")
def list_configs(project_id: str, user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    return db["model_configs"].filter(lambda c: c["project_id"] == project_id)

@router.post("/projects/{project_id}/configs", status_code=201)
def create_config(project_id: str, data: ModelConfigCreate, user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    return db["model_configs"].create(dict(project_id=project_id, **data.model_dump()))

@router.delete("/configs/{config_id}", status_code=204)
def delete_config(config_id: str, user: dict = Depends(get_current_user)):
    cfg = db["model_configs"].get(config_id)
    if cfg: _own_project(cfg["project_id"], user)
    db["model_configs"].delete(config_id)

# Jobs
@router.post("/training/jobs", status_code=201)
def start_training(data: TrainingJobCreate, user: dict = Depends(get_current_user)):
    cfg = db["model_configs"].get(data.model_config_id)
    if not cfg: raise HTTPException(404, detail="Config not found")
    _own_project(cfg["project_id"], user)
    # Auto-resolve dataset_id from project if not provided
    dataset_id = data.dataset_id or resolve_project_dataset(cfg["project_id"])["id"]
    return create_training_job(user["id"], data.model_config_id, dataset_id, data.name, cfg["project_id"])

@router.get("/training/jobs")
def list_jobs(project_id: str = Query(""), status_filter: str = Query("", alias="status"), user: dict = Depends(get_current_user)):
    if project_id:
        _own_project(project_id, user)
        models_in_project = [m["id"] for m in db["trained_models"].filter(lambda m: m["project_id"] == project_id)]
    else:
        user_projects = [p["id"] for p in db["projects"].filter(lambda p: str(p.get("user_id")) == str(user.get("id")))]
        models_in_project = [m["id"] for m in db["trained_models"].all() if m["project_id"] in user_projects]
    jobs = db["training_jobs"].filter(lambda j: j["model_id"] in models_in_project)
    if status_filter: jobs = [j for j in jobs if j.get("status") == status_filter]
    return {"items": sorted(jobs, key=lambda j: j.get("created_at", ""), reverse=True), "total": len(jobs)}

@router.get("/training/jobs/{job_id}")
def get_job(job_id: str, user: dict = Depends(get_current_user)):
    return db["training_jobs"].get(job_id) or HTTPException(404, detail="Not found")

@router.post("/training/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    job = db["training_jobs"].get(job_id)
    if not job: raise HTTPException(404, detail="Not found")
    if job["status"] in ("queued", "running"):
        db["training_jobs"].update(job_id, {"status": "cancelled"})
    return {"status": "cancelled"}
