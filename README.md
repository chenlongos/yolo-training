# Tennis Train

一个用于网球目标检测的最小项目脚手架，默认按 YOLO 风格工作流组织：

- 训练入口：`python -m tennis_train.train`
- 推理入口：`python -m tennis_train.predict`
- 数据集配置：`configs/tennis.yaml`

这个项目对模型实现做了一层适配：

- 优先尝试导入 `yolo26`
- 如果环境里没有 `yolo26`，回退到 `ultralytics`

这样你后续只需要准备好对应权重文件和数据集，就可以直接训练或推理。

## 1. 安装依赖

```bash
pip install -r requirements.txt
```

如果你实际使用的是自定义 `yolo26` 包，请把它安装到当前 Python 环境。

## 2. 当前数据集

项目已经接入你放进来的数据集：

```text
dataset/Tennis Ball Obj Det.v1i.yolo26/
  train/
  valid/
  test/
```

默认使用的配置是 `configs/tennis.yaml`，类别只有一个：

- `tennis_ball`

## 4. 开始训练

安装包（只需一次）：
```bash
pip install -e .
```

GPU/MPS 训练（Apple Silicon Mac）：
```bash
python -m tennis_train.train --model yolov8n.pt --data configs/tennis.yaml --epochs 100 --device mps
```

GPU 训练（NVIDIA CUDA）：
```bash
python -m tennis_train.train --model yolov8n.pt --data configs/tennis.yaml --epochs 100 --device 0
```

CPU 训练：
```bash
python -m tennis_train.train --model yolov8n.pt --data configs/tennis.yaml --epochs 100 --device cpu
```

常用参数：
- `--batch 32` - 增大批量大小
- `--imgsz 1280` - 使用更高分辨率
- `--epochs 5` - 快速验证流程

你的数据集规模当前大致是：

- train: 11268 张
- val: 684 张
- test: 285 张

## 5. 运行推理

```bash
python -m tennis_train.predict \
  --model runs/tennis/train/weights/best.pt \
  --source demo.jpg \
  --conf 0.25 \
  --save
```

## 6. 常见调整

- 想先快速验证流程：把 `--epochs` 改成 `5`
- 显存不足：把 `--batch` 改小，比如 `8` 或 `4`
- 只想验数据能不能跑通：加 `--validate-only`
- 想导出模型：后续可以在 `ModelAdapter.export()` 基础上继续扩展
- 想继续训练（resume）：`--resume` 参数

## 7. 训练管理

查看训练进度：
```bash
ls runs/detect/
```

查看当前训练的实时输出：
```bash
tail -f runs/detect/runs/tennis/train2/*.log
```

停止正在运行的训练：
```bash
# 方法1：在另一个终端执行
pkill -f "tennis_train.train"

# 方法2：强制终止
pkill -9 -f "tennis_train.train"
```

查看已保存的模型：
```bash
ls runs/detect/runs/tennis/train*/weights/
```

查看训练效果（指标）：
```bash
cat runs/detect/runs/tennis/train/results.csv | tail -5
```

各指标含义：
- `mAP50` - 平均精度（IoU=0.5），越高越好，接近100%为优
- `mAP50-95` - 多IoU阈值下的平均精度，更严格
- `Precision` - 精确率，预测的框有多准
- `Recall` - 召回率，能找出多少实际目标
