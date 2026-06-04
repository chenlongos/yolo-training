"""Docker deployment service — generate deployment files for models."""

from pathlib import Path
from backend.store import db

INFERENCE_SERVER_TEMPLATE = '''"""Auto-generated YOLO inference server."""
import io, base64
from pathlib import Path
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import uvicorn

MODEL_PATH = "{model_path}"
MODEL_FORMAT = "{model_format}"

app = FastAPI(title="YOLO Inference Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

model = YOLO(MODEL_PATH)

@app.get("/health")
def health():
    return {{"status": "ok", "format": MODEL_FORMAT}}

@app.post("/predict")
async def predict(file: UploadFile = File(...), conf: float = Query(0.25)):
    img_bytes = await file.read()
    img = Image.open(io.BytesIO(img_bytes))
    results = model(img, conf=conf)
    r = results[0]

    detections = []
    if r.boxes:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            detections.append({{
                "class": r.names.get(cls_id, str(cls_id)),
                "confidence": round(float(box.conf[0]), 4),
                "bbox": [round(float(x), 1) for x in box.xyxy[0].tolist()],
            }})

    annotated = r.plot()
    annotated = annotated[..., ::-1]  # BGR -> RGB
    pil_img = Image.fromarray(annotated)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG", quality=85)

    return {{
        "detections": detections,
        "count": len(detections),
        "image_base64": base64.b64encode(buf.getvalue()).decode(),
    }}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''

DOCKERFILE_TEMPLATE = '''FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir ultralytics fastapi uvicorn python-multipart pillow

COPY model.pt /app/model.pt
COPY server.py /app/server.py

EXPOSE 8000

CMD ["python", "server.py"]
'''

COMPOSE_TEMPLATE = '''version: "3.8"
services:
  yolo-inference:
    build: .
    ports:
      - "8000:8000"
    restart: unless-stopped
'''


def generate_deployment(model_id: str) -> dict:
    """Generate Docker deployment files for a model."""
    m = db["trained_models"].get(model_id)
    if not m:
        raise ValueError("Model not found")

    # Determine model path and format
    weights = m.get("weights_path")
    if not weights:
        raise ValueError("Model has no weights")

    fmt = m.get("format_type") or "pt"
    model_filename = Path(weights).name

    # Generate files
    server_code = INFERENCE_SERVER_TEMPLATE.format(
        model_path=f"/app/{model_filename}",
        model_format=fmt.upper(),
    )

    dockerfile = DOCKERFILE_TEMPLATE.replace("model.pt", model_filename)

    compose = COMPOSE_TEMPLATE

    return {
        "model_name": m["name"],
        "model_format": fmt.upper(),
        "model_filename": model_filename,
        "files": {
            "server.py": server_code,
            "Dockerfile": dockerfile,
            "docker-compose.yml": compose,
        },
        "instructions": [
            f"1. 将模型文件 {model_filename} 复制到部署目录",
            "2. 将上述三个文件也放入同一目录",
            "3. 运行: docker compose up -d",
            "4. 测试: curl http://localhost:8000/health",
            "5. 推理: curl -X POST -F 'file=@image.jpg' http://localhost:8000/predict",
        ],
    }


def generate_deployment_package(model_id: str, output_dir: Path) -> Path:
    """Write deployment files to a directory, return the directory path."""
    info = generate_deployment(model_id)
    output_dir.mkdir(parents=True, exist_ok=True)

    for filename, content in info["files"].items():
        (output_dir / filename).write_text(content)

    # Also copy the model file
    import shutil
    weights = db["trained_models"].get(model_id)["weights_path"]
    src = Path(weights)
    dst = output_dir / src.name
    if src.exists() and not dst.exists():
        shutil.copy2(src, dst)

    return output_dir
