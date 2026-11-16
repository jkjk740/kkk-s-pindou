# 豆屿 Node.js 后端

2026-10-19 云端部署已完成，开发小程序通过本机 SSH `13001` 连接 ECS 后端。实际迁移结果、服务器目录和后续发布步骤见 [阿里云发布手册](../docs/ops/aliyun-publishing.md)。以下保留早期本机模式说明，不作为当前云端执行记录；不要在服务器运行本机初始化或迁移脚本。

独立 Express 5 + mysql2 服务，Node.js >=22.12。沿用现有本机 `3306/bead_island`。本次新增账号名称、图纸广场和下载统计源码；迁移、运行与验收由用户执行，代理未执行测试、构建、迁移或接口验证。

## 先填写微信登录配置

打开本项目 `backend/.env`，填写 `WECHAT_APP_SECRET`。AppID 已设为 `wx0ebba69092706cc6`；会话密钥和专用数据库账号密码由本机初始化生成。

| 字段 | 当前用途 |
| --- | --- |
| `HOST` / `PORT` | 默认 `127.0.0.1:3001`；手机局域网联调可将 HOST 改为 `0.0.0.0`，用完恢复 |
| `DB_HOST` / `DB_PORT` | 豆屿 `127.0.0.1:3306`，不能改到 bless 的 3307 |
| `DB_NAME` / `DB_USER` | `bead_island` / `bead_island_app` |
| `DB_PASSWORD` | 专用应用密码，不是 root 密码 |
| `WECHAT_APPID` / `WECHAT_APP_SECRET` | 真实微信 code2Session 身份换取 |
| `SESSION_SECRET` | HMAC 会话签名；修改会使已有会话失效 |
| `UPLOAD_DIR` | 默认 `backend/data/private-images`；相对路径基于 backend 目录 |

缺少 AppSecret 时登录和依赖登录的接口返回 `BACKEND_NOT_CONFIGURED`，不生成模拟用户。游客示例、本机作品和导出仍可使用。

## 本次先做增量迁移

先停止已有豆屿后端，确认本机 3306 MySQL 已运行，再从根目录执行：

```sh
cd /Users/jkliang/Desktop/pindou
npm --prefix backend run migrate:community
npm --prefix backend run dev
```

迁移仅增加 `bead_users.display_name`、`bead_works.origin_public_id`、`bead_public_works` 和 `bead_public_downloads`，并授予应用账号必要的表权限；不改密码、不清数据、不操作 3307。读取 `backend/.env` 和 `~/.local/etc/mysql/private/root-client.cnf`，管理员文件位置可由 `MYSQL_ADMIN_CNF` 指定。已有字段/表保留，可重跑；DDL 中途失败不自动回滚，排除连接/权限问题后重跑。

迁移脚本尚未由代理运行。应用账号没有 DDL 权限，不能只启动新版代码跳过迁移。生产环境使用单独的迁移流程，不运行这个只允许本机 3306/bead_island 的入口。

日常可用 `npm --prefix backend run dev` 监听后端代码，或 `npm --prefix backend start`。修改 .env 后手动重启。根目录普通 `npm start` 是旧浏览器原型，不是 API。

初始化脚本 `npm run provision:local` 已执行，不需要再执行。它仅读取本机已恢复的 `~/.local/etc/mysql/private/root-client.cnf`，只接受 127.0.0.1:3306；创建专用库、当前完整表结构及专用账号，逐表授权 SELECT/INSERT/必要 UPDATE。已有 `.env` 或已存在的同名应用账号会停止，不重置任何旧密码。没有 DROP/TRUNCATE；不连接 3307。

生产环境应由运维根据 `sql/schema.sql` 初始化自己的专用库/表及表级应用账号，不运行这个本机专用脚本。

## HTTP 接口

POST `/api/sync` 使用 JSON `{ "action": "...", "payload": {} }`，成功 `{ok:true,data}`，失败 `{ok:false,error:{code,message,details?}}`。令牌只放 `Authorization: Bearer ...`，不放 JSON 或 URL。JSON 最大 64 KiB。

| action | payload |
| --- | --- |
| `auth.login` | `{code}`；真实微信 code，返回 token、userId、expiresAt、profile（displayName/needsName） |
| `works.list` | `{limit?:1..20,cursor?:string}`；包含删除标记，按 client id 稳定分页 |
| `works.save` | `{work:{id,pattern,completedRows,sourceImageId?:null或UUID,originPublicId?:null或公开UUID},baseRevision}` |
| `works.delete` | `{id,baseRevision}`；永久 tombstone，幂等重试 |

图纸版本 1、MARD 221、最大 64×64、最多 24 色、2.6/5mm；进度按 0 起始行号。更新 CAS 失败返回 409/CONFLICT 和最新作品，本机保留冲突副本。只返回当前用户作品，不返回 owner、openid、session_key 或磁盘路径。

| 图片路由 | 行为 |
| --- | --- |
| POST `/api/images` | 登录后 multipart 单文件 `file`；返回 `{ok:true,data:{image}}` |
| GET `/api/images/:id` | 当前账号的图片 metadata |
| GET `/api/images/:id/content` | 当前账号的二进制原图，private/no-store |

metadata 包括 id、mimeType、byteSize、width、height、createdAt。JPEG/PNG/WebP 单帧，单张 ≤10 MiB、≤2000 万像素、每用户总原图 ≤100 MiB；服务端实际解码验证，不信任扩展名。图片路由先鉴权、限速，再接收 multipart；最多同时处理 2 份上传，Sharp 解码线程和缓存受限。

`/health/live` 表示进程存活；`/health/ready` 检查微信配置、数据库和私有目录可用性。代理本轮没有调用这些接口。

## 原图、数据库和备份

- 原图保存在 `backend/data/private-images/<前缀>/<UUID>.<格式>`，不是公开静态资源。临时文件在 `.tmp`；最终对象私有，目录 0700、文件 0600。单进程最多同时处理 2 份上传，启动时仅清理 .tmp 内超过 15 分钟的本服务临时文件，不清理 final 对象；不要让多个进程共用此本地临时目录。
- MySQL 私人表为 `bead_users`、`bead_images`、`bead_works`，社区表为 `bead_public_works`、`bead_public_downloads`。MySQL 保存 metadata、色号图纸和进度，不存图片二进制。
- 上传原图与保存/同步作品是分开的动作。取消转图后已经成功上传的原图仍归用户私有所有；删除作品不会立即删除可能复用的原图。
- 配额事务锁用户行。确认回滚才删除本次未提交文件；数据库提交结果不确定时保留文件，避免误删已提交原图。此类孤立对象需要管理员对照 metadata 后处理，不能直接批量删除 final 目录。
- 备份须同时包含 `bead_island` 数据库、私有图片目录、社区衍生图片目录和环境配置；备份不应放在公开目录。此前 root 恢复的冷备份位于 `~/.local/var/backups/mysql-before-root-reset-20261008-213439/`，不等于新业务数据的定期备份。
- 原图持久化的 OSS 接入点仍为 storage 适配器及 storage_provider/storage_key，当前原图继续存于本机。已创建 Aidge 专用私有 OSS 临时 Bucket；这不代表原图存储已迁移或已部署 ECS。

## 前端地址

开发默认 `http://127.0.0.1:3001`，仅电脑模拟器使用。手机的 127.0.0.1 是手机自己；同一 Wi-Fi 下用电脑局域网地址，在项目根目录 `.env.local` 设置 `VITE_API_BASE_URL=http://电脑局域网IP:3001`，并重启前端编译。HOST=0.0.0.0 仅用于受控局域网调试，不把 MySQL 对外开放。

正式环境设置 `VITE_API_BASE_URL=https://自己的备案API域名`，不设置时正式包保持未配置，不能回退到 localhost。微信还需配置 request/uploadFile/downloadFile 合法域名。保留正式域名安全校验；本机 HTTP 调试是临时开发选择，不是发布方案。[微信网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

## 账号资料与图纸广场

所有 JSON 结果使用既有 `{ok:true,data}` / `{ok:false,error}` envelope。发布作者从登录身份确定，不接受昵称、owner 或客户端颜色表。

| 路由 | 输入/用途 |
| --- | --- |
| GET /api/profile | 已登录账号的 displayName/needsName |
| PATCH /api/profile | 已登录，`{displayName}`，1–24 Unicode 字符 |
| GET /api/community | 游客可读，query/sort=hot或latest/limit最多20/cursor |
| GET /api/community/:id | 公开快照、作者名称、MARD 图纸、下载数；作者有 canManage |
| GET /api/community/:id/thumbnail | 仍公开图纸的服务端衍生 PNG，不读取原图 |
| POST /api/community | 已登录，`{sourceClientId,sourceRevision,title}` |
| PUT /api/community/:id | 作者同样输入，显式更新，保留下载数 |
| DELETE /api/community/:id | 作者下架，保留统计与快照记录 |
| POST /api/community/:id/download-intents | 游客可申请 10 分钟随机确认凭据 |
| POST /api/community/:id/downloads | `{id,token}`，同一凭据幂等确认 |

仅本人已持久化且版本匹配的非公开复制来源作品可发布。同源相同内容 POST 返回同一图纸，内容不同返回 ALREADY_PUBLISHED 和本人可用公开 ID；确认后 PUT 更新。title 最多 50 Unicode 字符，输入字段受限，查询参数化。最热按下载数、发布时间、ID 降序；最新按发布时间、ID 降序。游标绑定搜索和排序。

公开返回不含私人原图、owner、openid、来源作品 ID、进度或磁盘路径。私人作品响应补充 originPublicId（复制来源）及 publishedId（本人管理提示）；公开复制不能关联私人原图。

公开衍生图位于 `backend/data/community-thumbnails`；只有当前仍公开的作品 ID 可读，没有公开静态 uploads。绘制色卡随 backend 保存在 `src/mard-palette.json`，参考数据许可随 `src/MARD-DATA-LICENSE.txt` 附带。更新或数据库提交结果不确定时可能留下旧/孤立衍生文件，删除前须核对数据库引用。

## 保存与计数边界

前端在登录有效时后台保存图纸/进度，不展示同步状态或手动同步按钮；断网仍保留本机内容，恢复或再次显示时重试。发布前执行保存屏障，图纸变化/冲突不能把未预览内容直接发出。

下载数定义为客户端在系统相册成功后确认的次数，而不是独立人数；后端锁定意图及公开作品、首次确认原子加一。凭据只存摘要，申请/确认限流；未完成过期意图有限批清理。后端不能证明手机系统回调真实，也不宣称完全防刷。离线补确认不重新保存文件，缓存不足且确认断网可能漏计。

本地实现不含正式内容审核、举报或生产防刷/监控，原图仍保存在本机；Aidge 专用 OSS 仅用于抠图工作副本的临时暂存。正式开放前必须由项目负责人准备这些运营与隐私边界。

本次人工清单：`../docs/community-manual-acceptance.md`。先前后端/导出清单：`../docs/local-backend-acceptance.md`。本次未运行测试、lint、构建、迁移、服务探针、联调或真机验证。

## Aidge 智能抠图

2026-10-17 起抠图供应商改为 Aidge `ImageMatting`，不再使用旧 VIAPI `SegmentCommonImage`。凭证仅保存在 `backend/.env`，不要把下载的 AccessKey CSV 放入仓库。Aidge 只接收图片 URL，因此使用专用私有 OSS Bucket 暂存白底工作副本，通过 5 分钟 V4 签名 URL 提供给 Aidge，结束后清理；原图仍私有保存在本机。

需配置 `CUTOUT_OSS_BUCKET`、`CUTOUT_OSS_REGION`，以及受默认公网域名限制的新中国内地 OSS 账号所需的自定义 HTTPS 域名（`CUTOUT_OSS_ENDPOINT` / `CUTOUT_OSS_CNAME=true`）。Aidge 权限不包含 OSS，专用用户另需临时前缀的上传、读取、删除权限。所有云端配置齐全后再启用 `CUTOUT_AI_ENABLED=true` 并重启后端；本次不需要数据库迁移。

截至 2026-10-17，OSS 已完成 ¥0 开通，上海私有 Bucket `douyu-cutout-20261017-7f3a`、临时前缀 1 天生命周期及该前缀 Put/Get/Delete 的专用 RAM 策略已配置并绑定。域名 `tpejocq.cn` 已实名，ICP、SSL、OSS 自定义域名绑定和业务 DNS CNAME 尚未完成。本地已填写实际 Bucket／地域并设 `CUTOUT_OSS_CNAME=true`，但端点为空且 `CUTOUT_AI_ENABLED=false`；尚未执行真实上传、AI 调用或测试，权限与服务可用性仍待用户验收。

完整步骤、输入大小、临时清理与用户验收边界见 [抠图接入说明](../docs/cutout-and-detail-conversion.md)。服务启动仅表示本地后端可运行，不代表 Aidge 已开通或真实请求通过。

## 本机 rembg 智能抠图（2026-11-16）

`CUTOUT_PROVIDER=rembg` 时改用本机 `cutout-sidecar/`（rembg + U-2-Net，CPU），无需 Aidge／OSS 凭证；默认仍为 `aidge`。前端接口与蒙版格式不变。配置、测量与部署见 [抠图接入说明](../docs/cutout-and-detail-conversion.md) 和 [部署模板](../deploy/aliyun/README.md)，第三方许可见根目录 `NOTICE`。
