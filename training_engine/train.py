from __future__ import annotations

import argparse
from pathlib import Path

from .adapter import ModelAdapter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train a tennis detector with YOLO26.")
    parser.add_argument("--model", default="yolov8n.pt", help="Pretrained model or config path.")
    parser.add_argument(
        "--data",
        default="configs/tennis_ball.yaml",
        help="Dataset yaml path.",
    )
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs.")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image size.")
    parser.add_argument("--batch", type=int, default=16, help="Batch size.")
    parser.add_argument("--device", default="", help="Device string, e.g. cpu, 0, 0,1.")
    parser.add_argument("--workers", type=int, default=8, help="Dataloader workers.")
    parser.add_argument("--project", default="runs/tennis", help="Output root directory.")
    parser.add_argument("--name", default="train", help="Run name.")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Skip training and only run validation.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    data_path = Path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset config not found: {data_path}")

    adapter = ModelAdapter(args.model)

    if args.validate_only:
        results = adapter.validate(
            data=str(data_path),
            imgsz=args.imgsz,
            batch=args.batch,
            device=args.device,
        )
        print(results)
        return

    results = adapter.train(
        data=str(data_path),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=args.project,
        name=args.name,
        workers=args.workers,
    )
    print(results)


if __name__ == "__main__":
    main()
