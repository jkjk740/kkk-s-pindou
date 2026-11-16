# 本机智能抠图服务（U-2-Net / onnxruntime）

给 `CUTOUT_PROVIDER=rembg` 使用的独立 Python 进程，只监听 `127.0.0.1:3101`，由 Node 后端的
`src/cutout-rembg-provider.cjs` 调用。用户图片不离开服务器，没有云端费用。

运行时只依赖 onnxruntime + numpy + Pillow，不导入 rembg：预处理（320×320 LANCZOS、除以最大值、ImageNet
均值方差、NCHW float32）和后处理（第一个输出第 0 通道、min-max 归一化、uint8、LANCZOS 缩回原尺寸）
逐行对照 rembg 2.0.87 的 `U2netSession` / `U2netpSession` / `SiluetaSession` 实现。这样不会加载
rembg 连带的 pymatting / numba / scipy（原来首启 numba JIT 就超过 600 MB 被 OOM）。
`REMBG_GRAPH_OPT=all` 时蒙版与 rembg 逐像素一致；默认 `extended` 推理峰值约少 80 MB，与 rembg 最多差 1/255。

- `GET /health`：模型已加载时返回 `{"ok":true,"model":"u2netp","busy":0,"concurrency":1}`。
- `POST /v1/mask`：请求体为单张 PNG/JPEG/WebP 原始字节（`Content-Type` 对应、必须带 `Content-Length`），
  返回与输入同尺寸的单通道灰度 PNG（0 背景，255 主体）。错误为 JSON `{"ok":false,"error":CODE}`：
  400 `IMAGE_INVALID`、411 `LENGTH_REQUIRED`、413 `TOO_LARGE`、415 `UNSUPPORTED_MEDIA_TYPE`、
  503 `BUSY`、504 `TIMEOUT`、500 `INFERENCE_FAILED`。
- 模型固定为 `REMBG_MODEL` 白名单 `u2net`（代码默认）/`u2netp`（生产推荐）/`silueta`，启动时按 `models.sha256` 校验
  `U2NET_HOME` 下的权重，缺失或不匹配直接退出；绝不在请求时下载，也不使用 rembg 默认的 bria-rmbg（CC BY-NC）。
- 会话启动时加载一次并预热，之后复用。并发默认 1，等待槽位最多 `REMBG_QUEUE_WAIT_SECONDS` 秒；
  推理超时返回 504，槽位在推理真正结束后才释放。

本机试跑（macOS / Linux，需要 Python 3.11+；依赖装在本目录 `.venv`，已被 git 忽略）：

```sh
cd backend/cutout-sidecar
python3.12 -m venv .venv && .venv/bin/pip install -r ../../deploy/aliyun/rembg-requirements.txt
python3 ../../deploy/aliyun/download-rembg-models.py --dest "$PWD/.models" --models u2netp
U2NET_HOME="$PWD/.models" REMBG_MODEL=u2netp REMBG_THREADS=2 .venv/bin/python server.py
curl -s 127.0.0.1:3101/health
curl -s -H 'Content-Type: image/png' --data-binary @photo.png -o mask.png 127.0.0.1:3101/v1/mask
```

内存（Linux x86_64，u2netp，1024 px 输入，关闭 CPU 内存池和 mem pattern，`extended`）：空闲 RSS 约 0.1 GB
（匿名内存约 40 MB），单张推理峰值约 0.29 GB，5 个请求同时排队时约 0.33 GB；1 线程与 2 线程相同。
u2net 峰值约 0.51 GB。systemd 上限建议 `MemoryMax=600M`（u2netp）。

许可与署名见仓库根目录 `NOTICE`（U-2-Net 权重 Apache-2.0；推理流程参照 rembg，MIT）。
