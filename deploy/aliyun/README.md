# 杭州 ECS 部署配置

这里提供可复用的部署模板。2026-10-19 已在 ECS 启用 systemd 后端、迁移数据库及图片，并按用户确认启用临时公网 HTTP 入口 `http://121.41.36.64`；Nginx HTTPS 尚未启用。实际记录、后续发布及回滚步骤见 [发布手册](../../docs/ops/aliyun-publishing.md)，IP 体验包操作见 [体验版手册](../../docs/ops/ip-experience.md)。再次安装前先核实服务器现有服务、文件和端口，不能覆盖已有部署或其他站点。

## 目录与权限

```text
/opt/node24 -> 已核验的 Node.js 24 LTS 安装目录
/opt/douyu/releases/<release>/backend/   # 整个 backend 包，不包含本机 .env/node_modules/data
/opt/douyu/current -> /opt/douyu/releases/<release>
/opt/douyu/releases/<release>/backend/data -> /var/lib/douyu
/var/lib/douyu/private-images/          # 原图、输入图、遮罩、抠图结果
/var/lib/douyu/private-images/.tmp/     # 应用上传临时目录
/var/lib/douyu/community-thumbnails/    # 社区衍生缩略图
/etc/douyu/backend.env                 # 服务器配置，不在发布包内
/etc/systemd/system/douyu-backend.service
```

`douyu` 是专用系统用户及同名用户组，登录 shell 为 `/usr/sbin/nologin`。源码与 Node 安装目录由部署管理员持有，服务用户只需读取权限；`/var/lib/douyu` 由 `douyu:douyu` 持有，目录权限 0700，图片文件权限 0600。`/etc/douyu` 可为 root:root 0700，环境文件为 root:root 0600，由 systemd 读取。不要给 Nginx 用户开放私有数据目录。

`current` 指向 release 目录，其下才是 `backend/`，不能把链接误指向 backend 本身。每个 release 的 `backend/data` 都指向同一持久目录，切换源码不搬移或删除数据。当前代码的社区缩略图路径固定在 `backend/data/community-thumbnails`，不能只设置 `UPLOAD_DIR` 后遗漏这个链接。

## 配置与首次启用顺序

1. 在服务器核实 Node 24 LTS，确保 `/opt/node24/bin/node` 可由服务用户执行。仅在对应 Linux release 的 backend 目录安装锁定生产依赖（`npm ci --omit=dev`）；不能复制 macOS `node_modules`。后端没有编译步骤。
2. 单独准备生产 MySQL 8 数据库和应用账号。迁移既有本地用户、作品、图片时，按迁移文档执行一致的数据库和文件迁移；不要先清库，不运行 `provision:local` 或种子脚本。应用账号按下表授予必要权限，不授予建表、删表或全库管理权限。
3. 将 `production.env.example` 作为服务器环境文件起点，私下填好生产数据库密码、对应小程序 AppSecret、新生成的 SESSION_SECRET。SESSION_SECRET 至少 32 字节、不含空白；生产密钥与本机分开。`TRUST_PROXY_LOOPBACK=true` 需要本次配套应用代码支持；只信任本机 Nginx，不信任任意代理。首次部署保持 AI 关闭。
4. 建好持久目录、迁移数据及链接后安装 systemd 单元。单元只允许 `/var/lib/douyu` 和私有临时目录写入，后台以一个进程运行；不要额外叠加 PM2 或启动第二个 worker。服务停止时给予 20 秒，覆盖应用自身 10 秒的关闭期限。
5. 按场景从 Nginx 配置中选择一份，安装到独立站点文件。三份模板共用 upstream 名称，不能同时启用。先检查现有站点与端口，再检查 Nginx 配置并启用或 reload；不要覆盖全局 `nginx.conf` 或删除其他站点。
6. 按授权范围核对启动、就绪状态及迁移数据；真实微信登录和业务操作由用户另行验收。数据库和图片需要离机备份；发布切换只修改 `current`，数据库变更须另行评估回滚，不能用源码回退代替数据恢复。

| 表 | 应用账号权限 |
| --- | --- |
| `bead_users` | SELECT、INSERT、UPDATE |
| `bead_images` | SELECT、INSERT |
| `bead_works` | SELECT、INSERT、UPDATE |
| `bead_public_works` | SELECT、INSERT、UPDATE |
| `bead_public_downloads` | SELECT、INSERT、UPDATE、DELETE |
| `bead_cutout_inputs` | SELECT、INSERT |
| `bead_cutouts` | SELECT、INSERT |
| `bead_cutout_tasks` | SELECT、INSERT、UPDATE |
| `bead_cutout_lock` | SELECT、UPDATE |

`bead_cutout_lock` 的初始锁记录由结构迁移或完整数据导入准备，应用不需要 INSERT 权限。MySQL 的 `SELECT ... FOR UPDATE` 需要这里的 UPDATE 权限。

## 临时 HTTP 与正式 HTTPS

`nginx-api-http.conf` 只用于本机小程序开发连接：先把 `REPLACE_WITH_ECS_PUBLIC_IP` 替换为实际核实的 ECS 公网 IPv4，并把安全组和系统防火墙的 80 入站限定为当前开发者公网 IP。3001 和 3306 始终不开放公网。

`nginx-api-experience-ip.conf` 用于本次用户确认的公网 IP 调试：安全组允许 `0.0.0.0/0` 访问 TCP 80，Nginx 仅代理 API；私有接口继续由后端鉴权。当前站点为 `/etc/nginx/sites-available/douyu-api-ip.conf`，Nginx 与后端均已启用并运行。HTTP 明文传输，仅作临时调试。

本机开发专用 `.env.development.local` 当前设置 `VITE_API_BASE_URL=http://121.41.36.64`，开发编译已重启。可选受限 SSH 隧道配置仍保留，当前隧道进程已停止。微信开发者工具仅为该项目临时关闭合法域名校验，源码 `urlCheck` 保持开启。

独立 IP 体验包使用 `npm run build:mp-weixin:experience-ip`，输出 `dist/experience-ip/mp-weixin`。每位体验者需在手机开启调试；本地开发配置不能替体验者跳过检查。该模式仅放行本次指定的 IP，不用于正式上线。

`nginx-api-https.conf` 用于 `https://api.tpejocq.cn`。先完成对应域名的 DNS、备案及证书签发，再启用该配置；它要求证书链和私钥已经存在于 `/etc/letsencrypt/live/api.tpejocq.cn/`。证书续期后需要 reload Nginx。模板不负责获取或续期证书；使用 HTTP-01 签发时需单独安排 challenge 处理，不要假设 API 路由会代为返回验证文件。

正式小程序地址设为 `https://api.tpejocq.cn`，并在微信后台同时登记这个域名的 request、uploadFile、downloadFile 权限：现有客户端已经通过 API 上传和下载图片。正式构建会拒绝 HTTP 或 IP 地址。

## 代理、图片与健康检查

三份 Nginx 配置都只代理 `/api/` 及受限的健康检查路径，保留完整请求路径和 Authorization 头；X-Forwarded-For 覆写为真实的直接连接来源。上传总请求体限额为 12 MiB，应用内单文件仍为 10 MiB，代理收发超时为 130 秒。没有给图片目录设置 alias 或静态下载，不能用该方式绕过原图鉴权，也不启用 API 缓存。

`/health/live` 只表示进程能响应；`/health/ready` 检查登录配置、数据库结构和图片目录权限，不能代替真实业务验收。Nginx 仅允许 loopback 请求这两个路径；主机内部也可以直接访问 `http://127.0.0.1:3001/health/ready`。服务启动前就会检查必要表和目录，AI 关闭时也必须有完整抠图表及权限。

应用日志进入 `journalctl -u douyu-backend`，Nginx 日志写入 `/var/log/nginx/douyu-api.*.log`。部署时应核实系统日志保留及 Nginx logrotate 是否覆盖这些文件，避免占满磁盘。日志中不要增加密码、AppSecret、令牌、完整请求体或带凭据的外部 URL。
