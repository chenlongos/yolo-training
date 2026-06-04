"""Model service — file-based."""
from pathlib import Path
from backend.store import db

def export_model_to_onnx(model_id: str) -> str | None:
    m = db["trained_models"].get(model_id)
    if not m or not m.get("weights_path"): return None
    weights = Path(m["weights_path"])
    if not weights.exists(): return None
    try:
        from training_engine.adapter import ModelAdapter
        adapter = ModelAdapter(str(weights))
        adapter.export(format_name="onnx")
        onnx_path = weights.parent / "best.onnx"
        if onnx_path.exists():
            db["trained_models"].update(model_id, {"onnx_path": str(onnx_path)})
            return str(onnx_path)
    except Exception as e:
        print(f"ONNX export failed: {e}")
    return None

def get_model_formats(model: dict) -> list[dict]:
    formats = []
    for fmt, key in [("pt", "weights_path"), ("onnx", "onnx_path"), ("fp16_onnx", "fp16_onnx_path"), ("int8_onnx", "int8_onnx_path")]:
        if model.get(key) and Path(model[key]).exists():
            formats.append({"format": fmt, "label": f"{fmt.upper()}", "path": model[key]})
    return formats
