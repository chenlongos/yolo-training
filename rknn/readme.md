# YOLOv8n 网球检测 → RKNN 转换（RK3588）

## 环境要求

- Windows + Docker Desktop（WSL2 后端）
- rknn-toolkit2 运行在 Docker 容器中（仅支持 Linux x86）

## 1. 拉取 Docker 镜像

```powershell
docker pull firesh/rknn-toolkit2:latest
```

## 2. 启动容器

```powershell
docker run --name rknn -v C:\Users\ajax\Desktop\ChenLong\tennis\tennis-train:/workspace -it firesh/rknn-toolkit2:latest bash
```

> 挂载项目根目录到容器 `/workspace`，转换产物在 Windows 资源管理器中可直接看到。

后续重新进入：

```powershell
docker start rknn
docker exec -it rknn bash
```

## 3. ONNX opset 降级（仅首次需要）

rknn-toolkit2 2.1.0 最高支持 opset 19，ultralytics 导出的模型默认 opset 20，需先降级：

```powershell
# Windows 本地执行
python -c "
import onnx
model = onnx.load('runs/detect/runs/tennis/train2/weights/best.onnx')
model.opset_import[0].version = 19
onnx.save(model, 'rknn/best_opset19.onnx')
print('Done')
"
```

## 4. 转换 RKNN

在容器内执行：

```bash
cd /workspace/rknn
python convert.py --onnx /workspace/rknn/best_opset19.onnx
```

可选参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--onnx` | `best_opset19.onnx` | ONNX 模型路径 |
| `--output` | `tennis.rknn` | 输出文件名 |
| `--target` | `rk3588` | 目标芯片 |
| `--calib_count` | `200` | 校准图片数量 |

输出：`rknn/tennis.rknn`

## 5. 模拟器测试

```bash
python test.py
```

指定模型或图片：

```bash
python test.py --model tennis.rknn --image /workspace/dataset/test/images/example.jpg
```

## 文件说明

```
rknn/
├── convert.py           # ONNX → RKNN 转换脚本
├── test.py              # 模拟器推理测试
├── requirements.txt     # Python 依赖
├── best_opset19.onnx    # opset 降级后的 ONNX 模型
└── tennis.rknn          # 转换产物（拷贝到 RK3588 板子部署）
```

## 部署到 RK3588

将 `tennis.rknn` 拷贝到板子，使用 `rknn-api`（C/C++）或 `rknn-toolkit-lite2`（Python）加载推理。注意：

- 模型输入已变为 **int8**（uint8 图片数据直接送入即可）
- 模型输出也已变为 **int8**，需要根据量化参数做反量化后才能得到正确的浮点坐标和置信度
