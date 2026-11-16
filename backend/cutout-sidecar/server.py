"""豆屿智能抠图本机服务（rembg + onnxruntime CPU）。

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
        # 关闭 onnxruntime CPU 内存池：速度基本不变，常驻内存约少 450 MB。
        "cpu_arena": os.environ.get("REMBG_CPU_ARENA", "false") == "true",
    }


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


class Engine:
    """加载一次 rembg 会话并复用；并发由信号量限制。"""

    def __init__(self, settings: dict):
        self.settings = settings
        os.environ["U2NET_HOME"] = settings["home"]
        os.environ.pop("MODEL_CHECKSUM_DISABLED", None)
        import onnxruntime as ort  # noqa: WPS433 - 延迟导入，配置错误时快速失败
        from PIL import Image
        from rembg import new_session
        from rembg.sessions import sessions_class

        self.Image = Image
        Image.MAX_IMAGE_PIXELS = settings["max_pixels"]
        session_class = next((item for item in sessions_class if item.name() == settings["model"]), None)
        if session_class is None:
            raise RuntimeError("model class unavailable")
        filename = settings["model"] + ".onnx"
        # 与 rembg 实际加载的路径一致；文件不存在时 rembg 会去下载，因此这里先拒绝启动。
        path = session_class.resolve_existing(filename)
        if path is None:
            raise RuntimeError(f"{filename} missing under U2NET_HOME; run download-rembg-models.py at deploy time")
        if sha256_file(path) != expected_digest(filename):
            raise RuntimeError(f"{filename} SHA-256 mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = settings["threads"]
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = settings["cpu_arena"]
        started = time.monotonic()
        # 显式指定模型，绝不使用 rembg 默认的 bria-rmbg。
        self.session = new_session(settings["model"], sess_opts=options, providers=["CPUExecutionProvider"])
        self.load_seconds = time.monotonic() - started
        self.slots = threading.BoundedSemaphore(settings["concurrency"])
        self.busy = 0
        self.lock = threading.Lock()
        warm = time.monotonic()
        self._predict(Image.new("RGB", (320, 320), (255, 255, 255)))
        LOG.info("model=%s loaded=%.2fs warmup=%.2fs threads=%s", settings["model"], self.load_seconds, time.monotonic() - warm, settings["threads"] or "auto")

    def _predict(self, image):
        return self.session.predict(image)[0]

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
