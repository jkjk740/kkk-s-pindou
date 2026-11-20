"""豆屿智能抠图本机服务（U-2-Net + onnxruntime CPU，推理流程与 rembg 一致，但运行时不导入 rembg）。

只监听 loopback，由 Node 后端调用：
  GET  /health   -> 200 {"ok":true,"model":...} 模型已加载
  POST /v1/mask  -> 请求体为 PNG/JPEG/WebP 原始字节；返回同尺寸单通道灰度 PNG

模型权重必须在部署时由 deploy/aliyun/download-rembg-models.py 下载并校验，
本服务启动时只校验 SHA-256，缺失或不匹配直接退出，绝不在用户请求时下载。
只允许 Apache-2.0 的 U-2-Net 系列模型；rembg 默认的 bria-rmbg（CC BY-NC）不可商用，禁止使用。
"""
from __future__ import annotations

import hashlib
import io
import ipaddress
import json
import logging
import os
import signal
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ALLOWED_MODELS = ("u2net", "u2netp", "silueta")
ALLOWED_FORMATS = {"PNG", "JPEG", "WEBP"}
MANIFEST = Path(__file__).with_name("models.sha256")
LOG = logging.getLogger("douyu-rembg")


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "")
    value = default if raw == "" else int(raw)
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be within {minimum}..{maximum}")
    return value


def load_settings() -> dict:
    host = os.environ.get("REMBG_HOST", "127.0.0.1")
    if host != "localhost" and not ipaddress.ip_address(host).is_loopback:
        raise ValueError("REMBG_HOST must be a loopback address")
    model = os.environ.get("REMBG_MODEL", "u2net")
    if model not in ALLOWED_MODELS:
        raise ValueError(f"REMBG_MODEL must be one of {', '.join(ALLOWED_MODELS)}")
    home = os.environ.get("U2NET_HOME", "")
    if not home or not os.path.isabs(home):
        raise ValueError("U2NET_HOME must be an absolute model directory")
    return {
        "host": host,
        "port": env_int("REMBG_PORT", 3101, 1, 65535),
        "model": model,
        "home": home,
        "max_bytes": env_int("REMBG_MAX_INPUT_BYTES", 8 * 1024 * 1024, 1024, 32 * 1024 * 1024),
        "max_pixels": env_int("REMBG_MAX_PIXELS", 1024 * 1024, 1024, 4096 * 4096),
        "max_side": env_int("REMBG_MAX_SIDE", 1024, 320, 4096),
        "timeout": env_int("REMBG_TIMEOUT_SECONDS", 30, 1, 300),
        "queue_wait": env_int("REMBG_QUEUE_WAIT_SECONDS", 5, 0, 60),
        "concurrency": env_int("REMBG_CONCURRENCY", 1, 1, 8),
        "threads": env_int("REMBG_THREADS", 0, 0, 64),
        # 关闭 onnxruntime CPU 内存池：速度基本不变，常驻内存明显更少。
        "cpu_arena": os.environ.get("REMBG_CPU_ARENA", "false") == "true",
        # 关闭内存规划（mem pattern）：不预留整张激活内存块，峰值更低。
        "mem_pattern": os.environ.get("REMBG_MEM_PATTERN", "false") == "true",
        # 图优化级别：extended 不做 x86 NCHWc 布局转换，u2netp 推理峰值约少 80 MB，速度略慢；all 为 onnxruntime 默认。
        "graph_opt": graph_opt_level(os.environ.get("REMBG_GRAPH_OPT", "extended")),
    }


GRAPH_OPT_LEVELS = ("basic", "extended", "all")


def graph_opt_level(value: str) -> str:
    if value not in GRAPH_OPT_LEVELS:
        raise ValueError(f"REMBG_GRAPH_OPT must be one of {', '.join(GRAPH_OPT_LEVELS)}")
    return value


def release_free_heap():
    """推理后把 glibc 空闲堆还给系统，让空闲时 RSS / cgroup 内存回落（非 glibc 平台忽略）。"""
    if not sys.platform.startswith("linux"):
        return
    try:
        import ctypes

        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except (OSError, AttributeError):
        pass


def expected_digest(filename: str) -> str:
    for line in MANIFEST.read_text("utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == filename:
            return parts[0].lower()
    raise ValueError(f"{filename} is not listed in {MANIFEST.name}")


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# 与 rembg 2.0.87 的 U2netSession / U2netpSession / SiluetaSession 一致的预处理常量。
INPUT_SIZE = (320, 320)
MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def resolve_model(home: str, filename: str, model: str):
    """与 rembg BaseSession.resolve_existing 相同的查找顺序：先 <home>/models/<name>/，再 <home>/。"""
    for path in (os.path.join(home, "models", model, filename), os.path.join(home, filename)):
        if os.path.exists(path):
            return path
    return None


class Engine:
    """直接用 onnxruntime 跑 U-2-Net，不导入 rembg（避免 pymatting/numba/scipy 的常驻内存）。

    预处理和后处理逐行对照 rembg 2.0.87（MIT）的 sessions/base.py normalize() 与
    sessions/u2net.py、u2netp.py、silueta.py 的 predict()，输出蒙版与 rembg 完全一致。
    会话加载一次并复用；并发由信号量限制。
    """

    def __init__(self, settings: dict):
        self.settings = settings
        import numpy as np  # noqa: WPS433 - 延迟导入，配置错误时快速失败
        import onnxruntime as ort
        from PIL import Image

        self.np = np
        self.Image = Image
        Image.MAX_IMAGE_PIXELS = settings["max_pixels"]
        model = settings["model"]
        if model not in ALLOWED_MODELS:
            raise RuntimeError("model not allowed")
        filename = model + ".onnx"
        path = resolve_model(settings["home"], filename, model)
        if path is None:
            raise RuntimeError(f"{filename} missing under U2NET_HOME; run download-rembg-models.py at deploy time")
        if sha256_file(path) != expected_digest(filename):
            raise RuntimeError(f"{filename} SHA-256 mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = settings["threads"]
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.enable_cpu_mem_arena = settings["cpu_arena"]
        options.enable_mem_pattern = settings["mem_pattern"]
        options.graph_optimization_level = {
            "basic": ort.GraphOptimizationLevel.ORT_ENABLE_BASIC,
            "extended": ort.GraphOptimizationLevel.ORT_ENABLE_EXTENDED,
            "all": ort.GraphOptimizationLevel.ORT_ENABLE_ALL,
        }[settings.get("graph_opt", "extended")]
        started = time.monotonic()
        # 显式指定 U-2-Net 系列权重文件，绝不使用 rembg 默认的 bria-rmbg。
        self.session = ort.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.load_seconds = time.monotonic() - started
        self.slots = threading.BoundedSemaphore(settings["concurrency"])
        self.busy = 0
        self.lock = threading.Lock()
        warm = time.monotonic()
        self._predict(Image.new("RGB", (320, 320), (255, 255, 255)))
        release_free_heap()
        LOG.info("model=%s loaded=%.2fs warmup=%.2fs threads=%s graph_opt=%s", model, self.load_seconds, time.monotonic() - warm, settings["threads"] or "auto", settings.get("graph_opt", "extended"))

    def _normalize(self, image):
        """rembg BaseSession.normalize()：320x320 LANCZOS、除以最大值、按 ImageNet 均值方差标准化、NCHW float32。"""
        np = self.np
        im = image.convert("RGB").resize(INPUT_SIZE, self.Image.Resampling.LANCZOS)
        im_ary = np.array(im)
        im_ary = im_ary / max(np.max(im_ary), 1e-6)
        tmp = np.zeros((im_ary.shape[0], im_ary.shape[1], 3))
        for channel in range(3):
            tmp[:, :, channel] = (im_ary[:, :, channel] - MEAN[channel]) / STD[channel]
        tmp = tmp.transpose((2, 0, 1))
        return np.expand_dims(tmp, 0).astype(np.float32)

    def _predict(self, image):
        """rembg U2netSession.predict()：取第一个输出的第 0 通道，min-max 归一化，转 uint8，LANCZOS 缩回原尺寸。"""
        np = self.np
        outputs = self.session.run(None, {self.input_name: self._normalize(image)})
        pred = outputs[0][:, 0, :, :]
        del outputs
        ma = np.max(pred)
        mi = np.min(pred)
        if not ma > mi:  # 常数输出（rembg 这里会得到 NaN），按全背景处理
            pred = np.zeros_like(pred)
        else:
            pred = (pred - mi) / (ma - mi)
        pred = np.squeeze(pred)
        # u2net 版本带 clip(0, 1)；min-max 之后值本就在 [0,1]，u2netp/silueta 结果相同。
        mask = self.Image.fromarray((pred.clip(0, 1) * 255).astype("uint8"), mode="L")
        return mask.resize(image.size, self.Image.Resampling.LANCZOS)

    def decode(self, body: bytes):
        Image = self.Image
        try:
            image = Image.open(io.BytesIO(body))
            if image.format not in ALLOWED_FORMATS or getattr(image, "n_frames", 1) != 1:
                raise ValueError()
            width, height = image.size
            if width < 16 or height < 16 or width * height > self.settings["max_pixels"]:
                raise ValueError()
            image.load()
        except Exception as error:  # Pillow 抛出的异常类型较多，统一视为无效图片
            raise InputError("IMAGE_INVALID") from error
        if image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info):
            rgba = image.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.getchannel("A"))
            return flat
        return image.convert("RGB")

    def mask(self, image) -> bytes:
        Image = self.Image
        source = image
        max_side = self.settings["max_side"]
        if max(image.size) > max_side:
            source = image.copy()
            source.thumbnail((max_side, max_side), Image.Resampling.BILINEAR)
        mask = self._predict(source).convert("L")
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.BILINEAR)
        output = io.BytesIO()
        mask.save(output, "PNG", optimize=False)
        return output.getvalue()

    def run(self, image) -> bytes:
        """在工作线程推理；超时后先返回，槽位等推理真正结束才释放。"""
        if not self.slots.acquire(timeout=self.settings["queue_wait"]):
            raise InputError("BUSY")
        result: dict = {}
        done = threading.Event()

        def work():
            with self.lock:
                self.busy += 1
            try:
                result["png"] = self.mask(image)
            except Exception as error:  # noqa: BLE001
                result["error"] = error
            finally:
                with self.lock:
                    self.busy -= 1
                    idle = self.busy == 0
                if idle:
                    release_free_heap()
                self.slots.release()
                done.set()

        threading.Thread(target=work, name="rembg-infer", daemon=True).start()
        if not done.wait(self.settings["timeout"]):
            raise InputError("TIMEOUT")
        if "error" in result:
            LOG.warning("inference failed: %s", type(result["error"]).__name__)
            raise InputError("INFERENCE_FAILED")
        return result["png"]


class InputError(Exception):
    STATUS = {
        "IMAGE_INVALID": HTTPStatus.BAD_REQUEST,
        "LENGTH_REQUIRED": HTTPStatus.LENGTH_REQUIRED,
        "TOO_LARGE": HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        "UNSUPPORTED_MEDIA_TYPE": HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
        "BUSY": HTTPStatus.SERVICE_UNAVAILABLE,
        "TIMEOUT": HTTPStatus.GATEWAY_TIMEOUT,
        "INFERENCE_FAILED": HTTPStatus.INTERNAL_SERVER_ERROR,
        "NOT_FOUND": HTTPStatus.NOT_FOUND,
    }

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code
        self.status = self.STATUS[code]


def make_handler(engine: Engine, settings: dict):
    class Handler(BaseHTTPRequestHandler):
        server_version = "douyu-rembg"
        sys_version = ""
        protocol_version = "HTTP/1.1"
        timeout = 15  # 读取请求的套接字超时，避免慢速连接占住线程

        def log_message(self, fmt, *args):  # 不记录请求内容或客户端细节
            return

        def send_json(self, status: int, payload: dict):
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path != "/health":
                return self.send_json(404, {"ok": False, "error": "NOT_FOUND"})
            self.send_json(200, {"ok": True, "model": settings["model"], "busy": engine.busy, "concurrency": settings["concurrency"]})

        def do_POST(self):
            started = time.monotonic()
            try:
                if self.path != "/v1/mask":
                    raise InputError("NOT_FOUND")
                if (self.headers.get("Content-Type") or "").split(";")[0].strip().lower() not in ("image/png", "image/jpeg", "image/webp"):
                    raise InputError("UNSUPPORTED_MEDIA_TYPE")
                if self.headers.get("Transfer-Encoding"):
                    raise InputError("LENGTH_REQUIRED")
                length = self.headers.get("Content-Length")
                if length is None or not length.isdigit():
                    raise InputError("LENGTH_REQUIRED")
                if int(length) > settings["max_bytes"]:
                    raise InputError("TOO_LARGE")
                body = self.rfile.read(int(length))
                if len(body) != int(length):
                    raise InputError("IMAGE_INVALID")
                png = engine.run(engine.decode(body))
            except InputError as error:
                self.close_connection = True
                LOG.info("mask status=%s code=%s ms=%d", int(error.status), error.code, (time.monotonic() - started) * 1000)
                return self.send_json(error.status, {"ok": False, "error": error.code})
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(png)
            LOG.info("mask status=200 ms=%d", (time.monotonic() - started) * 1000)

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 16

    def __init__(self, address, handler, family):
        self.address_family = family
        super().__init__(address, handler)


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", stream=sys.stderr)
    try:
        settings = load_settings()
        engine = Engine(settings)
    except Exception as error:  # noqa: BLE001
        LOG.error("startup refused: %s", error)
        return 1
    import socket

    family = socket.AF_INET6 if ":" in settings["host"] else socket.AF_INET
    server = Server((settings["host"], settings["port"]), make_handler(engine, settings), family)
    signal.signal(signal.SIGTERM, lambda *_: threading.Thread(target=server.shutdown, daemon=True).start())
    LOG.info("listening %s:%s", settings["host"], settings["port"])
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
