#!/usr/bin/env python3
"""部署时下载并校验 rembg 的 U-2-Net 系列模型（仅标准库）。

用法：
  python3 download-rembg-models.py --dest /opt/douyu-rembg/models [--models u2net,u2netp,silueta]
      [--base-url https://github.com/danielgatis/rembg/releases/download/v0.0.0]
      [--from-dir /path/to/已离线拷贝的模型]

校验值来自 backend/cutout-sidecar/models.sha256（与 rembg 内置 MD5 一致的官方 v0.0.0 发布文件）。
先写入同目录临时文件，SHA-256 匹配后再原子改名；已存在且校验通过的文件不重复下载。
只允许 Apache-2.0 的 u2net / u2netp / silueta，不下载 rembg 默认的 bria-rmbg（CC BY-NC）。
"""
import argparse
import hashlib
import os
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path

ALLOWED = ("u2net", "u2netp", "silueta")
DEFAULT_BASE = "https://github.com/danielgatis/rembg/releases/download/v0.0.0"
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "backend" / "cutout-sidecar" / "models.sha256"


def digest(path):
    value = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def manifest(path):
    entries = {}
    for line in Path(path).read_text("utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2:
            entries[parts[1]] = parts[0].lower()
    return entries


def fetch(source, target, from_dir):
    if from_dir:
        shutil.copyfile(Path(from_dir) / Path(source).name, target)
        return
    request = urllib.request.Request(source, headers={"User-Agent": "douyu-deploy"})
    with urllib.request.urlopen(request, timeout=60) as response, open(target, "wb") as handle:
        shutil.copyfileobj(response, handle, 1024 * 1024)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dest", required=True)
    parser.add_argument("--models", default="u2net")
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--from-dir")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    args = parser.parse_args()
    expected = manifest(args.manifest)
    dest = Path(args.dest)
    dest.mkdir(parents=True, exist_ok=True)
    for model in [item.strip() for item in args.models.split(",") if item.strip()]:
        if model not in ALLOWED:
            sys.exit(f"拒绝下载 {model}：只允许 {', '.join(ALLOWED)}")
        name = model + ".onnx"
        target = dest / name
        if target.exists() and digest(target) == expected[name]:
            print(f"{name} 已存在且校验通过")
            continue
        handle, temp = tempfile.mkstemp(prefix="." + name + ".", dir=dest)
        os.close(handle)
        try:
            fetch(args.base_url.rstrip("/") + "/" + name, temp, args.from_dir)
            actual = digest(temp)
            if actual != expected[name]:
                sys.exit(f"{name} SHA-256 不匹配：{actual}")
            os.chmod(temp, 0o644)
            os.replace(temp, target)
            print(f"{name} 下载并校验通过 sha256={actual}")
        finally:
            if os.path.exists(temp):
                os.unlink(temp)


if __name__ == "__main__":
    main()
