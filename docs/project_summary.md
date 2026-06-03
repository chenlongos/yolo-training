# 网球检测模型训练与部署总结

> 项目目标：训练 YOLOv8n 检测网球，导出 INT8 cvimodel，部署到 SG2002 (cv181x) 追球小车

---

## 一、项目概览

| 项目 | 内容 |
|------|------|
| 模型架构 | YOLOv8n（nano，最轻量级） |
| 检测目标 | 网球（单类，class 0） |
| 训练轮次 | 100 epochs |
| 输入尺寸 | 640×640 |
| 目标芯片 | SG2002 (cv181x)，算力约 1TOPS |
| 最终产物 | `tpu_convert/yolov8n_tennis_cv181x_int8.cvimodel` |

---

## 二、环境配置

### 2.1 Python 环境

```
Python 3.14.3
PyTorch 2.11.0+cu128（支持 RTX 5060 Laptop, sm_120 Blackwell）
ultralytics 8.4.38
onnxruntime-gpu 1.24.4
```

虚拟环境位于项目根目录：
```
C:\Users\ajax\Desktop\ChenLong\tennis\tennis-train\.venv
```

激活方式：
```powershell
.\.venv\Scripts\activate
```

### 2.2 Docker 环境（用于 cvimodel 转换）

```
Docker Desktop 29.4.0 + WSL2 (Ubuntu 24.04)
镜像：sophgo/tpuc_dev:latest
容器名：tpu-mlir
tpu_mlir 版本：1.27（2026-02-06）
```

容器挂载：`C:\Users\ajax\Desktop\ChenLong\tennis\tennis-train` → `/workspace`

重新进入容器：
```powershell
docker start tpu-mlir
docker exec -it tpu-mlir bash
```

---

## 三、数据集

- **来源**：Roboflow（`bobo-an/tennis-ball-obj-det-7ojhd`）
- **规模**：共 12,237 张图片
- **划分**：
  - train：`dataset/train/images`
  - valid：`dataset/valid/images`
  - test：`dataset/test/images`
- **配置文件**：`configs/tennis_ball.yaml`

```yaml
path: dataset
train: train/images
val: valid/images
test: test/images
nc: 1
names: ['tennis ball']
```

注意：ultralytics 的 `DATASETS_DIR` 已通过环境变量设置为项目根目录，`path` 使用相对路径 `dataset`。

---

## 四、训练

### 4.1 训练命令

```powershell
python -m training_engine.train \
  --model yolov8n.pt \
  --data configs/tennis_ball.yaml \
  --epochs 100 \
  --imgsz 640 \
  --batch 16 \
  --project runs/detect/runs/tennis \
  --name train2
```

### 4.2 训练结果（train2）

| 指标 | 数值 |
|------|------|
| mAP50 | **87.6%** |
| mAP50-95 | — |
| Precision | **93.7%** |
| Recall | **85.8%** |

模型权重：`runs/detect/runs/tennis/train2/weights/best.pt`

---

## 五、ONNX 导出与量化

### 5.1 FP32 ONNX 导出

```powershell
python -m training_engine.train --export \
  --weights runs/detect/runs/tennis/train2/weights/best.pt
```

输出：`runs/detect/runs/tennis/train2/weights/best.onnx`（11.7 MB，opset 17）

### 5.2 INT8 静态量化

```powershell
python -m training_engine.quantize \
  --model runs/detect/runs/tennis/train2/weights/best.onnx \
  --calibration-data "dataset/valid/images" \
  --output runs/detect/runs/tennis/train2/weights/best_int8.onnx
```

输出：`runs/detect/runs/tennis/train2/weights/best_int8.onnx`（约 3 MB）
校准图片数：684 张

#### 修复的 Bug

| 问题 | 修复 |
|------|------|
| `calibration_method` 参数名错误 | 改为 `calibrate_method` |
| `weight_type=QInt8` 与 `activation_type` 不匹配 | 两者均设为 `QuantType.QUInt8` |
| `--calibration-data` 传目录时被 shell 拆分 | 加引号；代码内自动 glob 展开目录为文件列表 |

---

## 六、cvimodel 转换（tpu-mlir）

所有操作在 Docker 容器内执行，工作目录 `/workspace/tpu_convert`。

### Step 1：ONNX → MLIR

```bash
model_transform.py \
  --model_name yolov8n_tennis \
  --model_def ../runs/detect/runs/tennis/train2/weights/best.onnx \
  --input_shapes [[1,3,640,640]] \
  --mean 0.0,0.0,0.0 \
  --scale 0.0039216,0.0039216,0.0039216 \
  --keep_aspect_ratio \
  --pixel_format rgb \
  --mlir yolov8n_tennis.mlir
```

输出：`yolov8n_tennis.mlir`

### Step 2：生成校准表

```bash
run_calibration.py yolov8n_tennis.mlir \
  --dataset ../dataset/valid/images \
  --input_num 100 \
  -o yolov8n_cali_table
```

使用 100 张验证图片进行校准，auto-tune 约 48 秒。

### Step 3：MLIR → cvimodel

```bash
model_deploy.py \
  --mlir yolov8n_tennis.mlir \
  --quantize INT8 \
  --calibration_table yolov8n_cali_table \
  --processor cv181x \
  --tolerance 0.85,0.45 \
  --model yolov8n_tennis_cv181x_int8.cvimodel
```

**最终产物：`tpu_convert/yolov8n_tennis_cv181x_int8.cvimodel`** ✅

---

## 七、模型参数说明

| 参数 | 值 | 说明 |
|------|-----|------|
| 输入尺寸 | 640×640 | NCHW，RGB |
| 预处理 | `(x - 0) * 0.0039216` | 即 `x / 255.0` |
| letterbox | 启用 | 保持宽高比，居中 padding |
| 量化方式 | INT8 对称量化 | `asymmetric=False` |
| 输出张量 | `output0_Concat` | shape: `[1, 5, 8400]` |

---

## 八、部署到 SG2002

### 8.1 拷贝模型到板子

```powershell
# Windows 侧执行（需要板子可 SSH 访问）
scp "tpu_convert\yolov8n_tennis_cv181x_int8.cvimodel" root@<board-ip>:/root/
```

### 8.2 Python 推理（板子上）

```python
import numpy as np
import cv2
from cviruntime import CviModel

model = CviModel("/root/yolov8n_tennis_cv181x_int8.cvimodel")

# 读取并预处理图像
img = cv2.imread("test.jpg")
img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
img = cv2.resize(img, (640, 640))
inp = img.astype(np.float32) / 255.0
inp = inp.transpose(2, 0, 1)[np.newaxis, ...]  # [1,3,640,640]

# 推理
outputs = model.run({"images": inp})
# outputs["output0"]: shape [1, 5, 8400]
# 每列: [cx, cy, w, h, conf]  (已归一化)
```

### 8.3 后处理

```python
def postprocess(output, conf_thres=0.25, iou_thres=0.45, img_shape=(640, 640)):
    """output shape: [1, 5, 8400]"""
    pred = output[0].T  # [8400, 5]
    mask = pred[:, 4] > conf_thres
    pred = pred[mask]
    if len(pred) == 0:
        return []
    # cx,cy,w,h → x1,y1,x2,y2
    boxes = pred[:, :4].copy()
    boxes[:, 0] = pred[:, 0] - pred[:, 2] / 2
    boxes[:, 1] = pred[:, 1] - pred[:, 3] / 2
    boxes[:, 2] = pred[:, 0] + pred[:, 2] / 2
    boxes[:, 3] = pred[:, 1] + pred[:, 3] / 2
    confs = pred[:, 4]
    # NMS
    indices = cv2.dnn.NMSBoxes(
        boxes.tolist(), confs.tolist(), conf_thres, iou_thres
    )
    results = []
    for i in indices:
        results.append({
            "box": boxes[i].tolist(),
            "conf": float(confs[i])
        })
    return results
```

---

## 九、文件清单

```
tennis-train/
├── configs/
│   └── tennis_ball.yaml              # 数据集配置
├── dataset/                          # Roboflow 下载的数据集 (12237张)
│   ├── train/images/
│   ├── valid/images/
│   └── test/images/
├── docs/
│   ├── cvimodel_convert.md           # tpu-mlir 转换命令参考
│   └── project_summary.md            # 本文档
├── runs/detect/runs/tennis/train2/
│   └── weights/
│       ├── best.pt                   # PyTorch 权重
│       ├── best.onnx                 # FP32 ONNX (11.7 MB)
│       └── best_int8.onnx            # INT8 量化 ONNX (~3 MB)
├── training_engine/
│   ├── train.py                      # 训练脚本
│   ├── quantize.py                   # ONNX INT8 量化脚本
│   ├── adapter.py                    # 量化适配层
│   └── predict.py                    # 预测脚本
├── tpu_convert/
│   ├── yolov8n_tennis.mlir           # 中间 MLIR
│   ├── yolov8n_cali_table            # 校准表
│   └── yolov8n_tennis_cv181x_int8.cvimodel  # ✅ 最终部署文件
└── requirements.txt
```

---

## 十、后续优化建议

| 建议 | 说明 |
|------|------|
| 宽屏输入 | 小车追球场景更适合宽视野，下次训练可用 `--imgsz 640,320 --rect` |
| 提升训练速度 | 增大 batch size，加 `--cache ram` 解决数据加载瓶颈（GPU利用率仅73%） |
| 模型验证 | 在板子上用测试集图片跑推理，对比 PC 端精度，验证量化损失可接受 |
| 帧率测试 | cv181x 理论 INT8 推理约 100~200ms/帧，可实测并调整 conf_thres 平衡速度与精度 |
