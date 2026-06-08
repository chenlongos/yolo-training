"""CVIModel conversion service — runs sophgo/tpuc_dev Docker container."""
import subprocess
import shutil
import threading
from pathlib import Path
from backend.store import db
from backend.services.storage_service import storage_service


DOCKER_IMAGE = "sophgo/tpuc_dev:latest"
TIMEOUT = 1800


def _run(cmd: list[str], timeout: int = TIMEOUT) -> tuple[int, str, str]:
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def _update_progress(model_id: str, progress: int, step: str, status: str = "running", error: str = ""):
    """Update conversion progress on the model record."""
    db["trained_models"].update(model_id, {
        "_cvimodel_status": status,
        "_cvimodel_progress": progress,
        "_cvimodel_step": step,
        "_cvimodel_error": error,
    })


def check_docker_status() -> dict:
    try:
        code, _, _ = _run(["docker", "info"], timeout=10)
        docker_ok = code == 0
    except Exception:
        docker_ok = False
    image_ok = False
    if docker_ok:
        try:
            _, out, _ = _run(["docker", "images", "-q", DOCKER_IMAGE], timeout=10)
            image_ok = bool(out.strip())
        except Exception:
            pass
    return {"docker_running": docker_ok, "image_ready": image_ok}


def get_conversion_status(model_id: str) -> dict:
    m = db["trained_models"].get(model_id)
    if not m:
        return {"status": "idle", "progress": 0, "step": ""}
    return {
        "status": m.get("_cvimodel_status", "idle"),
        "progress": m.get("_cvimodel_progress", 0),
        "step": m.get("_cvimodel_step", ""),
        "error": m.get("_cvimodel_error", ""),
    }


def start_cvimodel_conversion(model_id: str):
    """Start cvimodel conversion in a background thread."""
    thread = threading.Thread(target=_convert_impl, args=(model_id,), daemon=True)
    thread.start()


def _convert_impl(model_id: str):
    """Background conversion implementation."""
    try:
        _update_progress(model_id, 5, "检查 Docker 环境")

        status = check_docker_status()
        if not status["docker_running"]:
            raise RuntimeError("Docker 未运行，请启动 Docker Desktop")
        if not status["image_ready"]:
            raise RuntimeError(f"Docker 镜像 '{DOCKER_IMAGE}' 未找到，请先 docker pull")

        model = db["trained_models"].get(model_id)
        if not model:
            raise RuntimeError("模型未找到")

        model_name = model.get("name", "model").replace(" ", "_").replace("(", "").replace(")", "").strip()
        project_root = storage_service.storage_root.parent.resolve()
        work_dir = storage_service.storage_root / "tpu_convert" / model_id
        work_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: ONNX export
        _update_progress(model_id, 10, "导出 ONNX 模型")
        onnx_path = model.get("onnx_path")
        if not onnx_path or not Path(onnx_path).exists():
            from backend.services.model_service import export_model_to_onnx
            onnx_path = export_model_to_onnx(model_id)
            if not onnx_path:
                raise RuntimeError("ONNX 导出失败，请先导出 ONNX")
        onnx_path = Path(onnx_path)
        onnx_name = onnx_path.name
        shutil.copy2(onnx_path, work_dir / onnx_name)

        # Step 2: Prepare calibration images
        _update_progress(model_id, 20, "准备校准图片")
        dataset_id = model.get("dataset_id", "")
        calib_dir = work_dir / "calibration"
        calib_dir.mkdir(exist_ok=True)
        has_calib = False
        if dataset_id:
            images = [i for i in db["images"].filter(lambda i: i["dataset_id"] == dataset_id)
                      if i.get("status") == "annotated"]
            if not images:
                images = db["images"].filter(lambda i: i["dataset_id"] == dataset_id)
            count = 0
            for img in images[:100]:
                src = storage_service.backend._full_path(img["storage_path"])
                if src.exists():
                    shutil.copy2(src, calib_dir / f"{count:04d}.jpg")
                    count += 1
            has_calib = count > 0

        # Step 3: Build conversion script
        _update_progress(model_id, 25, "构建转换脚本")
        container_name = f"tpu-mlir-{model_id[:8]}"

        script = [
            "#!/bin/bash", "set -e",
            f"cd /workspace/storage/tpu_convert/{model_id}",
            "",
            "echo '---STEP:ONNX->MLIR---'",
            f"model_transform.py \\",
            f"  --model_name {model_name} --model_def {onnx_name} \\",
            "  --input_shapes [[1,3,640,640]] \\",
            "  --mean 0.0,0.0,0.0 --scale 0.0039216,0.0039216,0.0039216 \\",
            "  --keep_aspect_ratio --pixel_format rgb \\",
            f"  --mlir {model_name}.mlir",
            "",
        ]
        if has_calib:
            script += [
                "echo '---STEP:Calibration---'",
                f"run_calibration.py {model_name}.mlir \\",
                "  --dataset ./calibration --input_num 100 \\",
                f"  -o {model_name}_cali_table",
                "",
            ]
        deploy = [
            "echo '---STEP:Deploy---'",
            "model_deploy.py \\",
            f"  --mlir {model_name}.mlir --quantize INT8 \\",
        ]
        if has_calib:
            deploy.append(f"  --calibration_table {model_name}_cali_table \\")
        deploy += [
            "  --processor cv181x --tolerance 0.85,0.45 \\",
            "  --fuse_preprocess --customization_format RGB_PLANAR \\",
            f"  --model {model_name}.cvimodel",
            "",
            "echo '---DONE---'",
        ]
        script += deploy

        script_path = work_dir / "convert.sh"
        script_path.write_text("\n".join(script))
        script_path.chmod(0o755)

        # Step 4: Run Docker
        _update_progress(model_id, 30, "Docker 容器转换中 (ONNX→MLIR→cvimodel)")
        docker_cmd = [
            "docker", "run", "--rm", "--name", container_name,
            "-v", f"{project_root}:/workspace",
            DOCKER_IMAGE,
            "bash", f"/workspace/storage/tpu_convert/{model_id}/convert.sh",
        ]

        proc = subprocess.Popen(docker_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1)
        output_lines = []
        try:
            for line in proc.stdout:
                line = line.rstrip()
                output_lines.append(line)
                # Track step progress from Docker output markers
                if "---STEP:ONNX->MLIR---" in line:
                    _update_progress(model_id, 35, "ONNX → MLIR 转换中")
                elif "---STEP:Calibration---" in line:
                    _update_progress(model_id, 55, "生成校准表中")
                elif "---STEP:Deploy---" in line:
                    _update_progress(model_id, 75, "生成 cvimodel 中")
            proc.wait(timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            proc.kill()
            _run(["docker", "rm", "-f", container_name], timeout=10)
            raise RuntimeError("转换超时 (30 分钟)")
        finally:
            output_lines.append(f"EXIT: {proc.returncode}")

        if proc.returncode != 0:
            tail = "\n".join(output_lines[-30:])
            raise RuntimeError(f"Docker 转换失败:\n{tail}")

        # Step 5: Verify output
        _update_progress(model_id, 90, "验证输出文件")
        cvimodel_path = work_dir / f"{model_name}.cvimodel"
        if not cvimodel_path.exists():
            raise RuntimeError(f"cvimodel 文件未生成: {cvimodel_path}")

        cvimodel_str = str(cvimodel_path)
        db["trained_models"].update(model_id, {"cvimodel_path": cvimodel_str})

        # Create child model for download
        from backend.routes.models import _create_format_model
        _create_format_model(model, "cvimodel", "CVIModel", cvimodel_str)

        _update_progress(model_id, 100, "转换完成", status="completed")

    except Exception as e:
        _update_progress(model_id, 0, "", status="failed", error=str(e))
