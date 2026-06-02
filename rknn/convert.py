"""Convert YOLOv8n tennis ONNX model to RKNN for RK3588.

Splits the ONNX output [1,5,8400] into boxes [1,4,8400] and scores [1,1,8400]
so each output gets its own quantization scale. This prevents the coordinate
range (0-640) from destroying the score channel (0-1) during INT8 quantization.
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import onnx
from onnx import helper, TensorProto
from rknn.api import RKNN

ROOT = Path(__file__).resolve().parent.parent
CALIB_DIR = ROOT / "dataset" / "valid" / "images"
OUTPUT_DIR = Path(__file__).resolve().parent
CALIB_COUNT = 200


def build_calibration_list(calib_dir: Path, count: int) -> list[str]:
    exts = {".jpg", ".jpeg", ".png", ".bmp"}
    imgs = sorted(p for p in calib_dir.iterdir() if p.suffix.lower() in exts)
    if not imgs:
        raise FileNotFoundError(f"No images found in {calib_dir}")
    selected = random.sample(imgs, min(count, len(imgs)))
    return [str(p) for p in selected]


def split_onnx_output(onnx_path: str, output_path: str) -> str:
    """Split YOLOv8 output [1,5,8400] into boxes [1,4,8400] + scores [1,1,8400]."""
    model = onnx.load(onnx_path)

    # Get original output
    orig_output = model.graph.output[0]
    orig_name = orig_output.name
    orig_shape = [d.dim_value for d in orig_output.type.tensor_type.shape.dim]
    print(f"Original output: {orig_name}, shape={orig_shape}")

    # Add split sizes as a constant input (opset 13+ style)
    split_const = helper.make_tensor("split_sizes", TensorProto.INT64, [2], [4, 1])
    model.graph.initializer.append(split_const)

    split_node = helper.make_node(
        "Split",
        inputs=[orig_name, "split_sizes"],
        outputs=["boxes_raw", "scores_raw"],
        axis=1,
    )
    model.graph.node.append(split_node)

    # Remove original output, add two new outputs
    while model.graph.output:
        model.graph.output.pop()

    boxes_out = helper.make_tensor_value_info("boxes_raw", TensorProto.FLOAT, [1, 4, 8400])
    scores_out = helper.make_tensor_value_info("scores_raw", TensorProto.FLOAT, [1, 1, 8400])
    model.graph.output.append(boxes_out)
    model.graph.output.append(scores_out)

    onnx.save(model, output_path)
    print(f"Split model saved to {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Convert ONNX to RKNN for RK3588")
    parser.add_argument("--onnx", type=str, default="best_opset19.onnx", help="ONNX model path")
    parser.add_argument("--output", type=str, default="tennis.rknn", help="Output RKNN filename")
    parser.add_argument("--target", type=str, default="rk3588", help="Target platform")
    parser.add_argument("--calib_count", type=int, default=CALIB_COUNT, help="Number of calibration images")
    parser.add_argument("--no-quant", action="store_true", help="Disable quantization (FP16)")
    args = parser.parse_args()

    onnx_path = OUTPUT_DIR / args.onnx
    if not onnx_path.exists():
        print(f"ONNX not found: {onnx_path}")
        return

    # Step 1: Split ONNX output for proper per-tensor quantization
    if not args.no_quant:
        split_path = OUTPUT_DIR / "best_split.onnx"
        split_onnx_output(str(onnx_path), str(split_path))
        model_to_load = str(split_path)
    else:
        model_to_load = str(onnx_path)

    rknn = RKNN()

    # Config
    rknn.config(
        mean_values=[[0, 0, 0]],
        std_values=[[255, 255, 255]],
        target_platform=args.target,
        quantized_algorithm="normal",
        single_core_mode=False,
        model_pruning=False,
    )

    # Load ONNX
    print(f"Loading ONNX: {model_to_load}")
    ret = rknn.load_onnx(model=model_to_load)
    if ret != 0:
        print(f"Load ONNX failed: {ret}")
        return
    print("ONNX loaded successfully.")

    # Build calibration dataset
    calib_list = build_calibration_list(CALIB_DIR, args.calib_count)
    calib_txt = OUTPUT_DIR / "calibration_list.txt"
    with open(calib_txt, "w") as f:
        for img in calib_list:
            f.write(img + "\n")
    print(f"Calibration: {len(calib_list)} images")

    # Build
    do_quant = not args.no_quant
    quant_str = "INT8" if do_quant else "FP16 (no quantization)"
    print(f"Building RKNN model ({quant_str})...")
    ret = rknn.build(
        do_quantization=do_quant,
        dataset=str(calib_txt) if do_quant else None,
    )
    if ret != 0:
        print(f"Build failed: {ret}")
        return
    print("Build successful.")

    # Save
    output_path = OUTPUT_DIR / args.output
    ret = rknn.export_rknn(str(output_path))
    if ret != 0:
        print(f"Save failed: {ret}")
        return
    print(f"RKNN model saved to {output_path}")
    print(f"File size: {output_path.stat().st_size / 1024 / 1024:.1f} MB")

    rknn.release()
    print("Done.")


if __name__ == "__main__":
    main()
