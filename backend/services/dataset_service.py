"""Dataset service — file-based."""
from pathlib import Path
from fastapi import UploadFile
from backend.store import db
from backend.services.storage_service import storage_service

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

def validate_image(file: UploadFile) -> str | None:
    if not file.filename: return "Missing filename"
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS: return f"Unsupported format: {ext}"
    return None

def upload_images(dataset_id: str, files: list[UploadFile]) -> dict:
    ds = db["datasets"].get(dataset_id)
    if not ds: return {"uploaded": 0, "errors": ["Dataset not found"]}
    uploaded, errors = 0, []
    for file in files:
        err = validate_image(file)
        if err: errors.append({"filename": file.filename, "error": err}); continue
        try:
            meta = storage_service.save_dataset_image(file, dataset_id)
            db["images"].create(dict(dataset_id=dataset_id, **meta, status="uploaded"))
            uploaded += 1
        except Exception as e:
            errors.append({"filename": file.filename, "error": str(e)})
    ds["image_count"] = ds.get("image_count", 0) + uploaded
    db["datasets"].update(dataset_id, {"image_count": ds["image_count"]})
    return {"uploaded": uploaded, "errors": errors}

def get_or_create_default_class(dataset_id: str) -> dict:
    classes = db["label_classes"].filter(lambda c: c["dataset_id"] == dataset_id)
    if not classes:
        return db["label_classes"].create({"dataset_id": dataset_id, "name": "object", "yolo_index": 0, "color": "#00FF00"})
    return classes[0]
