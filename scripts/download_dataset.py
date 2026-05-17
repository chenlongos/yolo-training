"""
从 HuggingFace 下载网球检测数据集。

使用方法：
    python scripts/download_dataset.py

数据集：https://huggingface.co/datasets/bobodai/tennis
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

DEST = Path(__file__).parent.parent / "dataset"
REPO_ID = "bobodai/tennis"


def ensure_huggingface_hub() -> None:
    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        print("安装 huggingface_hub 包...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "huggingface_hub", "-q"]
        )


def download() -> Path:
    from huggingface_hub import snapshot_download

    print(f"从 HuggingFace 下载数据集: {REPO_ID}")
    location = snapshot_download(
        repo_id=REPO_ID,
        repo_type="dataset",
        local_dir=str(DEST),
        local_dir_use_symlinks=False,
    )
    return Path(location)


def main() -> None:
    ensure_huggingface_hub()
    location = download()
    print(f"\n数据集已下载到: {location}")
    print("请确认 configs/tennis_ball.yaml 中的 path 与以上路径一致。")


if __name__ == "__main__":
    main()
