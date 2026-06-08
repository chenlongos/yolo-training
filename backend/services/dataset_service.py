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


# ── YOLO label file storage ──

def _label_path_for_image(image: dict) -> Path:
    """Get the .txt label path for an image from its storage_path."""
    sp = Path(image.get("storage_path", ""))
    ds_id = image.get("dataset_id", "")
    stem = sp.stem  # UUID without extension
    return storage_service.storage_root / "datasets" / ds_id / "labels" / f"{stem}.txt"


def save_yolo_labels(image_id: str) -> Path | None:
    """Write YOLO-format label .txt for an image. Returns path or None if empty."""
    image = db["images"].get(image_id)
    if not image: return None

    anns = db["annotations"].filter(lambda a: a["image_id"] == image_id)
    if not anns:
        # Remove label file if no annotations
        p = _label_path_for_image(image)
        if p.exists(): p.unlink()
        return None

    # Build class_id → yolo_index map
    ds_id = image.get("dataset_id", "")
    classes = {c["id"]: c.get("yolo_index", 0) for c in db["label_classes"].filter(lambda c: c["dataset_id"] == ds_id)}

    lines = []
    for a in anns:
        yolo_idx = classes.get(a["class_id"], 0)
        lines.append(f"{yolo_idx} {a['x_center']:.6f} {a['y_center']:.6f} {a['width']:.6f} {a['height']:.6f}")

    p = _label_path_for_image(image)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(lines) + "\n")
    return p


def load_yolo_labels(image_id: str) -> list[dict]:
    """Read annotations from YOLO .txt file. Falls back to JSON store."""
    image = db["images"].get(image_id)
    if not image: return []

    p = _label_path_for_image(image)
    if not p.exists():
        # Fallback: read from JSON store
        return db["annotations"].filter(lambda a: a["image_id"] == image_id)

    ds_id = image.get("dataset_id", "")
    classes_by_idx: dict[int, dict] = {}
    for c in db["label_classes"].filter(lambda c: c["dataset_id"] == ds_id):
        classes_by_idx[c.get("yolo_index", 0)] = c

    anns = []
    for line in p.read_text().strip().splitlines():
        parts = line.strip().split()
        if len(parts) < 5: continue
        try:
            yolo_idx = int(parts[0])
            xc, yc, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
        except ValueError:
            continue
        cls = classes_by_idx.get(yolo_idx, {})
        anns.append({
            "class_id": cls.get("id", ""),
            "class_name": cls.get("name", ""),
            "x_center": xc, "y_center": yc, "width": w, "height": h,
        })
    return anns
