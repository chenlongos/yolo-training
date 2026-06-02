"""Run all locally runnable models on test images and compare results."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
TEST_IMG_DIR = ROOT / "dataset" / "test" / "images"
OUTPUT_DIR = ROOT / "runs" / "compare"
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
CLASS_NAMES = ["tennis_ball"]

# Models to evaluate (skip .cvimodel which needs TPU)
MODELS = [
    ("pt", ROOT / "runs/detect/runs/tennis/train2/weights/best.pt", "train2_best"),
    ("pt", ROOT / "runs/detect/runs/tennis/train2/weights/last.pt", "train2_last"),
    ("onnx", ROOT / "runs/detect/runs/tennis/train2/weights/best.onnx", "train2_fp32"),
    ("onnx", ROOT / "runs/detect/runs/tennis/train2/weights/best_fp16.onnx", "train2_fp16"),
    ("onnx", ROOT / "runs/detect/runs/tennis/train2/weights/best_int8.onnx", "train2_int8"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def collect_test_images(limit: int = 20) -> list[Path]:
    exts = {".jpg", ".jpeg", ".png", ".bmp"}
    imgs = sorted(p for p in TEST_IMG_DIR.iterdir() if p.suffix.lower() in exts)
    if not imgs:
        print(f"No test images found in {TEST_IMG_DIR}")
        sys.exit(1)
    return imgs[:limit]


def letterbox(img: np.ndarray, new_shape: int = 640) -> tuple[np.ndarray, float, tuple[int, int]]:
    h, w = img.shape[:2]
    scale = min(new_shape / h, new_shape / w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(img, (nw, nh))
    pad_h = new_shape - nh
    pad_w = new_shape - nw
    top, left = pad_h // 2, pad_w // 2
    padded = cv2.copyMakeBorder(resized, top, pad_h - top, left, pad_w - left,
                                cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return padded, scale, (left, top)


def draw_boxes(img: np.ndarray, boxes: list, label: str) -> np.ndarray:
    out = img.copy()
    for x1, y1, x2, y2, conf in boxes:
        cv2.rectangle(out, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        text = f"{label} {conf:.2f}"
        cv2.putText(out, text, (int(x1), int(y1) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    return out


def postprocess_onnx(output: np.ndarray, conf: float, iou: float,
                     orig_shape: tuple[int, int], scale: float,
                     pad: tuple[int, int]) -> list:
    """Post-process YOLOv8 ONNX output -> list of (x1,y1,x2,y2,conf) in orig coords."""
    # output shape: [1, 5+num_classes, 8400] or [1, num_preds, 5+num_classes]
    if output.ndim == 3:
        if output.shape[1] < output.shape[2]:
            output = output[0].T  # [8400, 5+nc]

    # For single-class tennis_ball, output columns: cx, cy, w, h, obj_conf
    # or cx, cy, w, h, class_conf
    if output.shape[1] >= 5:
        scores = output[:, 4]
    else:
        return []

    mask = scores > conf
    filtered = output[mask]
    if len(filtered) == 0:
        return []

    cx, cy, w, h = filtered[:, 0], filtered[:, 1], filtered[:, 2], filtered[:, 3]
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2
    confs = filtered[:, 4]

    # NMS
    indices = cv2.dnn.NMSBoxes(
        bboxes=[[float(x1[i]), float(y1[i]), float(w[i]), float(h[i])] for i in range(len(x1))],
        scores=[float(c) for c in confs],
        score_threshold=conf,
        nms_threshold=iou,
    )
    results = []
    left, top = pad
    for i in indices:
        i = int(i)
        rx1 = (x1[i] - left) / scale
        ry1 = (y1[i] - top) / scale
        rx2 = (x2[i] - left) / scale
        ry2 = (y2[i] - top) / scale
        results.append((float(rx1), float(ry1), float(rx2), float(ry2), float(confs[i])))
    return results


# ---------------------------------------------------------------------------
# Runners
# ---------------------------------------------------------------------------
def run_pt_model(model_path: Path, images: list[Path], tag: str) -> dict:
    from ultralytics import YOLO
    model = YOLO(str(model_path))

    total_time = 0.0
    total_dets = 0
    per_image_boxes: dict[str, list] = {}

    for img_path in images:
        t0 = time.perf_counter()
        results = model.predict(source=str(img_path), conf=CONF_THRESHOLD,
                                iou=IOU_THRESHOLD, verbose=False, device="")
        elapsed = time.perf_counter() - t0
        total_time += elapsed

        boxes = []
        for r in results:
            for b in r.boxes:
                x1, y1, x2, y2 = b.xyxy[0].cpu().numpy()
                boxes.append((float(x1), float(y1), float(x2), float(y2), float(b.conf[0])))
        per_image_boxes[img_path.name] = boxes
        total_dets += len(boxes)

    avg_ms = (total_time / len(images)) * 1000
    return {"tag": tag, "format": "PyTorch", "images": len(images),
            "total_dets": total_dets, "avg_ms": round(avg_ms, 1),
            "boxes": per_image_boxes}


def run_onnx_model(model_path: Path, images: list[Path], tag: str) -> dict:
    import onnxruntime as ort
    session = ort.InferenceSession(str(model_path))
    input_name = session.get_inputs()[0].name
    h_input, w_input = session.get_inputs()[0].shape[2:4]

    total_time = 0.0
    total_dets = 0
    per_image_boxes: dict[str, list] = {}

    for img_path in images:
        bgr = cv2.imread(str(img_path))
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        padded, scale, pad = letterbox(rgb, new_shape=h_input)
        blob = padded.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis]

        t0 = time.perf_counter()
        outputs = session.run(None, {input_name: blob})
        elapsed = time.perf_counter() - t0
        total_time += elapsed

        boxes = postprocess_onnx(outputs[0], CONF_THRESHOLD, IOU_THRESHOLD,
                                 bgr.shape[:2], scale, pad)
        per_image_boxes[img_path.name] = boxes
        total_dets += len(boxes)

    avg_ms = (total_time / len(images)) * 1000
    return {"tag": tag, "format": "ONNX", "images": len(images),
            "total_dets": total_dets, "avg_ms": round(avg_ms, 1),
            "boxes": per_image_boxes}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    images = collect_test_images(limit=20)
    print(f"Using {len(images)} test images from {TEST_IMG_DIR}\n")

    results = []
    for fmt, path, tag in MODELS:
        if not path.exists():
            print(f"SKIP  {tag:25s}  ({path.name} not found)")
            continue
        print(f"RUN   {tag:25s}  ({path.name}) ...", end=" ", flush=True)
        try:
            if fmt == "pt":
                r = run_pt_model(path, images, tag)
            else:
                r = run_onnx_model(path, images, tag)
            print(f"avg {r['avg_ms']:.1f}ms/img, {r['total_dets']} detections")
            results.append(r)
        except Exception as e:
            print(f"ERROR: {e}")

    if not results:
        print("\nNo models ran successfully.")
        return

    # Save visual results for first test image
    sample = images[0]
    print(f"\nSaving visual results for {sample.name} ...")
    bgr = cv2.imread(str(sample))
    vis_dir = OUTPUT_DIR / "vis"
    vis_dir.mkdir(parents=True, exist_ok=True)

    for r in results:
        boxes = r["boxes"].get(sample.name, [])
        drawn = draw_boxes(bgr, boxes, r["tag"])
        out_path = vis_dir / f"{sample.stem}_{r['tag']}.jpg"
        cv2.imwrite(str(out_path), drawn)

    # Print comparison table
    print(f"\n{'Model':25s} {'Format':8s} {'Avg ms/img':>10s} {'Dets':>6s}")
    print("-" * 55)
    for r in sorted(results, key=lambda x: x["avg_ms"]):
        print(f"{r['tag']:25s} {r['format']:8s} {r['avg_ms']:>10.1f} {r['total_dets']:>6d}")

    print(f"\nVisual results saved to {vis_dir}")


if __name__ == "__main__":
    main()
