"""
从 Roboflow 下载网球检测数据集。

使用方法：
    python scripts/download_dataset.py --api-key <YOUR_KEY>

如何获取 API Key：
    1. 注册 https://roboflow.com
    2. 进入 Settings -> Roboflow API -> Private API Key
    3. 复制后传入 --api-key 参数
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

WORKSPACE = "bobo-an"
PROJECT = "tennis-ball-obj-det-7ojhd"
VERSION = 1
FORMAT = "yolov8"
DEST = Path("dataset")


def ensure_roboflow() -> None:
    try:
        import roboflow  # noqa: F401
    except ImportError:
        print("安装 roboflow 包...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "roboflow", "-q"]
        )


def download(api_key: str) -> Path:
    from roboflow import Roboflow  # type: ignore

    rf = Roboflow(api_key=api_key)
    project = rf.workspace(WORKSPACE).project(PROJECT)
    dataset = project.version(VERSION).download(FORMAT, location=str(DEST))
    return Path(dataset.location)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", required=True, help="Roboflow API Key")
    args = parser.parse_args()

    ensure_roboflow()
    location = download(args.api_key)
    print(f"\n数据集已下载到: {location}")
    print("请确认 configs/tennis_ball.yaml 中的 path 与以上路径一致。")


if __name__ == "__main__":
    main()
