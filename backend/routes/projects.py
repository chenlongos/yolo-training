"""Projects routes — file-based storage."""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from backend.store import db
from backend.schemas.project import ProjectCreate, ProjectUpdate
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

def _own(pid: str, user: dict) -> dict:
    p = db["projects"].get(pid)
    if not p or str(p.get("user_id")) != str(user.get("id")):
        raise HTTPException(404, detail="Project not found")
    return p

@router.get("")
def list_projects(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100), user: dict = Depends(get_current_user)):
    return db["projects"].paginate(page, per_page, fn=lambda p: str(p.get("user_id")) == str(user.get("id")))

@router.post("", status_code=201)
def create_project(data: ProjectCreate, user: dict = Depends(get_current_user)):
    return db["projects"].create({"user_id": user["id"], "name": data.name, "description": data.description})

@router.get("/{project_id}")
def get_project(project_id: str, user: dict = Depends(get_current_user)):
    return _own(project_id, user)

@router.put("/{project_id}")
def update_project(project_id: str, data: ProjectUpdate, user: dict = Depends(get_current_user)):
    _own(project_id, user)
    return db["projects"].update(project_id, {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None})

@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    _own(project_id, user)
    for ds in db["datasets"].filter(lambda d: d["project_id"] == project_id):
        for img in db["images"].filter(lambda i: i["dataset_id"] == ds["id"]):
            for ann in db["annotations"].filter(lambda a: a["image_id"] == img["id"]):
                db["annotations"].delete(ann["id"])
            db["images"].delete(img["id"])
        db["label_classes"].delete(ds["id"])
        db["datasets"].delete(ds["id"])
    for c in db["model_configs"].filter(lambda c: c["project_id"] == project_id):
        db["model_configs"].delete(c["id"])
    for m in db["trained_models"].filter(lambda m: m["project_id"] == project_id):
        for j in db["training_jobs"].filter(lambda j: j["model_id"] == m["id"]):
            db["training_jobs"].delete(j["id"])
        db["trained_models"].delete(m["id"])
    db["projects"].delete(project_id)
