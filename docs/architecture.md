# Tennis-Train 系统架构文档

## 1. 项目概述

Tennis-Train 是一个端到端的网球检测系统，基于 YOLOv8n 训练网球检测模型，并部署到 SG2002 (cv181x) 边缘设备上，用于网球机器车的实时追踪。

## 2. 系统架构

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐
│ 数据准备     │ -> │ 模型训练      │ -> │ 量化导出      │ -> │ TPU部署        │
│ Roboflow    │    │ YOLOv8n      │    │ ONNX INT8    │    │ SG2002 板端    │
│ 12,237 张图  │    │ mAP50: 87.6% │    │ ~3MB         │    │ 200-400ms/帧   │
└─────────────┘    └──────────────┘    └──────────────┘    └───────────────┘
```

## 3. 模块说明

| 模块 | 路径 | 职责 |
|------|------|------|
| ModelAdapter | training_engine/adapter.py | 统一训练/推理/量化接口，自动选择 yolo26 或 ultralytics 后端 |
| 训练器 | training_engine/train.py | CLI 训练入口，支持 epochs/batch/device 等参数 |
| 量化器 | training_engine/quantize.py | FP32 ONNX 导出 + 动态/静态 INT8 量化 |
| 流水线 | scripts/run_pipeline.py | 端到端自动化：训练 → 导出 → 量化 |
| 板端推理 | board/detector_yolov8n_fused_preprocess.cpp | C++ 实现：letterbox预处理 + YOLO后处理 + NMS + 可视化 |

## 4. 技术栈

- **训练**: Python 3.14 + PyTorch 2.11 + ultralytics
- **量化**: ONNX Runtime (动态/静态量化，MinMax/Entropy校准)
- **TPU转换**: Docker + sophgo/tpu_dev + tpu_mlir (ONNX → MLIR → cvimodel)
- **部署**: C++ + OpenCV + cviruntime，RISC-V 交叉编译
- **硬件**: SG2002 (cv181x, ~1 TOPS)

## 5. 部署流程

1. `python scripts/run_pipeline.py` 完成训练和量化
2. Docker 中使用 `model_transform.py` 将 ONNX 转 MLIR
3. `run_calibration.py` 生成 INT8 校准表（100张验证集图片）
4. `model_deploy.py` 生成 `yolov8n_tennis_cv181x_int8.cvimodel`
5. 板端 C++ 程序加载 cvimodel 进行实时推理
