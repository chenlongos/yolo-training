"""
端到端流程：训练 yolov8n -> 导出 ONNX -> INT8 量化

使用方法（虚拟环境激活后）：
    python scripts/run_pipeline.py [--epochs 100] [--device cpu] [--calibration-images 数量]

前提：
    数据集已放置到 dataset/ 目录（运行 scripts/download_dataset.py 获取）
"""
from __future__ import annotations

import argparse
import glob
import sys
from pathlib import Path

# 确保 src 包路径可找到（pip install -e . 后通常不需要）
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from training_engine.adapter import ModelAdapter


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Train YOLOv8n + INT8 quantize pipeline")
    p.add_argument("--model", default="yolov8n.pt")
    p.add_argument("--data", default="configs/tennis_ball.yaml")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--device", default="")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--project", default="runs/tennis")
    p.add_argument("--name", default="train")
    p.add_argument(
        "--calibration-images",
        type=int,
        default=100,
        help="用于静态量化的校准图片数量（从验证集取）",
    )
    p.add_argument(
        "--skip-train",
        action="store_true",
        help="跳过训练，直接对已有 best.pt 做量化",
    )
    p.add_argument("--weights", default="", help="已有权重路径（配合 --skip-train 使用）")
    return p


def find_best_weights(project: str, name: str) -> Path:
    pattern = f"{project}/{name}*/weights/best.pt"
    matches = sorted(glob.glob(pattern))
    if not matches:
        raise FileNotFoundError(f"找不到训练权重，pattern={pattern}")
    return Path(matches[-1])


def collect_calibration_images(data_yaml: str, n: int) -> list[str]:
    import yaml

    with open(data_yaml, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    dataset_root = Path(cfg.get("path", "."))
    val_images = dataset_root / cfg.get("val", "valid/images")
    if not val_images.exists():
        print(f"警告: 验证集路径不存在 {val_images}，将使用动态量化")
        return []

    imgs = list(val_images.glob("*.jpg")) + list(val_images.glob("*.png"))
    imgs = [str(p) for p in imgs[:n]]
    print(f"收集到 {len(imgs)} 张校准图片（来自 {val_images}）")
    return imgs


def main() -> None:
    args = build_parser().parse_args()

    # ── 1. 训练 ──────────────────────────────────────────────
    if args.skip_train:
        if args.weights:
            best_pt = Path(args.weights)
        else:
            best_pt = find_best_weights(args.project, args.name)
        print(f"跳过训练，使用已有权重: {best_pt}")
    else:
        data_path = Path(args.data)
        if not data_path.exists():
            sys.exit(
                f"数据集配置文件不存在: {data_path}\n"
                "请先运行: python scripts/download_dataset.py --api-key <YOUR_KEY>"
            )

        print("=" * 60)
        print(f"开始训练 {args.model}，共 {args.epochs} 个 epoch")
        print("=" * 60)
        adapter = ModelAdapter(args.model)
        adapter.train(
            data=str(data_path),
            epochs=args.epochs,
            imgsz=args.imgsz,
            batch=args.batch,
            device=args.device,
            project=args.project,
            name=args.name,
            workers=args.workers,
        )
        best_pt = find_best_weights(args.project, args.name)
        print(f"\n训练完成，最佳权重: {best_pt}")

    # ── 2. 量化 ──────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("开始 INT8 量化")
    print("=" * 60)

    calib_imgs = collect_calibration_images(args.data, args.calibration_images)

    quant_adapter = ModelAdapter(str(best_pt))
    if calib_imgs:
        quantized = quant_adapter.export_quantized(
            calibration_data=calib_imgs,
            calibration_method="minmax",
            int8=True,
        )
    else:
        quantized = quant_adapter.export_quantized(int8=True)

    print("\n" + "=" * 60)
    print(f"INT8 模型已保存: {quantized}")
    print("=" * 60)


if __name__ == "__main__":
    main()
