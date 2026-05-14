# YOLOv8n → cvimodel 转换指南（SG2002 / cv181x）

## 前提条件

- Windows 已安装 Docker Desktop + WSL2
- 训练完成，权重位于 `runs/detect/runs/tennis/train2/weights/best.pt`
- 已执行量化导出，ONNX 位于 `runs/detect/runs/tennis/train2/weights/best.onnx`

---

## 第一步：启动 Docker 环境

在 PowerShell 中执行：

```bash
# 拉取镜像（首次约几 GB）
docker pull sophgo/tpuc_dev:latest

# 启动容器，挂载项目目录
docker run --privileged --name tpu-mlir \
  -v /mnt/c/Users/ajax/Desktop/ChenLong/tennis/tennis-train:/workspace \
  -it sophgo/tpuc_dev:latest
```

> 注意：后续命令均在容器内执行

---

## 第二步：安装 tpu_mlir

```bash
pip install tpu_mlir
```

---

## 第三步：准备工作目录

```bash
cd /workspace
mkdir -p tpu_convert && cd tpu_convert

# 复制 ONNX 模型
cp runs/detect/runs/tennis/train2/weights/best.onnx .
```

---

## 第四步：ONNX → MLIR

```bash
model_transform.py \
  --model_name yolov8n_tennis \
  --model_def best.onnx \
  --input_shapes [[1,3,640,640]] \
  --mean 0.0,0.0,0.0 \
  --scale 0.0039216,0.0039216,0.0039216 \
  --keep_aspect_ratio \
  --pixel_format rgb \
  --mlir yolov8n_tennis.mlir
```

---

## 第五步：生成校准表（INT8 量化必须）

使用约 100 张真实网球图片进行校准：

```bash
run_calibration.py yolov8n_tennis.mlir \
  --dataset ../dataset/valid/images \
  --input_num 100 \
  -o yolov8n_cali_table
```

---

## 第六步：生成 INT8 cvimodel

```bash
model_deploy.py \
  --mlir yolov8n_tennis.mlir \
  --quantize INT8 \
  --calibration_table yolov8n_cali_table \
  --processor cv181x \
  --tolerance 0.85,0.45 \
  --model yolov8n_tennis_cv181x_int8.cvimodel
```

```
model_deploy.py --mlir yolov8n_tennis.mlir --quantize INT8 --calibration_table yolov8n_cali_table --quantize_table shape_pattern_qtable --processor cv181x --tolerance 0.85,0.45 --fuse_preprocess --customization_format RGB_PLANAR --model yolov8n_tennis_v2.cvimodel

```

转换完成后输出文件：`tpu_convert/yolov8n_tennis_cv181x_int8.cvimodel`

---

## 注意事项

- cv181x 算力约 1TOPS，YOLOv8n 在 640×640 输入下推理约 200-400ms
- 若需实时检测，可将输入分辨率降至 320×320（修改 `--input_shapes [[1,3,320,320]]`）
- 校准图片尽量使用真实网球场景图片，效果优于随机图片
- 生成的 `.cvimodel` 文件直接拷到 SG2002 板子上，使用 `cviruntime` 进行推理
