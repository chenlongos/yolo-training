"""Model routes — file-based storage."""
import shutil, tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import FileResponse
from backend.store import db
from backend.schemas.training import TrainedModelResponse
from backend.dependencies import get_current_user
from backend.services.model_service import export_model_to_onnx, get_model_formats
from backend.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/models", tags=["models"])

def _own_model(mid: str, user: dict) -> dict:
    m = db["trained_models"].get(mid)
    if not m: raise HTTPException(404, detail="Model not found")
    p = db["projects"].get(m["project_id"])
    if not p or str(p.get("user_id")) != str(user.get("id")): raise HTTPException(404, detail="Project not found")
    return m

@router.get("")
def list_models(project_id: str = Query(...), user: dict = Depends(get_current_user)):
    p = db["projects"].get(project_id)
    if not p or str(p.get("user_id")) != str(user.get("id")): raise HTTPException(404, detail="Project not found")
    return {"items": db["trained_models"].filter(lambda m: m["project_id"] == project_id), "total": len(db["trained_models"].filter(lambda m: m["project_id"] == project_id))}

@router.get("/{model_id}")
def get_model(model_id: str, user: dict = Depends(get_current_user)):
    return _own_model(model_id, user)

@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: str, user: dict = Depends(get_current_user)):
    _own_model(model_id, user)
    for j in db["training_jobs"].filter(lambda j: j["model_id"] == model_id):
        db["training_jobs"].delete(j["id"])
    db["trained_models"].delete(model_id)

@router.get("/{model_id}/download/{format}")
def download_model(model_id: str, format: str, user: dict = Depends(get_current_user)):
    m = _own_model(model_id, user)
    path_map = {"pt": m.get("weights_path"), "onnx": m.get("onnx_path"), "int8_onnx": m.get("int8_onnx_path")}
    fp = path_map.get(format)
    if not fp: raise HTTPException(404, detail=f"Format '{format}' not available")
    p = Path(fp)
    if not p.exists(): raise HTTPException(404, detail="File not found")
    return FileResponse(p, filename=p.name)

@router.post("/{model_id}/export")
def export_model(model_id: str, format: str = "onnx", user: dict = Depends(get_current_user)):
    _own_model(model_id, user)
    if format == "onnx":
        path = export_model_to_onnx(model_id)
        if path: return {"format": "onnx", "path": path, "download_url": f"/api/v1/models/{model_id}/download/onnx"}
        raise HTTPException(500, detail="ONNX export failed")
    raise HTTPException(400, detail=f"Unsupported format: {format}")

@router.post("/{model_id}/predict")
async def predict_image(
    model_id: str,
    file: UploadFile = File(...),
    conf: float = Query(0.25),
    user: dict = Depends(get_current_user),
):
    m = _own_model(model_id, user)
    weights = m.get("weights_path")
    if not weights or not Path(weights).exists():
        raise HTTPException(400, detail="Model weights not available")

    # Save uploaded file
    tmp_dir = Path(tempfile.mkdtemp())
    img_path = tmp_dir / (file.filename or "upload.jpg")
    with open(img_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Run inference — use unique run name to avoid predict2/predict3 conflicts
    from training_engine.adapter import ModelAdapter
    import uuid as _uuid
    adapter = ModelAdapter(weights)
    out_dir = storage_service.models_dir / model_id / "predictions"
    out_dir.mkdir(parents=True, exist_ok=True)
    run_name = f"pred_{_uuid.uuid4().hex[:8]}"

    try:
        results = adapter.predict(source=str(img_path), conf=conf, save=True,
                                  project=str(out_dir), name=run_name)
    except Exception as e:
        raise HTTPException(500, detail=f"Prediction failed: {e}")

    result = results[0] if len(results) > 0 else None
    if result is None:
        raise HTTPException(500, detail="No prediction result")

    # Find the saved annotated image in the unique run directory
    pred_dir = out_dir / run_name
    saved_imgs = list(pred_dir.glob("*")) if pred_dir.exists() else []
    result_filename = None
    for p in saved_imgs:
        if p.suffix.lower() in (".jpg", ".jpeg", ".png"):
            result_filename = p.name
            break

    # Build detection data
    detections = []
    if hasattr(result, 'boxes') and result.boxes:
        names = getattr(result, 'names', {})
        for box in result.boxes:
            cls_id = int(box.cls[0]) if hasattr(box.cls[0], 'item') else int(box.cls[0])
            detections.append({
                "class": names.get(cls_id, str(cls_id)),
                "class_id": cls_id,
                "confidence": round(float(box.conf[0]), 4),
                "bbox": [round(float(x), 1) for x in box.xyxy[0].tolist()],
            })

    # Cleanup temp
    try: shutil.rmtree(tmp_dir)
    except Exception: pass

    return {
        "detections": detections,
        "count": len(detections),
        "result_url": f"/api/v1/models/{model_id}/predict-image/{run_name}/{result_filename}" if result_filename else None,
    }


@router.get("/{model_id}/predict-image/{run_name}/{filename}")
def get_predict_image(model_id: str, run_name: str, filename: str, user: dict = Depends(get_current_user)):
    _own_model(model_id, user)
    img_path = storage_service.models_dir / model_id / "predictions" / run_name / filename
    if not img_path.exists():
        raise HTTPException(404, detail="Result image not found")
    return FileResponse(img_path)


@router.get("/compare/data")
def compare_models(ids: str = Query(...), user: dict = Depends(get_current_user)):
    model_ids = [m.strip() for m in ids.split(",") if m.strip()]
    result = []
    for mid in model_ids:
        m = db["trained_models"].get(mid)
        if m: result.append(m)
    return {"models": result}
