# 豆屿本地后端与图纸体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择当前会话直接开发，测试与验证由用户负责，本计划不安排代理执行测试、构建或验收。

**Goal:** 将豆屿接入独立的本地 Node.js/MySQL 后端，支持真实登录后的私有原图上传，并改善转图导航、高清导出和跟拼查看。

**Architecture:** 保留 uni-app Vue3 和本机像素转换。独立 Express 服务管理微信会话、私有文件和 MySQL 用户/作品/图片记录，前端以 HTTP 适配现有同步协议。只操作本机 `3306/bead_island`，不连接或修改 blessapp 的 `3307/myapp`。

**Tech Stack:** uni-app / Vue3；Node.js 22.12+，生产建议 24 LTS；Express 5、mysql2 3、Multer 2、Sharp 0.34；MySQL 8.4；微信原生 Canvas 与 movable-view。

**Spec:** `docs/superpowers/specs/2026-10-08-nodejs-mysql-design.md`

## Global Constraints

- 微信 AppID `wx0ebba69092706cc6`、DCloud AppID `__UNI__ACD00BD` 不变。
- 独立数据库 `bead_island`、专用账号 `bead_island_app`，只在 `127.0.0.1:3306` 初始化；不再次重置 root，不修改钥匙串，不操作 `3307/myapp`。
- 长边 24 / 32 / 48 / 64 格、最大 64×64、MARD 221 色白名单、最多 24 色；不增加算法上限。
- 真实微信登录，令牌 7 天有效、服务地址隔离；缺少 AppSecret 时返回未配置，不制造假登录。
- JPEG / PNG / WebP 原图，10 MiB/张、2000 万解码像素、100 MiB/用户，私有保存；不挂载公开上传目录。
- JSON 请求 64 KiB、分页最多 20 项、版本 CAS 和永久删除标记保留。
- 导出为白底 PNG，40 像素/格、最多 1200 万输出像素；镜像只翻转格子索引，不翻转文字。
- 保留真实 tabBar、奶油白与鼠尾草绿风格；触控目标至少约 44px，缩放范围 1×–6×。
- 用户负责测试、构建、联调和真机验收。代理只实施和交付，不运行测试、lint、构建、健康探针或界面验收，也不派发验证子代理。
- 没有 Git 仓库，不创建分支、worktree 或提交；源文件使用 apply_patch 修改。
- 原 `server.mjs` 浏览器原型与 uniCloud 历史源码保留，不作为新后端运行依赖。

## Review Focus

以下项目属于交付给用户的验收重点，不由代理执行验收命令：

1. 取消登录/选图、正常从系统相册返回，以及切 tab 后旧上传回调：前两者保留草稿，最后一种不能覆盖当前作品。
2. 并发上传、伪图片、动画多帧或超大解码图片：拒绝或受限处理，不突破用户配额，不遗失已提交的原图。
3. 只改变原图关联、同步过程中继续编辑、没有 pattern 的 tombstone：元数据正确同步，本机新编辑不能被旧快照吞掉。
4. 长标题、24 色、长条非对称图纸、重复导出及拒绝相册权限：文字清晰且正向，错误可重试，不遮挡 tabBar。
5. 双指变单指、拖动后抬手、放大后选行、打开/关闭详情：不误完成一行，不误改行号，进度不丢失。

---

## 文件与职责

| 文件 | 职责 |
| --- | --- |
| `backend/package.json`、`backend/.env.example` | 独立依赖、启动脚本和环境配置模板 |
| `backend/src/config.cjs`、`backend/src/errors.cjs` | 路径/参数配置、安全错误及 HTTP 状态映射 |
| `backend/src/session.cjs`、`backend/src/validation.cjs`、`backend/src/mard-codes.json` | 自包含的令牌与严格业务校验 |
| `backend/src/wechat.cjs` | Node fetch 真实 code2Session 适配 |
| `backend/src/repository.cjs` | 参数化 SQL、用户 upsert、作品 CAS、图片归属与配额事务 |
| `backend/src/storage.cjs`、`backend/src/images.cjs` | 私有文件、实际解码、失败清理和图片 HTTP 路由 |
| `backend/src/api.cjs`、`backend/src/app.cjs`、`backend/src/server.cjs` | action 协议、Express 装配、监听与退出 |
| `backend/sql/schema.sql`、`backend/scripts/provision-local.cjs` | 独立库/表与本机一次性配置，应用账号只获必要表级权限 |
| `backend/README.md` | 用户启动、配置和接口说明 |
| `src/lib/cloud.js`、`src/config.js` | HTTP 客户端、地址隔离的会话、鉴权上传/下载 |
| `src/lib/ui.js`、`src/lib/storage.js` | 登录后选原图、上传流程与作品元数据持久化 |
| `src/lib/export-layout.js`、`src/lib/render.js`、`src/components/export-sheet.vue` | 导出布局、Native 保存流程及方向/反馈面板 |
| `src/lib/viewport.js`、`src/components/pattern-viewer.vue`、`src/components/pattern-detail.vue` | 连续缩放/平移、模式分离、同页全屏详情 |
| `src/components/bead-canvas.vue`、`src/main.js` | 可复用高分辨率基础画布和新组件注册 |
| `src/pages/home/index.vue`、`src/pages/editor/index.vue`、`src/pages/making/index.vue`、`src/pages/works/index.vue` | 页面入口、tabBar、导出、跟拼及同步文案 |
| `.gitignore`、`README.md`、`docs/nodejs-local-and-aliyun.md`、`docs/local-backend-acceptance.md` | 私有文件忽略、默认架构与用户验收交付 |

## Task 1：独立 MySQL、身份与作品服务

**Files:** 新增 backend 配置、session、validation、wechat、repository、api、app、server、SQL、provision；修改 `.gitignore`，新增 `backend/README.md`。

**Interfaces:**
- `loadConfig(env)` → `{ host, port, mysql, auth, uploadDir, uploadLimits }`，固定本项目默认库和账号，配置缺失可明确返回未就绪。
- `issueSession(identity, config, now)` / `verifySession(authorization, config, now)` / `userId(appId, openid)`：沿用 v1 HMAC 格式、7 天 TTL 与派生 ID。
- `createRepository(pool)` → `upsertUser(owner, appId, now)`, `get(owner, clientId)`, `list(owner, after, limit)`, `compareAndSwap(owner, clientId, baseRevision, next)`, `getImage(owner, imageId)`, `saveImage(owner, metadata, quotaBytes)`。
- `createApi({ repository, env, exchange, clock })` → `api(request, headers)`，返回 `{ ok, data }` / `{ ok:false, error }`。
- `createApp({ config, pool, repository, storage })` → Express app；默认监听 `127.0.0.1:3000`。

- [ ] 建立 CommonJS backend 包和环境模板，使用 Node 原生 env-file 加载。依赖安装仅针对 backend，关闭安装时 audit/fund；安装不等于功能验收，不启动服务做探针。
- [ ] 将既有纯鉴权、校验和安全错误语义移入 backend 自有文件，不 require uniCloud 目录；新增 `sourceImageId` UUID 校验，保留已有尺寸、色号、进度、游标和版本上限。
- [ ] 编写三张表：`bead_users`、`bead_images`、`bead_works`；ASCII 大小写敏感 ID、毫秒 BIGINT、JSON、用户外键、图片 owner 联合外键、owner/client_id 唯一索引。schema 不含 DROP、TRUNCATE 或其他库名。
- [ ] 实现参数化 MySQL 仓储。创建用唯一键原子插入；更新 WHERE 必须同时含 owner、client_id、revision；删除以 tombstone CAS 更新。BIGINT/JSON 明确转型，失败不以内存替代。
- [ ] 微信换取身份使用 fetch、5 秒超时和禁止跳转。成功写入用户记录后才签发令牌，作品公共响应带可空 `sourceImageId`，不含 owner 或磁盘路径。
- [ ] 实现 `/api/sync`、`/health/live`、`/health/ready`；JSON 64 KiB、登录限速、关闭框架标识、错误文案/状态一致。ready 的探针逻辑只作为接口实现，本轮不调用。
- [ ] 实现一次性 provision：仅接受本机 3306 管理配置；创建 `bead_island` 和专用应用账号；逐表授权必要 SELECT/INSERT/UPDATE，避免库名下划线通配权限。已有账号且无本项目配置时停止，不擅自覆盖密码。
- [ ] 实施专用数据库初始化及生成 `backend/.env`，权限 0600，应用密码和会话密钥本机生成，微信 AppSecret 留给用户填写。仅执行配置实施所需 DDL，不运行连通性/健康测试，不更改 root、3307 或旧工程配置。

**交付给用户的验收项：** 真实 code 登录；无配置/错误 code/过期令牌拒绝；跨用户作品拒绝；并发 CAS；删除幂等；分页包含 tombstone；服务重启后数据保留。

## Task 2：私有原图上传与 HTTP 前端接入

**Files:** 新增 backend storage/images，修改 cloud/config/ui/storage、home/editor/works。

**Interfaces:**
- `createStorage(root)` → `prepare()`, `commit(tempPath, storageKey)`, `resolve(storageKey)`, `removeUncommitted(storageKey)`；对象标识由服务端 UUID 生成。
- `POST /api/images` → `{ ok:true, data:{ image:{ id, mimeType, byteSize, width, height, createdAt } } }`；字段 `file`，不返回原始服务器路径。
- `GET /api/images/:id` → 同一图片元数据；`GET /api/images/:id/content` → 鉴权二进制、私有缓存策略。
- 保留 `createCloudClient({ platform, invoke, enabled, scope })` 可注入入口；扩展 `login()`, `getSession()`, `uploadImage(filePath)`, `downloadImage(imageId)`, `syncWorks(repository)`。默认使用 HTTP，不注入 uniCloud SDK。
- `selectPersonalImage()` → `{ path, width, height, name, sourceImageId }`；登录/选择/上传完整成功才返回，取消不建立个人草稿。

- [ ] 在 multipart 解析之前鉴权；Multer 只用于原图路由，私有临时目录、单文件、10 MiB 限制、上传限速。Sharp 实际解码，格式白名单、20MP 和单帧边界，限制解码并发。
- [ ] `saveImage` 事务锁住用户行，再累计并检查 100 MiB 配额，插入元数据。只有确认回滚时清理本次未提交文件；提交结果不确定时保留文件并返回失败，不删除可能已入库的个人原图。
- [ ] 实现元数据与二进制读取，所有查询带 owner。生成安全存储 key，不允许客户端文件名或路径穿越，不使用 express.static 开放 uploads。
- [ ] 前端配置区分开发 HTTP 与正式 HTTPS；正式构建无有效地址时保持未配置并提示，不默认回退 localhost。会话缓存按规范化 API 地址隔离，Authorization 只发往当前服务。
- [ ] 保留同步冲突/本机副本逻辑，修正 deleted 记录可没有 pattern 的响应边界。`sourceImageId` 加入保存请求、公共响应、内容比较、快照确认和本机持久化。
- [ ] `selectPersonalImage` 先明确登录同意，再选 original，再鉴权上传；处理上传/下载令牌过期的一次续期。原图预览先下载本机临时文件，不把令牌塞进 URL。
- [ ] 首页与 editor 所有个人选图入口接入同一流程。添加上传阶段状态和并发保护，正常相册返回不误取消，切 tab 后旧请求不覆盖新草稿；保留游客示例与旧本机作品。
- [ ] works 去掉 uniCloud 绑定提示，使用本地后端配置与实际登录/同步状态文案，不把地址存在当作服务已经连通。

**交付给用户的验收项：** Review Focus 1–3；无登录上传/跨用户原图拒绝；上传超限和失败不丢旧草稿；下载预览；后台重启后的原图持久化。

## Task 3：真实转图 tabBar 与高清导出

**Files:** 新增 export-layout/export-sheet；修改 editor/render/material-sheet/main/common.css。

**Interfaces:**
- `createExportLayout(pattern, palette, { mirror, cellSize:40 })` → `{ width, height, cellSize, grid, colors, total, titleLines, legend }`，像素总量不超过 12000000。
- `drawExport(canvas, pattern, options)` → 布局；镜像 sourceColumn = width − 1 − displayedColumn，其他文字方向不变。
- `saveExport(canvas, pattern, { mirror, scope, onPhase })` → 临时 PNG 路径；阶段 `drawing` / `encoding` / `saving`，权限失败保留可重试的临时路径。
- export-sheet props `show`, `pattern`, `busy`, `phase`, `retryPath`；events `close`, `save`, `retry`。

- [ ] editor 删除 hideTabBar 和 header back，保持 pages.json 原 tab 注册与 switchTab。工具栏使用真实 tab 页面底部位置及安全区，同页面板不伪造 tabBar。
- [ ] 图纸布局绘制白底、名称、宽高/实际色数/总豆数/方向、四边逐格坐标、细灰格线、每 5 格红线、每 10 格更粗红线和材料数量图例；标题与 24 色图例按测量边界布局。
- [ ] 输出格子使用固定 40px，Canvas 源尺寸和 canvasToTempFilePath 的 width/height/destWidth/destHeight 明确相同，不放大预览或隐式倍乘 DPR；传递组件作用域。
- [ ] editor 每次导出前取得有效 Native Canvas 节点并快照图纸。主按钮和材料按钮进入同一方向面板、导出锁和阶段反馈；导出期间不允许修改生成中的图纸。
- [ ] 保存成功回调才提示相册成功。权限失败提供用户主动打开设置后重试已有 PNG 的动作，取消不会误报成功；所有错误路径结束 loading。
- [ ] 导出默认正面，镜像明确为左右翻转且文字正向，不修改 cells/用量/完成行；保留高清 PNG 的临时结果用于重试。

**交付给用户的验收项：** Review Focus 4；点 tab / 修色返回 / 真机侧滑；实际相册 PNG 像素尺寸、色号可读性、四边坐标和非对称镜像。

## Task 4：跟拼手势与同页图纸详情

**Files:** 新增 viewport/pattern-viewer/pattern-detail；修改 bead-canvas/making/main。

**Interfaces:**
- `clampScale(value)` → 1..6；`zoomAround(pose, nextScale, anchor)` → `{ x, y, scale }`；`hitCell(point, pose, geometry, pattern)` → `{ row, column, index } | null`。
- pattern-viewer props `pattern`, `highlighted`, `completedRows`, `selectingRows`, `heightLimit`, `pose`；events `update:pose`, `select-row`, `inspect`。
- pattern-detail props `show`, `work`, `highlighted`, `selectingRows`, `pose`；events `close`, `update:pose`, `select-row`，原图按钮调用 Task 2 的 downloadImage。

- [ ] 基础 bead-canvas 增加受控显示宽度/可交互开关，保留 editor 单格修色事件，不让查看器与子画布同时选择行；codes 模式底图至少 24 像素/格，64×64 时为 1536×1536，不随每次手势重新匹配颜色。
- [ ] movable-area/view 作为可复用查看器，making 持有 `{ x, y, scale }` 并通过 pose/update:pose 与内联及全屏实例共享。原生双指缩放、单指移动、缩放百分比、±和复位；按钮以中心为锚，位置受控，打开详情不重置比例。
- [ ] 默认查看模式单击图纸发 inspect；显式「点图选行」模式才计算行号。多指或超过拖动阈值的手势不发点选；点选使用位移/缩放逆变换后的网格坐标。
- [ ] making 替换两档 zoom，保留行号选择、颜色高亮和逐行完成按钮。查看或拖动不会触发完成进度；修色仍 switchTab 返回 editor。
- [ ] 同页全屏详情包含清晰查看器、尺寸/色数/豆数/材料，以及有关联时的原图预览。关闭保留同一 work 和进度，不新增页面栈、不重置草稿。

**交付给用户的验收项：** Review Focus 5；iOS/Android 捏合、拖动边界、放大后选行、详情关闭、权限/断网下原图读取。

## Task 5：交付说明与开发状态

**Files:** 修改 README、采购指南；新增 `docs/local-backend-acceptance.md`；更新本计划进度和设计状态。

- [ ] README 默认架构改为 Node.js + MySQL，说明原图私有上传，uniCloud 仅保留历史资料；不声称新功能已通过真机或自动化验收。
- [ ] backend README 列出 .env 字段、初始化/启动命令和 action/图片接口、私有目录与备份位置；解释模拟器本机地址、手机局域网地址与正式 HTTPS 的区别。
- [ ] 采购指南删除本阶段不上传原图和 root 未恢复的旧描述；当前 ECS 不部署、OSS 不配置，明确未来私有 OSS 适配。
- [ ] 人工验收文档将前述各任务验收项分组，提供用户可自行运行的命令和设备步骤；写清这些命令本轮没有由代理执行。
- [ ] 交付代码变更、已实施的专用数据库配置、尚需填写的微信 AppSecret、用户启动方式。完成后明确说明「已开发，未运行测试或验证」，不输出伪造测试结果。

## 用户评审与执行方式

设计方案已获用户确认。用户已选择由当前会话直接开发，代理不做测试或验证；这个选择保持不变。

用户已批准实施。本轮 Task 1–5 的代码和配置实施已交付，进度记录见 `.superpowers/sdd/2026-10-08-nodejs-mysql-and-pattern-experience/progress.md`。微信 AppSecret 尚需填写；没有运行测试、构建、联调或真机验收，不能把实施状态当作验收通过。
