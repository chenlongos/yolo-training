from __future__ import annotations

import cv2

from src.tennis_train.adapter import ModelAdapter


def run_camera(
    model_path: str,
    camera_id: int = 0,
    conf: float = 0.25,
    device: str = "cpu",
) -> None:
    adapter = ModelAdapter(model_path)

    cap = cv2.VideoCapture(camera_id)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera {camera_id}")

    print(f"Camera {camera_id} opened. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame")
            break

        # Run inference
        results = adapter.predict(
            source=frame,
            conf=conf,
            save=False,
            device=device,
        )

        # Draw results on frame
        annotated = results[0].plot() if results else frame

        cv2.imshow("YOLO26.int8 Camera Inference", annotated)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("Camera inference stopped.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run YOLO26 int8 inference on camera.")
    parser.add_argument(
        "--model",
        default="runs/detect/runs/tennis/train/weights/best_int8.onnx",
        help="Model path.",
    )
    parser.add_argument("--camera", type=int, default=0, help="Camera device ID.")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold.")
    parser.add_argument("--device", default="cpu", help="Device (cpu, 0, etc).")
    args = parser.parse_args()

    run_camera(args.model, args.camera, args.conf, args.device)