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

# Model cache to avoid reloading on every inference request
_model_cache: dict[str, "ModelAdapter"] = {}

def _get_adapter(weights_path: str) -> "ModelAdapter":
    if weights_path not in _model_cache:
        from training_engine.adapter import ModelAdapter
        _model_cache[weights_path] = ModelAdapter(weights_path)
    return _model_cache[weights_path]


def _resolve_model_path(m: dict, fmt: str) -> str:
    """Resolve model file path for the given format."""
    if fmt == "onnx":
        path = m.get("onnx_path")
        if path and Path(path).exists():
            return path
        raise HTTPException(400, detail="ONNX model not available, export it first")
    # Default: PT weights
    path = m.get("weights_path")
    if not path or not Path(path).exists():
        raise HTTPException(400, detail="Model weights not available")
    return path

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
    m = _own_model(model_id, user)
    if format == "onnx":
        path = export_model_to_onnx(model_id)
        if path: return {"format": "onnx", "path": path, "download_url": f"/api/v1/models/{model_id}/download/onnx"}
        raise HTTPException(500, detail="ONNX export failed")
    if format == "int8_onnx":
        # Ensure ONNX exists first
        onnx_path = m.get("onnx_path")
        if not onnx_path or not Path(onnx_path).exists():
            onnx_path = export_model_to_onnx(model_id)
            if not onnx_path:
                raise HTTPException(500, detail="ONNX export failed first, cannot quantize")
        try:
            from training_engine.adapter import ModelAdapter
            weights = m.get("weights_path")
            if not weights: raise HTTPException(400, detail="No weights available")
            adapter = ModelAdapter(weights)
            method = "dynamic"  # default
            quant_path = adapter.export_quantized(int8=True, calibration_method=method)
            if quant_path:
                db["trained_models"].update(model_id, {"int8_onnx_path": str(quant_path)})
                return {"format": "int8_onnx", "path": quant_path, "download_url": f"/api/v1/models/{model_id}/download/int8_onnx"}
        except Exception as e:
            raise HTTPException(500, detail=f"INT8 quantization failed: {e}")
        raise HTTPException(500, detail="INT8 quantization failed")
    raise HTTPException(400, detail=f"Unsupported format: {format}")

@router.post("/{model_id}/predict")
async def predict_image(
    model_id: str,
    file: UploadFile = File(...),
    conf: float = Query(0.25),
    format: str = Query("pt"),
    user: dict = Depends(get_current_user),
):
    m = _own_model(model_id, user)
    weights = _resolve_model_path(m, format)

    # Save uploaded file
    tmp_dir = Path(tempfile.mkdtemp())
    img_path = tmp_dir / (file.filename or "upload.jpg")
    with open(img_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Run inference — no disk save, return annotated image as base64
    adapter = _get_adapter(weights)

    try:
        results = adapter.predict(source=str(img_path), conf=conf, save=False)
    except Exception as e:
        raise HTTPException(500, detail=f"Prediction failed: {e}")

    result = results[0] if len(results) > 0 else None
    if result is None:
        raise HTTPException(500, detail="No prediction result")

    # Generate annotated image as base64
    import base64, io
    from PIL import Image
    annotated = result.plot()  # BGR from ultralytics/OpenCV
    annotated = annotated[..., ::-1]  # BGR -> RGB for PIL
    pil_img = Image.fromarray(annotated)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=90)
    img_base64 = base64.b64encode(buf.getvalue()).decode()

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
        "image_base64": img_base64,
    }


@router.post("/{model_id}/predict-video")
async def predict_video(
    model_id: str,
    file: UploadFile = File(...),
    conf: float = Query(0.25),
    sample_count: int = Query(4),
    frame_skip: int = Query(10),
    format: str = Query("pt"),
    user: dict = Depends(get_current_user),
):
    m = _own_model(model_id, user)
    weights = _resolve_model_path(m, format)

    # Save uploaded video to temp
    tmp_dir = Path(tempfile.mkdtemp())
    video_path = tmp_dir / (file.filename or "upload.mp4")
    with open(video_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        import cv2
        import base64, io
        from PIL import Image
        from training_engine.adapter import ModelAdapter

        adapter = ModelAdapter(weights)
        cap = cv2.VideoCapture(str(video_path))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)

        all_detections: list[dict] = []
        samples: list[str] = []  # base64 annotated frames
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_skip == 0:
                # Save frame as temp image for model inference
                frame_path = tmp_dir / f"frame_{frame_idx}.jpg"
                cv2.imwrite(str(frame_path), frame)
                results = adapter.predict(source=str(frame_path), conf=conf, save=False)
                r = results[0] if len(results) > 0 else None

                if r is not None and hasattr(r, 'boxes') and r.boxes:
                    names = getattr(r, 'names', {})
                    for box in r.boxes:
                        cls_id = int(box.cls[0]) if hasattr(box.cls[0], 'item') else int(box.cls[0])
                        all_detections.append({
                            "class": names.get(cls_id, str(cls_id)),
                            "class_id": cls_id,
                            "confidence": round(float(box.conf[0]), 4),
                            "frame": frame_idx,
                        })

                    # Save annotated frame as sample (up to sample_count)
                    if len(samples) < sample_count:
                        annotated = r.plot()
                        pil_img = Image.fromarray(annotated)
                        buf = io.BytesIO()
                        pil_img.save(buf, format="JPEG", quality=85)
                        samples.append(base64.b64encode(buf.getvalue()).decode())

            frame_idx += 1

        cap.release()

        # Summary stats
        class_counts: dict[str, int] = {}
        for d in all_detections:
            class_counts[d["class"]] = class_counts.get(d["class"], 0) + 1

        return {
            "total_frames": total_frames,
            "processed_frames": frame_idx,
            "fps": round(fps, 1) if fps else 0,
            "total_detections": len(all_detections),
            "class_summary": class_counts,
            "samples": samples,
            "detections": all_detections[:200],  # limit detail to first 200
        }
    finally:
        try: shutil.rmtree(tmp_dir)
        except Exception: pass


@router.get("/compare/data")
def compare_models(ids: str = Query(...), user: dict = Depends(get_current_user)):
    model_ids = [m.strip() for m in ids.split(",") if m.strip()]
    result = []
    for mid in model_ids:
        m = db["trained_models"].get(mid)
        if m: result.append(m)
    return {"models": result}
