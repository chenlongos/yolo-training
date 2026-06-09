"""Dataset routes — file-based storage."""
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from backend.store import db
from backend.schemas.dataset import DatasetCreate, AnnotationBulkUpdate, AnnotationCreate, LabelClassCreate
from backend.dependencies import get_current_user, resolve_project_dataset
from backend.services.dataset_service import upload_images, get_or_create_default_class, save_yolo_labels, load_yolo_labels
from backend.services.yolo_export_service import generate_yolo_dataset
from backend.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1", tags=["datasets"])

def _own_project(pid: str, user: dict) -> dict:
    p = db["projects"].get(pid)
    if not p or str(p.get("user_id")) != str(user.get("id")):
        raise HTTPException(404, detail="Project not found")
    return p

def _own_ds(did: str, user: dict) -> dict:
    ds = db["datasets"].get(did)
    if not ds: raise HTTPException(404, detail="Dataset not found")
    p = db["projects"].get(ds["project_id"])
    if not p or str(p.get("user_id")) != str(user.get("id")): raise HTTPException(404, detail="Project not found")
    return ds

def _own_img(iid: str, user: dict) -> dict:
    img = db["images"].get(iid)
    if not img: raise HTTPException(404, detail="Image not found")
    _own_ds(img["dataset_id"], user)
    return img

# Dataset CRUD
@router.get("/projects/{project_id}/datasets")
def list_datasets(project_id: str, user: dict = Depends(get_current_user)):
    return db["datasets"].filter(lambda d: d["project_id"] == project_id)

@router.post("/projects/{project_id}/datasets", status_code=201)
def create_dataset(project_id: str, data: DatasetCreate, user: dict = Depends(get_current_user)):
    ds = db["datasets"].create({"project_id": project_id, "name": data.name, "description": data.description, "current_version": 1, "image_count": 0})
    get_or_create_default_class(ds["id"])
    return ds

@router.get("/datasets/{dataset_id}")
def get_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    return _own_ds(dataset_id, user)

@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, user: dict = Depends(get_current_user)):
    ds = _own_ds(dataset_id, user)
    for img in db["images"].filter(lambda i: i["dataset_id"] == dataset_id):
        for ann in db["annotations"].filter(lambda a: a["image_id"] == img["id"]):
            db["annotations"].delete(ann["id"])
        db["images"].delete(img["id"])
    db["label_classes"].delete(dataset_id)
    db["datasets"].delete(dataset_id)

# Uploads
@router.post("/datasets/{dataset_id}/upload")
def upload(dataset_id: str, files: list[UploadFile] = File(...), user: dict = Depends(get_current_user)):
    _own_ds(dataset_id, user)
    return upload_images(dataset_id, files)

@router.get("/datasets/{dataset_id}/images")
def list_images(dataset_id: str, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), status_filter: str = Query("", alias="status"), user: dict = Depends(get_current_user)):
    _own_ds(dataset_id, user)
    imgs = db["images"].filter(lambda i: i["dataset_id"] == dataset_id)
    if status_filter: imgs = [i for i in imgs if i.get("status") == status_filter]
    total = len(imgs)
    start = (page - 1) * per_page
    result = []
    for i in imgs[start:start + per_page]:
        i = dict(i)
        i["thumbnail_url"] = f"/api/v1/images/{i['id']}/thumbnail"
        i["image_url"] = f"/api/v1/images/{i['id']}/file"
        result.append(i)
    return {"items": result, "total": total, "page": page, "per_page": per_page}

@router.get("/images/{image_id}/file")
def get_file(image_id: str, user: dict = Depends(get_current_user)):
    img = _own_img(image_id, user)
    path = storage_service.backend._full_path(img["storage_path"])
    return FileResponse(path) if path.exists() else HTTPException(404, detail="File not found")

@router.get("/images/{image_id}/thumbnail")
def get_thumb(image_id: str, user: dict = Depends(get_current_user)):
    img = _own_img(image_id, user)
    thumb = img.get("thumbnail_path")
    path = storage_service.backend._full_path(thumb) if thumb else None
    if path and path.exists():
        return FileResponse(path, media_type="image/jpeg")
    # Fallback to full image
    fp = storage_service.backend._full_path(img["storage_path"])
    if fp.exists():
        return FileResponse(fp, media_type="image/jpeg")
    raise HTTPException(404, detail="Not found")

@router.get("/images/{image_id}")
def get_image_detail(image_id: str, user: dict = Depends(get_current_user)):
    img = _own_img(image_id, user)
    anns = load_yolo_labels(image_id)
    return {"image": img, "annotations": anns}

@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: str, user: dict = Depends(get_current_user)):
    img = _own_img(image_id, user)
    ds = db["datasets"].get(img["dataset_id"])
    if ds: db["datasets"].update(ds["id"], {"image_count": max(0, ds["image_count"] - 1)})

    # Delete annotations from DB
    for ann in db["annotations"].filter(lambda a: a["image_id"] == image_id):
        db["annotations"].delete(ann["id"])

    # Delete YOLO label file from disk
    from backend.services.dataset_service import _label_path_for_image
    label_path = _label_path_for_image(img)
    if label_path.exists():
        label_path.unlink()

    # Delete image file and thumbnail from disk
    import os
    from pathlib import Path
    from backend.services.storage_service import storage_service

    for key in ["storage_path", "thumbnail_path"]:
        fp = img.get(key)
        if fp:
            try:
                p = storage_service.backend._full_path(fp)
                if p.exists():
                    p.unlink()
            except Exception:
                pass

    # Delete DB record
    db["images"].delete(image_id)

# Annotations
@router.get("/images/{image_id}/annotations")
def get_annotations(image_id: str, user: dict = Depends(get_current_user)):
    _own_img(image_id, user)
    return load_yolo_labels(image_id)

@router.put("/images/{image_id}/annotations")
def bulk_update_annotations(image_id: str, data: AnnotationBulkUpdate, user: dict = Depends(get_current_user)):
    img = _own_img(image_id, user)
    for ann in db["annotations"].filter(lambda a: a["image_id"] == image_id):
        db["annotations"].delete(ann["id"])
    new_anns = []
    for ad in data.annotations:
        a = db["annotations"].create({"image_id": image_id, "class_id": ad.class_id, "x_center": ad.x_center, "y_center": ad.y_center, "width": ad.width, "height": ad.height, "created_by": user["id"]})
        new_anns.append(a)
    db["images"].update(image_id, {"status": "annotated" if data.annotations else "uploaded"})
    # Also write YOLO-format .txt label file alongside the image
    save_yolo_labels(image_id)
    return {"annotations": new_anns}

@router.post("/images/{image_id}/annotations", status_code=201)
def create_annotation(image_id: str, data: AnnotationCreate, user: dict = Depends(get_current_user)):
    _own_img(image_id, user)
    a = db["annotations"].create({"image_id": image_id, "class_id": data.class_id, "x_center": data.x_center, "y_center": data.y_center, "width": data.width, "height": data.height, "created_by": user["id"]})
    save_yolo_labels(image_id)
    return a

@router.delete("/annotations/{annotation_id}", status_code=204)
def delete_annotation(annotation_id: str, user: dict = Depends(get_current_user)):
    ann = db["annotations"].get(annotation_id)
    if ann:
        img_id = ann["image_id"]
        _own_img(img_id, user)
        db["annotations"].delete(annotation_id)
        save_yolo_labels(img_id)

# Classes
@router.get("/datasets/{dataset_id}/classes")
def list_classes(dataset_id: str, user: dict = Depends(get_current_user)):
    _own_ds(dataset_id, user)
    return db["label_classes"].filter(lambda c: c["dataset_id"] == dataset_id)

@router.post("/datasets/{dataset_id}/classes", status_code=201)
def create_class(dataset_id: str, data: LabelClassCreate, user: dict = Depends(get_current_user)):
    _own_ds(dataset_id, user)
    existing = db["label_classes"].filter(lambda c: c["dataset_id"] == dataset_id)
    return db["label_classes"].create({"dataset_id": dataset_id, "name": data.name, "yolo_index": len(existing), "color": data.color})

@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: str, user: dict = Depends(get_current_user)):
    cls = db["label_classes"].get(class_id)
    if cls: _own_ds(cls["dataset_id"], user)
    db["label_classes"].delete(class_id)

# Export
@router.post("/datasets/{dataset_id}/export/yolo")
def export_yolo(dataset_id: str, user: dict = Depends(get_current_user)):
    _own_ds(dataset_id, user)
    out = storage_service.exports_dir / f"dataset_{dataset_id}"
    yaml_path = generate_yolo_dataset(dataset_id, out, {"train": 0.7, "val": 0.2, "test": 0.1})
    zip_path = out.parent / f"{out.name}.zip"
    return FileResponse(zip_path, media_type="application/zip", filename=f"dataset_{dataset_id}.zip")


# ── Project-scoped endpoints (auto-resolve dataset from project) ──

@router.post("/projects/{project_id}/upload")
def project_upload(project_id: str, files: list[UploadFile] = File(...), user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)
    return upload_images(ds["id"], files)


@router.post("/projects/{project_id}/capture-url")
def project_capture_url(project_id: str, url: str = Query(...), user: dict = Depends(get_current_user)):
    """Capture a single frame from an MJPEG/RTSP URL and save to the project dataset."""
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)

    import cv2
    import uuid
    from backend.services.storage_service import storage_service

    cap = cv2.VideoCapture(url)
    if not cap.isOpened():
        raise HTTPException(400, detail=f"Cannot open stream: {url}")

    try:
        ret, frame = cap.read()
        if not ret or frame is None:
            raise HTTPException(400, detail="Failed to read frame from stream")
    finally:
        cap.release()

    # Save frame as JPEG
    import tempfile
    image_uuid = str(uuid.uuid4())
    rel_path = f"datasets/{ds['id']}/{image_uuid}.jpg"
    abs_path = storage_service.backend._full_path(rel_path)
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(abs_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

    # Generate thumbnail
    from PIL import Image
    thumb_rel = f"datasets/{ds['id']}/thumbnails/{image_uuid}_thumb.jpg"
    thumb_full = storage_service.backend._full_path(thumb_rel)
    thumb_full.parent.mkdir(parents=True, exist_ok=True)
    h, w = frame.shape[:2]
    with Image.open(abs_path) as img:
        img.thumbnail((256, 256), Image.LANCZOS)
        img.save(thumb_full, "JPEG", quality=80)

    file_size = abs_path.stat().st_size
    filename = f"capture_{image_uuid[:8]}.jpg"

    img_record = db["images"].create({
        "dataset_id": ds["id"],
        "filename": filename,
        "storage_path": rel_path,
        "thumbnail_path": thumb_rel,
        "width": w,
        "height": h,
        "file_size_bytes": file_size,
        "status": "uploaded",
    })

    ds["image_count"] = ds.get("image_count", 0) + 1
    db["datasets"].update(ds["id"], {"image_count": ds["image_count"]})

    return {"uploaded": 1, "errors": [], "image": img_record}


@router.get("/projects/{project_id}/images")
def project_list_images(project_id: str, page: int = Query(1, ge=1),
                         per_page: int = Query(50, ge=1, le=200),
                         status_filter: str = Query("", alias="status"),
                         user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)
    imgs = db["images"].filter(lambda i: i["dataset_id"] == ds["id"])
    if status_filter: imgs = [i for i in imgs if i.get("status") == status_filter]
    total = len(imgs)
    start = (page - 1) * per_page
    result = []
    for i in imgs[start:start + per_page]:
        i = dict(i)
        i["thumbnail_url"] = f"/api/v1/images/{i['id']}/thumbnail"
        i["image_url"] = f"/api/v1/images/{i['id']}/file"
        result.append(i)
    return {"items": result, "total": total, "page": page, "per_page": per_page}


@router.get("/projects/{project_id}/classes")
def project_list_classes(project_id: str, user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)
    return db["label_classes"].filter(lambda c: c["dataset_id"] == ds["id"])


@router.post("/projects/{project_id}/classes", status_code=201)
def project_create_class(project_id: str, data: LabelClassCreate, user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)
    existing = db["label_classes"].filter(lambda c: c["dataset_id"] == ds["id"])
    return db["label_classes"].create({
        "dataset_id": ds["id"], "name": data.name,
        "yolo_index": len(existing), "color": data.color,
    })


@router.post("/projects/{project_id}/export/yolo")
def project_export_yolo(project_id: str, user: dict = Depends(get_current_user)):
    _own_project(project_id, user)
    ds = resolve_project_dataset(project_id)
    out = storage_service.exports_dir / f"dataset_{ds['id']}"
    generate_yolo_dataset(ds["id"], out, {"train": 0.7, "val": 0.2, "test": 0.1})
    zip_path = out.parent / f"{out.name}.zip"
    return FileResponse(zip_path, media_type="application/zip", filename=f"dataset_{ds['id']}.zip")
