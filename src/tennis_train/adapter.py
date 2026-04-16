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


@dataclass
class ModelAdapter:
    model_path: str

    def __post_init__(self) -> None:
        yolo_cls = _resolve_yolo_class()
        self.model = yolo_cls(self.model_path)

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
    ) -> Any:
        return self.model.train(
            data=data,
            epochs=epochs,
            imgsz=imgsz,
            batch=batch,
            device=device,
            project=project,
            name=name,
            workers=workers,
        )

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
        }
        if project:
            kwargs["project"] = project
        if name:
            kwargs["name"] = name
        if device:
            kwargs["device"] = device
        return self.model.predict(**kwargs)

    def validate(self, *, data: str, imgsz: int, batch: int, device: str) -> Any:
        return self.model.val(
            data=data,
            imgsz=imgsz,
            batch=batch,
            device=device,
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
            weight_type=QuantType.QUInt8,
            calibration_method=cal_method,
        )
        print(f"静态量化完成: {output_path}")
