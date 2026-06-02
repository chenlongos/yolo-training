from __future__ import annotations

import argparse

from src.tennis_train.adapter import ModelAdapter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run tennis detector inference with YOLO26.")
    parser.add_argument("--model", required=True, help="Trained model weights path.")
    parser.add_argument("--source", required=True, help="Image, video, folder, webcam, or stream.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold.")
    parser.add_argument("--device", default="", help="Device string, e.g. cpu, 0.")
    parser.add_argument("--save", action="store_true", help="Save visualized predictions.")
    parser.add_argument("--project", default="runs/tennis", help="Output root directory.")
    parser.add_argument("--name", default="predict", help="Run name.")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    adapter = ModelAdapter(args.model)
    results = adapter.predict(
        source=args.source,
        conf=args.conf,
        save=args.save,
        project=args.project,
        name=args.name,
        device=args.device,
    )
    print(results)


if __name__ == "__main__":
    main()
