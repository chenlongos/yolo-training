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


def _resolve_model_path(m: dict) -> str:
    """Auto-detect model file path: use ONNX for exported models, PT for originals."""
    # If model has format_type and ONNX path, use ONNX
    if m.get("format_type") and "onnx" in str(m.get("format_type", "")):
        for key in ["int8_onnx_path", "fp16_onnx_path", "onnx_path"]:
            path = m.get(key)
            if path and Path(path).exists():
                return path
    # Default: weights_path (works for both PT and format-specific children)
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
    path_map = {"pt": m.get("weights_path"), "onnx": m.get("onnx_path"), "fp16_onnx": m.get("fp16_onnx_path"), "int8_onnx": m.get("int8_onnx_path"), "cvimodel": m.get("cvimodel_path")}
    fp = path_map.get(format)
    if not fp: raise HTTPException(404, detail=f"Format '{format}' not available")
    p = Path(fp)
    if not p.exists(): raise HTTPException(404, detail="File not found")
    return FileResponse(p, filename=p.name)

def _create_format_model(parent: dict, format_key: str, format_label: str, file_path: str) -> dict:
    """Create a child model entry for an exported format so it appears in the model list."""
    # Check if a model for this format already exists
    existing = db["trained_models"].filter(
        lambda m: m.get("parent_model_id") == parent["id"] and m.get("format_type") == format_key
    )
    if existing:
        m = existing[0]
        db["trained_models"].update(m["id"], {format_key + "_path": file_path, "weights_path": file_path})
        return db["trained_models"].get(m["id"])

    child = db["trained_models"].create({
        "project_id": parent["project_id"],
        "name": f"{parent['name']} ({format_label})",
        "status": "completed",
        "weights_path": file_path,
        "onnx_path": file_path if "onnx" in format_key and format_key != "cvimodel" else None,
        "cvimodel_path": file_path if format_key == "cvimodel" else None,
        "parent_model_id": parent["id"],
        "format_type": format_key,
        "metrics": parent.get("metrics"),
        "config_id": parent.get("config_id"),
        "dataset_id": parent.get("dataset_id"),
    })
    return child


@router.post("/{model_id}/export")
def export_model(model_id: str, format: str = "onnx", user: dict = Depends(get_current_user)):
    m = _own_model(model_id, user)
    if format == "onnx":
        path = export_model_to_onnx(model_id)
        if not path: raise HTTPException(500, detail="ONNX export failed")
        # Also create a child model for the ONNX format
        child = _create_format_model(m, "onnx", "ONNX", path)
        return {"format": "onnx", "path": path, "download_url": f"/api/v1/models/{child['id']}/download/onnx", "model_id": child["id"]}
    if format == "fp16_onnx":
        try:
            from training_engine.adapter import ModelAdapter
            weights = m.get("weights_path")
            if not weights: raise HTTPException(400, detail="No weights available")
            adapter = ModelAdapter(weights)
            path = adapter.export(format_name="onnx", half=True)
            if not path: raise HTTPException(500, detail="FP16 export failed")
            fp16_path = str(Path(path).parent / "best_fp16.onnx")
            db["trained_models"].update(model_id, {"fp16_onnx_path": fp16_path})
            child = _create_format_model(m, "fp16_onnx", "FP16", fp16_path)
            return {"format": "fp16_onnx", "path": fp16_path, "download_url": f"/api/v1/models/{child['id']}/download/fp16_onnx", "model_id": child["id"]}
        except Exception as e:
            raise HTTPException(500, detail=f"FP16 export failed: {e}")
    if format == "cvimodel":
        from backend.services.cvimodel_service import generate_cvimodel_guide
        return generate_cvimodel_guide(model_id)
    if format == "int8_onnx":
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
            quant_path = adapter.export_quantized(int8=True)
            if not quant_path: raise HTTPException(500, detail="INT8 quantization failed")
            quant_path_str = str(quant_path)
            db["trained_models"].update(model_id, {"int8_onnx_path": quant_path_str})
            child = _create_format_model(m, "int8_onnx", "INT8", quant_path_str)
            return {"format": "int8_onnx", "path": quant_path_str, "download_url": f"/api/v1/models/{child['id']}/download/int8_onnx", "model_id": child["id"]}
        except Exception as e:
            raise HTTPException(500, detail=f"INT8 quantization failed: {e}")
    raise HTTPException(400, detail=f"Unsupported format: {format}")

@router.post("/{model_id}/predict")
async def predict_image(
    model_id: str,
    file: UploadFile = File(...),
    conf: float = Query(0.25),
    user: dict = Depends(get_current_user),
):
    m = _own_model(model_id, user)
    weights = _resolve_model_path(m)

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
    user: dict = Depends(get_current_user),
):
    m = _own_model(model_id, user)
    weights = _resolve_model_path(m)

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


@router.get("/cvimodel/status")
def cvimodel_docker_status(user: dict = Depends(get_current_user)):
    """Check if Docker and the sophgo/tpuc_dev image are ready for cvimodel conversion."""
    from backend.services.cvimodel_service import check_docker_status
    return check_docker_status()


@router.get("/{model_id}/deploy")
def get_deploy_files(model_id: str, user: dict = Depends(get_current_user)):
    _own_model(model_id, user)
    from backend.services.deploy_service import generate_deployment
    try:
        return generate_deployment(model_id)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))


@router.get("/compare/data")
def compare_models(ids: str = Query(...), user: dict = Depends(get_current_user)):
    model_ids = [m.strip() for m in ids.split(",") if m.strip()]
    result = []
    for mid in model_ids:
        m = db["trained_models"].get(mid)
        if m: result.append(m)
    return {"models": result}
