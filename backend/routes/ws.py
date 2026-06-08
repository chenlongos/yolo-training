"""WebSocket routes for real-time training progress and inference."""

import json, io, tempfile, shutil
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError
import redis.asyncio as aioredis

from ..config import settings
from ..services.auth_service import decode_token
from ..store import db
from ..services.storage_service import storage_service

router = APIRouter(tags=["websocket"])

# Cached model adapters for WebSocket inference
_ws_adapter_cache: dict[str, "ModelAdapter"] = {}

def _get_ws_adapter(weights_path: str):
    if weights_path not in _ws_adapter_cache:
        from training_engine.adapter import ModelAdapter
        _ws_adapter_cache[weights_path] = ModelAdapter(weights_path)
    return _ws_adapter_cache[weights_path]


@router.websocket("/ws/training/{job_id}")
async def training_progress_ws(
    websocket: WebSocket,
    job_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time training progress updates."""
    # Verify JWT
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=4001)
            return
    except (JWTError, KeyError):
        await websocket.close(code=4001)
        return

    await websocket.accept()

    redis_url = settings.CELERY_BROKER_URL
    redis_conn = aioredis.from_url(redis_url)
    pubsub = redis_conn.pubsub()
    await pubsub.subscribe(f"training:progress:{job_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                await websocket.send_json(data)
                if data.get("type") in ("completed", "error"):
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"training:progress:{job_id}")
        await redis_conn.close()


def _resolve_ws_model(model_id: str) -> dict | None:
    """Resolve model for WebSocket inference. Supports pretrained_ prefix."""
    m = db["trained_models"].get(model_id)
    if m:
        return m

    # Pretrained model: pretrained_yolov8n -> storage/models/pretrained/yolov8n.pt
    if model_id.startswith("pretrained_"):
        name = model_id[len("pretrained_"):]
        pt_path = storage_service.storage_root / "models" / "pretrained" / f"{name}.pt"
        if pt_path.exists():
            return {
                "id": model_id, "name": name,
                "weights_path": str(pt_path),
                "format_type": "pretrained",
            }

    return None


@router.websocket("/ws/inference/{model_id}")
async def inference_ws(websocket: WebSocket, model_id: str, conf: float = 0.25):
    """WebSocket real-time inference: receive JPEG frames, return annotated JPEG."""
    m = _resolve_ws_model(model_id)
    if not m:
        await websocket.close(code=4004, reason="Model not found")
        return
    # Auto-detect: use ONNX paths for exported models, PT weights for originals
    weights = m.get("weights_path")
    if m.get("format_type") and "onnx" in str(m.get("format_type", "")):
        for key in ["int8_onnx_path", "fp16_onnx_path", "onnx_path"]:
            p = m.get(key)
            if p and Path(p).exists():
                weights = p
                break
    if not weights or not Path(weights).exists():
        await websocket.close(code=4004, reason="Weights not available")
        return

    adapter = _get_ws_adapter(weights)
    await websocket.accept()

    try:
        while True:
            # Receive JPEG bytes from client
            frame_bytes = await websocket.receive_bytes()

            # Save to temp for model inference
            tmp_path = Path(tempfile.mkdtemp()) / "frame.jpg"
            tmp_path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path.write_bytes(frame_bytes)

            try:
                results = adapter.predict(source=str(tmp_path), conf=conf, save=False)
                r = results[0] if len(results) > 0 else None

                if r is not None:
                    # Build detection data
                    detections = []
                    if hasattr(r, 'boxes') and r.boxes:
                        names = getattr(r, 'names', {})
                        for box in r.boxes:
                            cls_id = int(box.cls[0]) if hasattr(box.cls[0], 'item') else int(box.cls[0])
                            detections.append({
                                "class": names.get(cls_id, str(cls_id)),
                                "class_id": cls_id,
                                "confidence": round(float(box.conf[0]), 4),
                                "bbox": [round(float(x), 1) for x in box.xyxy[0].tolist()],
                            })

                    # Generate annotated JPEG
                    annotated = r.plot()
                    annotated = annotated[..., ::-1]  # BGR -> RGB
                    from PIL import Image
                    buf = io.BytesIO()
                    Image.fromarray(annotated).save(buf, format="JPEG", quality=85)
                    result_jpeg = buf.getvalue()

                    # Send: [4-byte JSON length][JSON][JPEG bytes]
                    import struct
                    meta = json.dumps({"detections": detections, "count": len(detections)}).encode()
                    await websocket.send_bytes(struct.pack("!I", len(meta)) + meta + result_jpeg)
                else:
                    await websocket.send_bytes(struct.pack("!I", 0) + b"{}")
            finally:
                try: shutil.rmtree(str(tmp_path.parent))
                except Exception: pass

    except WebSocketDisconnect:
        pass
