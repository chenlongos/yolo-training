"""Tennis ball real-time detection demo using INT8 quantized ONNX model."""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parent
DEFAULT_MODEL = ROOT / "runs" / "detect" / "runs" / "tennis" / "train2" / "weights" / "best_int8.onnx"
CLASS_NAMES = ["tennis_ball"]
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45
INPUT_SIZE = 640


def letterbox(img: np.ndarray, new_shape: int = INPUT_SIZE):
    h, w = img.shape[:2]
    scale = min(new_shape / h, new_shape / w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(img, (nw, nh))
    pad_h, pad_w = new_shape - nh, new_shape - nw
    top, left = pad_h // 2, pad_w // 2
    padded = cv2.copyMakeBorder(
        resized, top, pad_h - top, left, pad_w - left,
        cv2.BORDER_CONSTANT, value=(114, 114, 114),
    )
    return padded, scale, (left, top)


def postprocess(output: np.ndarray, conf: float, iou: float,
                orig_shape: tuple[int, int], scale: float,
                pad: tuple[int, int]) -> list:
    if output.ndim == 3:
        if output.shape[1] < output.shape[2]:
            output = output[0].T
    if output.shape[1] < 5:
        return []
    scores = output[:, 4]
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
    indices = cv2.dnn.NMSBoxes(
        bboxes=[[float(x1[i]), float(y1[i]), float(w[i]), float(h[i])] for i in range(len(x1))],
        scores=[float(c) for c in confs],
        score_threshold=conf,
        nms_threshold=iou,
    )
    left, top = pad
    results = []
    for i in indices:
        i = int(i)
        rx1 = (x1[i] - left) / scale
        ry1 = (y1[i] - top) / scale
        rx2 = (x2[i] - left) / scale
        ry2 = (y2[i] - top) / scale
        results.append((float(rx1), float(ry1), float(rx2), float(ry2), float(confs[i])))
    return results


def draw_boxes(img: np.ndarray, boxes: list) -> np.ndarray:
    out = img.copy()
    for x1, y1, x2, y2, conf in boxes:
        cv2.rectangle(out, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
        text = f"tennis_ball {conf:.2f}"
        cv2.putText(out, text, (int(x1), int(y1) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
    return out


def main():
    parser = argparse.ArgumentParser(description="Tennis ball real-time detection (INT8 ONNX)")
    parser.add_argument("--model", type=str, default=str(DEFAULT_MODEL), help="Path to INT8 ONNX model")
    parser.add_argument("--conf", type=float, default=CONF_THRESHOLD, help="Confidence threshold")
    parser.add_argument("--camera", type=int, default=0, help="Camera index")
    args = parser.parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        return

    session = ort.InferenceSession(str(model_path))
    input_name = session.get_inputs()[0].name
    h_input, w_input = session.get_inputs()[0].shape[2:4]

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"Cannot open camera {args.camera}")
        return

    print("Press 'q' or ESC to quit.")
    prev_time = time.perf_counter()

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        padded, scale, pad = letterbox(rgb, new_shape=h_input)
        blob = padded.astype(np.float32) / 255.0
        blob = np.transpose(blob, (2, 0, 1))[np.newaxis]

        outputs = session.run(None, {input_name: blob})
        boxes = postprocess(outputs[0], args.conf, IOU_THRESHOLD,
                            frame.shape[:2], scale, pad)

        vis = draw_boxes(frame, boxes)

        curr_time = time.perf_counter()
        fps = 1.0 / max(curr_time - prev_time, 1e-6)
        prev_time = curr_time
        cv2.putText(vis, f"FPS: {fps:.1f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)

        cv2.imshow("Tennis Ball Detection (INT8)", vis)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), 27):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
