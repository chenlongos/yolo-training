from __future__ import annotations

import argparse
from pathlib import Path

from .adapter import ModelAdapter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export and quantize YOLO26 model to ONNX.")
    parser.add_argument("--model", required=True, help="Model weights path.")
    parser.add_argument(
        "--calibration-data",
        nargs="+",
        help="Paths to calibration images for static quantization.",
    )
    parser.add_argument(
        "--calibration-method",
        default="minmax",
        choices=["minmax", "entropy"],
        help="Calibration method for static quantization.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    adapter = ModelAdapter(str(model_path))

    if args.calibration_data:
        print(f"使用 {len(args.calibration_data)} 张图片进行静态量化...")
        quantized_path = adapter.export_quantized(
            calibration_data=args.calibration_data,
            calibration_method=args.calibration_method,
            int8=True,
        )
    else:
        print("使用动态量化（无需校准数据）...")
        quantized_path = adapter.export_quantized(int8=True)

    print(f"量化完成: {quantized_path}")


if __name__ == "__main__":
    main()
