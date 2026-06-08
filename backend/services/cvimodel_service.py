"""CVIModel conversion guide generator — provides model-specific Docker instructions."""
from pathlib import Path
from backend.store import db
from backend.services.storage_service import storage_service


def generate_cvimodel_guide(model_id: str) -> dict:
    """Generate a conversion guide with model-specific paths filled in."""
    model = db["trained_models"].get(model_id)
    if not model:
        return {"error": "Model not found"}

    model_name = model.get("name", "model").replace(" ", "_")
    project_root = storage_service.storage_root.parent.resolve()
    work_dir = storage_service.storage_root / "tpu_convert" / model_id

    # Find or generate ONNX path hint
    onnx_path = model.get("onnx_path")
    onnx_filename = f"{model_name}.onnx"
    if onnx_path:
        onnx_filename = Path(onnx_path).name

    # Check Docker status
    import subprocess
    docker_ok = False
    image_ok = False
    try:
        p = subprocess.run(["docker", "info"], capture_output=True, timeout=10)
        docker_ok = p.returncode == 0
        if docker_ok:
            p2 = subprocess.run(["docker", "images", "-q", "sophgo/tpuc_dev:latest"],
                                capture_output=True, text=True, timeout=10)
            image_ok = bool(p2.stdout.strip())
    except Exception:
        pass

    guide = {
        "format": "cvimodel",
        "model_name": model_name,
        "project_root": str(project_root),
        "work_dir": str(work_dir),
        "docker_ok": docker_ok,
        "image_ok": image_ok,
        "steps": [
            {
                "title": "第一步：导出 ONNX",
                "desc": "先在模型转换中导出 ONNX 格式",
                "commands": None,
                "note": "点击上方「ONNX (FP32)」的「转换」按钮即可" if not onnx_path else None,
            },
            {
                "title": "第二步：启动 Docker",
                "desc": "在终端中执行以下命令",
                "commands": [
                    "# 拉取镜像（首次需要，约几 GB）",
                    "docker pull sophgo/tpuc_dev:latest",
                    "",
                    f"# 启动容器，挂载项目目录",
                    f"docker run --privileged --name tpu-mlir \\",
                    f"  -v {project_root}:/workspace \\",
                    f"  -it sophgo/tpuc_dev:latest",
                ],
                "note": "后续命令均在容器内执行",
            },
            {
                "title": "第三步：安装 tpu_mlir",
                "desc": "在容器内执行",
                "commands": [
                    "pip install tpu_mlir",
                ],
            },
            {
                "title": "第四步：准备工作目录",
                "desc": "在容器内执行",
                "commands": [
                    "cd /workspace",
                    f"mkdir -p tpu_convert/{model_id} && cd tpu_convert/{model_id}",
                    "",
                    f"# 复制 ONNX 模型（如已导出到 storage/models 下）",
                    f"cp $(find /workspace/storage -name '{onnx_filename}' | head -1) .",
                ],
            },
            {
                "title": "第五步：ONNX → MLIR",
                "desc": "在容器内执行",
                "commands": [
                    "model_transform.py \\",
                    f"  --model_name {model_name} \\",
                    f"  --model_def {onnx_filename} \\",
                    "  --input_shapes [[1,3,640,640]] \\",
                    "  --mean 0.0,0.0,0.0 \\",
                    "  --scale 0.0039216,0.0039216,0.0039216 \\",
                    "  --keep_aspect_ratio \\",
                    "  --pixel_format rgb \\",
                    f"  --mlir {model_name}.mlir",
                ],
            },
            {
                "title": "第六步：生成校准表",
                "desc": "使用已标注图片进行校准（约 100 张）",
                "commands": [
                    f"run_calibration.py {model_name}.mlir \\",
                    "  --dataset /workspace/storage/tpu_convert/calibration \\",
                    "  --input_num 100 \\",
                    f"  -o {model_name}_cali_table",
                ],
                "note": "校准图片需手动准备，放入 storage/tpu_convert/calibration/ 目录",
            },
            {
                "title": "第七步：生成 cvimodel",
                "desc": "在容器内执行",
                "commands": [
                    "model_deploy.py \\",
                    f"  --mlir {model_name}.mlir \\",
                    "  --quantize INT8 \\",
                    f"  --calibration_table {model_name}_cali_table \\",
                    "  --processor cv181x \\",
                    "  --tolerance 0.85,0.45 \\",
                    "  --fuse_preprocess \\",
                    "  --customization_format RGB_PLANAR \\",
                    f"  --model {model_name}.cvimodel",
                ],
                "note": f"输出文件：tpu_convert/{model_id}/{model_name}.cvimodel",
            },
        ],
    }
    return guide
