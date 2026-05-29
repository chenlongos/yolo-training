"""Test RKNN model inference on a test image (simulator or device).

Simulator mode: loads split ONNX + builds + runs on CPU.
Device mode: loads .rknn + runs on real RK3588 via adb.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from rknn.api import RKNN

ROOT = Path(__file__).resolve().parent.parent
TEST_IMG_DIR = ROOT / "dataset" / "test" / "images"
SPLIT_ONNX = Path(__file__).resolve().parent / "best_split.onnx"
CALIB_LIST = Path(__file__).resolve().parent / "calibration_list.txt"
OUTPUT_DIR = Path(__file__).resolve().parent
CONF_THRESHOLD = 0.25
IOU_THRESHOLD = 0.45


def letterbox(img: np.ndarray, new_shape: int = 640):
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


def postprocess(boxes_data: np.ndarray, scores_data: np.ndarray,
                conf: float, iou: float,
                orig_shape: tuple[int, int], scale: float,
                pad: tuple[int, int]) -> list:
    # boxes_data: [1, 4, 8400] -> [8400, 4]
    # scores_data: [1, 1, 8400] -> [8400]
    if boxes_data.ndim == 3:
        boxes_data = boxes_data[0].T  # [8400, 4]
    if scores_data.ndim == 3:
        scores_data = scores_data[0].flatten()  # [8400]

    mask = scores_data > conf
    if not mask.any():
        return []

    filtered_boxes = boxes_data[mask]
    filtered_scores = scores_data[mask]

    cx, cy, w, h = filtered_boxes[:, 0], filtered_boxes[:, 1], filtered_boxes[:, 2], filtered_boxes[:, 3]
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2

    indices = cv2.dnn.NMSBoxes(
        bboxes=[[float(x1[i]), float(y1[i]), float(w[i]), float(h[i])] for i in range(len(x1))],
        scores=[float(c) for c in filtered_scores],
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
        results.append((float(rx1), float(ry1), float(rx2), float(ry2), float(filtered_scores[i])))
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
    parser = argparse.ArgumentParser(description="Test RKNN tennis ball detection model")
    parser.add_argument("--image", type=str, default=None, help="Test image path")
    parser.add_argument("--target", type=str, default=None, help="Target device (e.g. rk3588). None=simulator")
    args = parser.parse_args()

    # Find test image
    if args.image:
        img_path = Path(args.image)
    else:
        exts = {".jpg", ".jpeg", ".png", ".bmp"}
        imgs = sorted(p for p in TEST_IMG_DIR.iterdir() if p.suffix.lower() in exts)
        if not imgs:
            print(f"No test images in {TEST_IMG_DIR}")
            return
        img_path = imgs[0]
    print(f"Test image: {img_path}")

    rknn = RKNN()

    if args.target:
        # Device mode: load .rknn and run on real hardware
        model_path = OUTPUT_DIR / "tennis.rknn"
        print(f"Loading RKNN model: {model_path}")
        ret = rknn.load_rknn(str(model_path))
        if ret != 0:
            print(f"Load failed: {ret}")
            return
        ret = rknn.init_runtime(target=args.target)
    else:
        # Simulator mode: load split ONNX + build
        print(f"Simulator mode: loading split ONNX {SPLIT_ONNX}")
        rknn.config(
            mean_values=[[0, 0, 0]],
            std_values=[[255, 255, 255]],
            target_platform="rk3588",
            quantized_algorithm="normal",
            single_core_mode=True,
            model_pruning=False,
        )
        ret = rknn.load_onnx(model=str(SPLIT_ONNX))
        if ret != 0:
            print(f"Load ONNX failed: {ret}")
            return
        print("Building model for simulator (this takes a while)...")
        ret = rknn.build(
            do_quantization=True,
            dataset=str(CALIB_LIST),
        )
        if ret != 0:
            print(f"Build failed: {ret}")
            return
        ret = rknn.init_runtime()

    if ret != 0:
        print(f"Init runtime failed: {ret}")
        return
    print("Runtime ready.")

    # Read and preprocess image
    bgr = cv2.imread(str(img_path))
    if bgr is None:
        print(f"Cannot read image: {img_path}")
        return
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    padded, scale, pad = letterbox(rgb, new_shape=640)
    input_data = np.expand_dims(padded, axis=0).astype(np.uint8)

    # Inference
    print("Running inference...")
    outputs = rknn.inference(inputs=[input_data])
    if outputs is None:
        print("Inference failed.")
        rknn.release()
        return

    # Split model has 2 outputs: boxes_raw [1,4,8400], scores_raw [1,1,8400]
    print(f"Number of outputs: {len(outputs)}")
    boxes_out = outputs[0].astype(np.float32)
    scores_out = outputs[1].astype(np.float32) if len(outputs) > 1 else outputs[0][:, 4:, :].astype(np.float32)
    print(f"Boxes: dtype={outputs[0].dtype}, shape={boxes_out.shape}, range=[{boxes_out.min():.1f}, {boxes_out.max():.1f}]")
    print(f"Scores: dtype={outputs[1].dtype if len(outputs) > 1 else 'N/A'}, shape={scores_out.shape}, range=[{scores_out.min():.4f}, {scores_out.max():.4f}]")

    # Post-process
    boxes = postprocess(boxes_out, scores_out, CONF_THRESHOLD, IOU_THRESHOLD,
                        bgr.shape[:2], scale, pad)
    print(f"Detected {len(boxes)} tennis ball(s)")
    for i, (x1, y1, x2, y2, conf) in enumerate(boxes):
        print(f"  [{i}] ({int(x1)}, {int(y1)}) ({int(x2)}, {int(y2)}) conf={conf:.3f}")

    # Draw and save
    vis = draw_boxes(bgr, boxes)
    out_path = OUTPUT_DIR / f"{img_path.stem}_rknn_result.jpg"
    cv2.imwrite(str(out_path), vis)
    print(f"Result saved to {out_path}")

    rknn.release()


if __name__ == "__main__":
    main()
