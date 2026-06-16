from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _resolve_yolo_class() -> type:
    try:
        from yolo26 import YOLO as YOLOClass  # type: ignore

        return YOLOClass
    except ImportError:
        pass

    try:
        from ultralytics import YOLO as YOLOClass

        return YOLOClass
    except ImportError as exc:
        raise RuntimeError(
            "Neither 'yolo26' nor 'ultralytics' is installed. "
            "Install your YOLO26 package or run 'pip install -r requirements.txt'."
        ) from exc


def _resolve_device(device: str) -> str:
    """Auto-detect best available device: MPS > CUDA > CPU.
    Treats '', 'auto', '0' as auto-detect. Explicit values like 'cpu', 'mps', 'cuda:1' pass through."""
    if device and device not in ("", "auto", "0"):
        return device
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "0"
    except ImportError:
        pass
    return "cpu"


def _resolve_model_path(model_path: str) -> str:
    """Resolve model path — store pretrained models under storage/models/."""
    from pathlib import Path as P
    # If it's already an absolute path that exists, use it directly
    p = P(model_path)
    if p.is_absolute() and p.exists():
        return str(p)

    # Try storage/models/ first (for previously downloaded models)
    storage_root = P(__file__).resolve().parent.parent / "storage"
    models_dir = storage_root / "models" / "pretrained"
    models_dir.mkdir(parents=True, exist_ok=True)

    # Check if model exists in storage
    local = models_dir / p.name if not p.is_absolute() else p
    if local.exists():
        return str(local)

    # Check current directory
    if p.exists():
        import shutil
        shutil.copy2(str(p), str(local))
        return str(local)

    # Let ultralytics download it — but specify the download dir via env
    import os
    os.environ["YOLO_CONFIG_DIR"] = str(models_dir.parent)
    # Fallback: just pass the name, ultralytics downloads to cwd
    # We'll move it after __post_init__
    return model_path


@dataclass
class ModelAdapter:
    model_path: str

    def __post_init__(self) -> None:
        yolo_cls = _resolve_yolo_class()
        resolved = _resolve_model_path(self.model_path)
        self.model = yolo_cls(resolved)
        # Move downloaded pretrained model to storage if it landed in cwd
        self._stash_pretrained()

    def _stash_pretrained(self) -> None:
        """Move pretrained .pt files from cwd to storage/models/pretrained/."""
        from pathlib import Path as P
        from shutil import move
        storage_root = P(__file__).resolve().parent.parent / "storage"
        pretrained_dir = storage_root / "models" / "pretrained"
        pretrained_dir.mkdir(parents=True, exist_ok=True)

        # Check common pretrained model names
        for f in P(".").glob("yolov*.pt"):
            dest = pretrained_dir / f.name
            if not dest.exists():
                try:
                    move(str(f), str(dest))
                except Exception:
                    pass

    def train(
        self,
        *,
        data: str,
        epochs: int,
        imgsz: int,
        batch: int,
        device: str,
        project: str,
        name: str,
        workers: int,
        single_cls: bool = False,
        callbacks: dict | None = None,
    ) -> Any:
        device = _resolve_device(device)
        kwargs: dict[str, Any] = dict(
            data=data, epochs=epochs, imgsz=imgsz, batch=batch,
            device=device, project=project, name=name, workers=workers,
            plots=False, single_cls=single_cls,
        )
        # Register callbacks via model.add_callback(), then remove 'callbacks'
        # from model.overrides — ultralytics' train() merges self.overrides into
        # args and passes them through cfg validation, which rejects 'callbacks'.
        if callbacks:
            for event, fn in callbacks.items():
                self.model.add_callback(event, fn)
        if hasattr(self.model, 'overrides') and 'callbacks' in self.model.overrides:
            del self.model.overrides['callbacks']
        result = self.model.train(**kwargs)
        self._clean_train_artifacts(project, name)
        return result

    def _clean_train_artifacts(self, project: str, name: str) -> None:
        """Remove ultralytics' per-epoch visualization artifacts and last.pt.

        Kept:  best.pt, args.yaml, results.csv
        Removed: last.pt, train_batch*.jpg, val_batch*.jpg, results.png,
                 *_curve.png, confusion_matrix*.png
        """
        from pathlib import Path

        run_dir = Path(project) / name
        if not run_dir.is_dir():
            return

        # last.pt duplicates best.pt; we only ship best.pt downstream.
        last = run_dir / "weights" / "last.pt"
        if last.is_file():
            last.unlink()
            print(f"  removed: {last.relative_to(run_dir.parent.parent) if run_dir.parent.parent in last.parents else last}")

        # Belt-and-braces: strip any visualization files that escaped
        # `plots=False` (older ultralytics, or a user who overrode it).
        patterns = [
            "train_batch*.jpg", "val_batch*.jpg",
            "results.png",
            "*_curve.png",
            "confusion_matrix*.png",
        ]
        for pat in patterns:
            for f in run_dir.glob(pat):
                if f.is_file():
                    f.unlink()
                    print(f"  removed: {f.name}")

    def predict(
        self,
        *,
        source: str,
        conf: float,
        save: bool,
        project: str | None = None,
        name: str | None = None,
        device: str = "",
    ) -> Any:
        kwargs: dict[str, Any] = {
            "source": source,
            "conf": conf,
            "save": save,
            "device": _resolve_device(device),
        }
        if project:
            kwargs["project"] = project
        if name:
            kwargs["name"] = name
        return self.model.predict(**kwargs)

    def validate(self, *, data: str, imgsz: int, batch: int, device: str) -> Any:
        return self.model.val(
            data=data,
            imgsz=imgsz,
            batch=batch,
            device=_resolve_device(device),
        )

    def export(self, *, format_name: str = "onnx", **kwargs) -> Any:
        return self.model.export(format=format_name, **kwargs)

    def export_quantized(
        self,
        *,
        calibration_data: list[str] | None = None,
        calibration_method: str = "minmax",
        int8: bool = True,
    ) -> str:
        """
        导出并量化 ONNX 模型。

        Args:
            calibration_data: 校准数据图片路径列表（静态量化用）
            calibration_method: 校准方法，"minmax" 或 "entropy"
            int8: 是否使用 int8 量化

        Returns:
            量化后模型路径
        """
        from pathlib import Path

        # 导出 FP32 ONNX
        save_path = self.model.export(format="onnx")
        onnx_path = Path(save_path) if isinstance(save_path, str) else Path("best.onnx")

        if calibration_data:
            # 静态量化（需要校准数据）
            self._quantize_static(onnx_path, calibration_data, calibration_method, int8)
        else:
            # 动态量化（无需校准数据）
            self._quantize_dynamic(onnx_path, int8)

        quantized_path = onnx_path.with_name(onnx_path.stem + "_int8.onnx")
        return str(quantized_path)

    def _quantize_dynamic(self, onnx_path: Path, int8: bool) -> None:
        """动态量化"""
        from onnxruntime.quantization import quantize_dynamic, QuantType

        output_path = onnx_path.with_name(onnx_path.stem + "_int8.onnx")
        # QInt8 需要特定硬件支持，QUInt8 兼容性更好
        weight_type = QuantType.QUInt8

        quantize_dynamic(
            str(onnx_path),
            str(output_path),
            weight_type=weight_type,
        )
        print(f"动态量化完成: {output_path}")

    def _quantize_static(
        self,
        onnx_path: Path,
        calibration_data: list[str],
        calibration_method: str,
        int8: bool,
    ) -> None:
        """静态量化（需校准数据）"""
        import numpy as np
        from onnxruntime.quantization import (
            quantize_static,
            CalibrationMethod,
            CalibrationDataReader,
            QuantType,
        )
        from PIL import Image

        class YOLODataReader(CalibrationDataReader):
            def __init__(self, image_paths: list[str], input_name: str):
                self.image_paths = image_paths
                self.input_name = input_name
                self.enum_data = None

            def get_next(self):
                if self.enum_data is None:
                    self.enum_data = self._generate_frames()
                return next(self.enum_data, None)

            def _generate_frames(self):
                for img_path in self.image_paths:
                    img = Image.open(img_path).convert("RGB").resize((640, 640))
                    arr = np.array(img).astype(np.float32) / 255.0
                    arr = np.transpose(arr, (2, 0, 1))
                    arr = np.expand_dims(arr, axis=0)
                    yield {self.input_name: arr}

        cal_method = (
            CalibrationMethod.MinMax
            if calibration_method == "minmax"
            else CalibrationMethod.Entropy
        )

        data_reader = YOLODataReader(calibration_data, input_name="images")
        output_path = onnx_path.with_name(onnx_path.stem + "_int8.onnx")

        quantize_static(
            str(onnx_path),
            str(output_path),
            calibration_data_reader=data_reader,
            activation_type=QuantType.QUInt8,
            weight_type=QuantType.QUInt8,
            calibrate_method=cal_method,
        )
        print(f"静态量化完成: {output_path}")
