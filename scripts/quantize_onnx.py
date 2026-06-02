"""Re-quantize ONNX models with static calibration for better INT8 accuracy."""

from __future__ import annotations

import random
from pathlib import Path

import cv2
import numpy as np
import onnx

ROOT = Path(__file__).resolve().parent.parent
CALIB_COUNT = 200
IMGSZ = 640

MODELS_TO_QUANTIZE = [
    ROOT / "runs/detect/runs/tennis/train2/weights/best.onnx",
]


def letterbox(img: np.ndarray, new_shape: int = 640) -> np.ndarray:
    h, w = img.shape[:2]
    scale = min(new_shape / h, new_shape / w)
    nh, nw = int(h * scale), int(w * scale)
    resized = cv2.resize(img, (nw, nh))
    pad_h = new_shape - nh
    pad_w = new_shape - nw
    top, left = pad_h // 2, pad_w // 2
    return cv2.copyMakeBorder(resized, top, pad_h - top, left, pad_w - left,
                              cv2.BORDER_CONSTANT, value=(114, 114, 114))


def preprocess(img_path: str | Path) -> np.ndarray:
    bgr = cv2.imread(str(img_path))
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    padded = letterbox(rgb, IMGSZ)
    blob = padded.astype(np.float32) / 255.0
    return np.transpose(blob, (2, 0, 1))[np.newaxis]


def collect_calibration_images(n: int) -> list[Path]:
    img_dir = ROOT / "dataset" / "train" / "images"
    exts = {".jpg", ".jpeg", ".png", ".bmp"}
    all_imgs = sorted(p for p in img_dir.iterdir() if p.suffix.lower() in exts)
    return random.sample(all_imgs, min(n, len(all_imgs)))


class CalibrationReader:
    def __init__(self, image_paths: list[Path], input_name: str):
        self.paths = image_paths
        self.input_name = input_name
        self.idx = 0

    def get_next(self):
        if self.idx >= len(self.paths):
            return None
        blob = preprocess(self.paths[self.idx])
        self.idx += 1
        return {self.input_name: blob}

    def rewind(self):
        self.idx = 0


def find_detection_head_nodes(onnx_path: Path) -> list[str]:
    """Find nodes belonging to the detection head (model.22) to exclude from quantization."""
    model = onnx.load(str(onnx_path))
    excluded = []
    for node in model.graph.node:
        if node.name.startswith("/model.22/"):
            excluded.append(node.name)
    return excluded


def quantize_static(onnx_path: Path, calib_images: list[Path]) -> Path:
    from onnxruntime.quantization import (
        quantize_static,
        CalibrationMethod,
        QuantType,
        QuantFormat,
    )

    output_path = onnx_path.with_name(onnx_path.stem + "_int8.onnx")

    excluded_nodes = find_detection_head_nodes(onnx_path)
    print(f"  Input:  {onnx_path}")
    print(f"  Output: {output_path}")
    print(f"  Calibration images: {len(calib_images)}")
    print(f"  Excluded detection head nodes: {len(excluded_nodes)}")

    reader = CalibrationReader(calib_images, input_name="images")

    quantize_static(
        str(onnx_path),
        str(output_path),
        calibration_data_reader=reader,
        activation_type=QuantType.QUInt8,
        weight_type=QuantType.QInt8,
        calibrate_method=CalibrationMethod.Entropy,
        quant_format=QuantFormat.QDQ,
        per_channel=True,
        nodes_to_exclude=excluded_nodes,
        extra_options={"ActivationSymmetric": True},
    )
    print(f"  Done: {output_path}")
    return output_path


def validate(onnx_path: Path, test_images: list[Path], conf: float = 0.25) -> int:
    import onnxruntime as ort

    session = ort.InferenceSession(str(onnx_path))
    input_name = session.get_inputs()[0].name
    total_dets = 0

    for img_path in test_images:
        blob = preprocess(img_path)
        outputs = session.run(None, {input_name: blob})[0]

        # output shape: [1, 5, 8400] -> transpose to [8400, 5]
        preds = outputs[0].T
        scores = preds[:, 4]
        total_dets += int((scores > conf).sum())

    return total_dets


def main():
    random.seed(42)

    calib_images = collect_calibration_images(CALIB_COUNT)
    test_dir = ROOT / "dataset" / "test" / "images"
    exts = {".jpg", ".jpeg", ".png", ".bmp"}
    test_images = sorted(p for p in test_dir.iterdir() if p.suffix.lower() in exts)[:20]

    for onnx_path in MODELS_TO_QUANTIZE:
        if not onnx_path.exists():
            print(f"SKIP: {onnx_path} not found")
            continue

        print(f"\n{'='*50}")
        print(f"Quantizing: {onnx_path.parent.name}/{onnx_path.name}")

        # Validate FP32 baseline
        fp32_dets = validate(onnx_path, test_images)
        print(f"  FP32 detections (20 imgs): {fp32_dets}")

        # Quantize (backbone only, detection head kept in FP32)
        int8_path = quantize_static(onnx_path, calib_images)

        # Validate INT8
        int8_dets = validate(int8_path, test_images)
        print(f"  INT8 detections (20 imgs): {int8_dets}")
        print(f"  Detection retention: {int8_dets / max(fp32_dets, 1) * 100:.0f}%")

        # Compare file sizes
        fp32_size = onnx_path.stat().st_size / 1024 / 1024
        int8_size = int8_path.stat().st_size / 1024 / 1024
        print(f"  Size: FP32={fp32_size:.1f}MB, INT8={int8_size:.1f}MB ({int8_size/fp32_size*100:.0f}%)")


if __name__ == "__main__":
    main()
