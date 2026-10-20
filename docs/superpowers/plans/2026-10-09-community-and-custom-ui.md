# 豆屿图纸广场与统一交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 用户已选择由当前会话继续开发；按用户要求不运行测试或验证，不提交 Git。

**Goal:** 将首页改为可搜索、按下载热度排序的公共图纸瀑布流，打通账号名称、发布、高清下载及跟拼，并统一自定义弹层、固定顶栏和简洁作品管理。

**Architecture:** 复用现有 Express / MySQL 后端、个人图纸协议、MARD 色卡和高清导出。新增独立社区仓储和公开衍生缩略图；客户端以共享 HTTP 适配、弹层宿主及后台保存协调器连接页面，不公开原图或改动既有账号隔离。

**Tech Stack:** uni-app Vue3、微信小程序、Node.js >=22.12、CommonJS Express 5、mysql2、Sharp；使用当前已安装版本，不增加 UI 或动画框架。

**Spec:** `/Users/jkliang/Desktop/pindou/docs/superpowers/specs/2026-10-09-community-and-custom-ui-design.md`

## Global Constraints

- 工作目录固定为 `/Users/jkliang/Desktop/pindou`；不新建分支，不提交，不改其他工程。
- 数据库仅为 `127.0.0.1:3306/bead_island`；API 默认本机端口 3001；不连接 bless 的 3307，不改管理员密码。
- 不运行测试、lint、构建、源码检查、健康检查、接口联调或 UI 验收；本计划的验收案例均交由用户执行。
- 首页面向图纸广场，没有「灵感」入口；保留发现 / 转图 / 色号 / 作品四个真实 tab。
- 账号名称在账号资料中设置，发布页不填写昵称；未设置名称的账号获得稳定默认名称。
- 公开图纸、材料和导出显示真实 MARD 色号，不显示 HEX；色值仅用于内部渲染。
- 个人原图和进度不公开；仅服务端已验证的本人图纸可发布。
- 所有业务确认、登录、提示、操作及加载界面为自定义组件；平台管理的系统授权不替换。
- 效果采用奶油白 / 鼠尾草绿 / 深森林绿，短文案、可点按区域至少约 44px。
- 下载量定义为相册保存成功后的幂等上报统计，不宣称后端能验证设备系统回调或完全防刷。
- 正式公开运营的内容审核、举报与上线配置不纳入本次本地实现，不默认部署公网。

## Review Focus

以下五类条件由各任务给出人工验收案例，不由代理执行：

1. 相同发布、更新、下架或下载确认并发重试：只得到一个帖子、一个一致快照或一次下载计数。
2. 登录取消、账号切换、会话过期：弹层能结束，旧页回调不能影响新页，私人图纸不跨账号混合。
3. 网络中断和发布前后台保存冲突：本机作品不丢，不把旧版本或未持久化内容发布成功。
4. 搜索 / 排序切换中旧分页响应到达：旧数据不能混入新列表；滚动不重播已显示卡片。
5. 特殊名称、非法色号、私人原图来源和长材料列表：输入受限，公开接口不泄漏原图，图纸仍显示真实豆子代码。

## File Structure

### 后端

- `backend/sql/schema.sql`：新安装的完整表结构。
- `backend/sql/migrations/2026-10-09-community.sql`：账号名称、社区图纸和下载意图的增量结构。
- `backend/scripts/migrate-community.cjs`：限定目标库的非破坏性迁移入口。
- `backend/src/profile.cjs`：账号名称校验及账号资料路由。
- `backend/src/community-validation.cjs`：发布、搜索、游标、意图参数和公共 DTO 边界。
- `backend/src/community-repository.cjs`：公开图纸、排序查询和下载事务。
- `backend/src/community-images.cjs`：使用固定色卡生成 / 读取社区 PNG 衍生图。
- `backend/src/mard-palette.json`：从项目现有 MARD 色卡复制的可信绘制数据，确保单独部署 backend 时不依赖前端目录。
- `backend/src/community.cjs`：社区 HTTP 路由和发布事务编排。
- `backend/src/repository.cjs`、`api.cjs`、`validation.cjs`、`app.cjs`、`errors.cjs`、`config.cjs`：集成资料、复制来源、错误类型和路由；原图片权限保持不变。

### 前端

- `src/lib/http.js`、`community.js`：统一 HTTP JSON 封装和公共图纸客户端。
- `src/lib/ui-controller.js`、`src/components/ui-host.vue`、`app-sheet.vue`、`app-dialog.vue`、`app-toast.vue`：共享业务弹层控制和渲染。
- `src/lib/auto-save.js`：后台个人作品保存调度与发布前持久化屏障。
- `src/lib/community-feed.js`：搜索作用域、分页去重和双列分配状态。
- `src/lib/community-downloads.js`：下载意图、成功确认及短期重试队列。
- `src/components/community-card.vue`、`community-gallery.vue`：可复用瀑布流卡片和列表。
- `src/pages/community/detail.vue`、`publish.vue`：公开详情和发布流程。
- `src/components/app-header.vue`、`export-sheet.vue`、`material-sheet.vue`、`pattern-detail.vue`：固定顶栏、简洁导出和豆子色号展示。
- `src/pages/home/index.vue`、`works/index.vue`、`editor/index.vue`、`making/index.vue`、`palette/index.vue`、`src/lib/cloud.js`、`storage.js`、`ui.js`、`src/App.vue`、`src/pages.json`、`src/styles/common.css`：接入共享组件和保存调度。

## Task 1: 账号名称和增量数据库结构

**Files:** `backend/sql/schema.sql`；新增迁移 SQL、迁移脚本和 `backend/src/profile.cjs`；修改 `backend/package.json`、`repository.cjs`、`api.cjs`、`app.cjs`、`validation.cjs`。

**Interfaces:**
- `repository.getProfile(owner) -> { displayName, needsName }`；首次缺省时持久化一个稳定「豆友」加随机短标识，只有本次补默认名返回 `needsName: true`，随后读取返回 false；名称面板可跳过，账号入口一直允许修改。
- `repository.updateProfile(owner, displayName, now) -> { displayName, needsName: false }`。
- `profileRoutes(app, { repository, authenticate, rateLimit })` 提供已登录的 `GET/PATCH /api/profile`。
- `auth.login` 响应保留原令牌字段，补充 `profile: { displayName, needsName }`。
- 社区表定义采用 `bead_public_works` 和 `bead_public_downloads`；私有作品增加可空 `origin_public_id`，保存复制来源后不允许同一作品清除该来源。

- [ ] **Step 1:** 写增量 SQL：为用户增加 `display_name`，为私人作品增加 `origin_public_id`；建立公开快照、作者 / 源作品唯一约束、热门 / 最新索引和下载意图唯一约束。保留现有原图外键与数据。
- [ ] **Step 2:** 写迁移脚本及 `migrate:community` npm 入口，执行前必须确认配置指向本机 3306 的 `bead_island`；用元数据判断已存在的字段和表，允许重跑，不清库，不回显管理凭据。脚本本轮由用户运行。
- [ ] **Step 3:** 实现账号资料方法和路由，名称按 Unicode 字符计数限定 1–24，去首尾空白、拒绝控制字符；发布请求不能覆盖账号名称。
- [ ] **Step 4:** 登录响应补充资料；私人作品协议增补复制来源，客户端与服务端归属仍由既有 HMAC 令牌确定。复制来源不得作为私人原图关联。

**用户验收案例:** 老账号首次登录不丢已有作品，默认名重启后不变化；名字的空白、控制字符、emoji 和长度边界按约定处理；同一迁移重跑不清数据；未登录不能修改资料。

## Task 2: 图纸发布、搜索、受控缩略图

**Files:** 新建社区校验、仓储、缩略图、`mard-palette.json` 及路由模块；修改后端 `app.cjs`、`config.cjs`、`errors.cjs`。后端固定色卡来源为项目现有 `src/data/mard.json`，将所需可信颜色数据随 backend 保存，不接受客户端颜色表。

**Interfaces:**
- 发布输入 `{ sourceClientId, sourceRevision, title }`；`sourceClientId` 对应个人协议中的 `work.id`，仅后端解析为数据库主键。
- `communityRepository.publish(owner, input, snapshot, thumbnail, now) -> PublicDetail`；`update(owner, id, input, snapshot, thumbnail, now) -> PublicDetail`；`withdraw(owner, id, now) -> { id, withdrawn: true }`。
- `communityRepository.list({ query, sort, cursor, limit }) -> { items: PublicItem[], cursor: string|null }`；`get(id) -> PublicDetail|null`。
- `PublicItem = { id, title, author: { name }, width, height, colorCount, beadCount, thumbnailUrl, downloadCount, publishedAt }`；`PublicDetail` 增加公开 `pattern` 和可选作者管理状态，不含原图、私有 ID 或进度。
- `communityImages.create(pattern) -> { storageKey }`、`read(storageKey) -> PNG`、`removeTemporary(storageKey)`；不读取原图目录。
- `communityRoutes(app, { repository, communityRepository, communityImages, config, authenticate, rateLimit })` 挂载 spec 中公共作品 CRUD 和 thumbnail 路由。

- [ ] **Step 1:** 实现严格输入和公共 DTO：标题 1–50 Unicode 字符，搜索最多 50，分页最多 20，排序仅 `hot/latest`，游标绑定查询与排序；图纸继续校验最多 64×64 和 MARD 白名单。
- [ ] **Step 2:** 实现参数化作品 / 作者名称搜索和排序查询；热门按下载量、发布时间、ID 降序，最新按发布时间、ID 降序。公开作者名称读取用户当前资料。
- [ ] **Step 3:** 从已校验图纸生成固定上限尺寸的 PNG 缩略图，使用现有 Sharp 和受控服务端绘制数据，创建社区独立目录；成功后才切换文件引用，失败只清理本次临时衍生文件。
- [ ] **Step 4:** 发布从当前 owner 的已保存作品读取内容，拒绝删除作品、版本不匹配或带公开复制来源的作品；只复制允许公开的图纸字段，并锁定同一作者 / 源作品以避免并发重复帖子。
- [ ] **Step 5:** 相同内容重复 POST 返回既有结果；已发布且请求内容不同返回 `ALREADY_PUBLISHED` 与本人可用的公开作品 ID，客户端经明确确认后调用 PUT；更新保留下载量，下架保持幂等，访客读取下架内容返回 404。
- [ ] **Step 6:** 集成路由、限流和安全错误，不开放私有上传目录；缩略图只由当前仍公开的作品 ID 访问。

**用户验收案例:** 并发重复发布不多一份；旧 revision 不发布；他人不能更新 / 下架；复制来的图纸不能直接二次发布；特殊搜索符号不会变成任意 SQL；任一公开响应不含原图或私有字段；改账号名后搜索和署名更新。

## Task 3: 下载意图与原子统计

**Files:** `backend/src/community.cjs`、`community-repository.cjs`、`community-validation.cjs`、`errors.cjs`。

**Interfaces:**
- `createDownloadIntent(publicId, now) -> { id, token, expiresAt }`，有效期 `600000ms`。
- `confirmDownload(publicId, { id, token }, now) -> { id: publicId, downloadCount, counted }`。
- 前端不得提交数量；游客可申请 / 确认，但接口限制频率。数据库仅存随机确认凭据的摘要，不存明文会话或 IP。

- [ ] **Step 1:** 为仍公开的作品建立随机意图和确认凭据，设 10 分钟过期时间；申请限流设为每来源每分钟 20 次，确认每分钟 60 次，沿用现有限流器。
- [ ] **Step 2:** 实现事务确认：锁定意图与作品，检查归属、凭据、下架和过期状态；首次完成时原子加一，已完成的同一确认返回 `counted: false` 和当前总数。
- [ ] **Step 3:** 按有限批次清理已过期未完成意图，保留作品总计数；新接口返回无敏感字段的规范错误。

**用户验收案例:** 取消选方向、拒绝权限、编码失败不调用成功确认；同一凭据并发确认只加一；过期、错作品 ID、伪凭据和已下架都不新增；列表最热可反映确认后的数量。

## Task 4: 统一弹层、HTTP 接口与固定导航

**Files:** 新增 `src/lib/http.js`、`ui-controller.js` 与四个共享弹层组件；修改 `ui.js`、`cloud.js`、`app-header.vue`、`pattern-detail.vue`、各现有页面及 `common.css`。

**Interfaces:**
- `httpRequest({ path, method = 'GET', data, token }) -> data` 解析既有 envelope；不在公开请求中自动要求登录。
- `cloud.authorizedRequest({ path, method, data }) -> data` 复用原令牌刷新和账号隔离；资料方法 `getProfile()/updateProfile(displayName)`。
- `uiController.open(route, { kind, ...options }) -> Promise<answer>`；`subscribe(route, callback) -> unsubscribe`；`dismiss(route)` 结束本页未完成业务请求。
- `ui.js` 保留 `toast`、`showError`、`confirmAccount`、`selectPersonalImage`；新增 `confirm(options) -> boolean` 和 `showActions(actions) -> selected|null`，现有调用点不再直调原生业务弹层。
- `app-header` 保留 title / brand / back props，增加 `height-change` 事件；渲染固定导航和等高占位，CSS 变量 `--app-header-height` 表示测量总高度。

- [ ] **Step 1:** 写统一 HTTP 与已登录适配，补充资料响应缓存，公开访问不携带过期令牌触发登录弹窗，令牌只发给配置的本项目后端。
- [ ] **Step 2:** 写路由作用域的弹层控制器和页面宿主，确保取消 / 离页 / 重入均能结束 Promise，反馈层不阻塞正常页面点击。
- [ ] **Step 3:** 实现共享 sheet、dialog、toast 与宿主内 loading；微信登录成功后按需设置账号名称，可跳过保留后端默认名；作品页账号入口复用名称面板。
- [ ] **Step 4:** 替换所有既有业务原生 showModal / showToast 调用，包括删除；现有材料、修色、导出面板统一外壳、圆角和关闭行为，系统相册授权保持平台流程。
- [ ] **Step 5:** 固定共享顶栏并测量占位，处理窗口变化；覆盖现有五页和新社区页，详情层关闭保留手势位置，遮罩打开禁用底层查看器。
- [ ] **Step 6:** 简化导出面板为「下载图纸 / 正面 / 镜像 / 保存到相册」，保留错误、忙碌、权限重试；材料只展示颜色、MARD 代码和颗数，移除面向用户的 HEX 文案。

**用户验收案例:** 登录取消不会打开选图；切页后上页确认不改新页；过期刷新只进行一次；顶栏滚动固定；弹层不穿透画布；相册权限拒绝和自定义错误均有可关闭 / 重试入口。

## Task 5: 自动保存及精简我的作品

**Files:** 新增 `src/lib/auto-save.js`；修改 `storage.js`、`cloud.js`、`src/App.vue`、作品 / 转图 / 跟拼页；补充 backend 私人协议的公开复制来源。

**Interfaces:**
- `createAutoSave({ repository, syncWorks, getSession }) -> { schedule(), flush(), stop() }`；调度仅处理当前账号且仅有一个进行中的同步。
- `ensureWorkSaved(id) -> { work, revision }`：发布前持久化屏障；完成同步后重新读取此作品，必须 `dirty === false` 且未删除，否则返回可重试错误。
- `repository.subscribe(callback) -> unsubscribe`：本地 save / remove 成功后通知调度器，远端 merge 不制造无限反馈循环。
- `originPublicId` 仅表示图纸复制来源，随私人作品同步，不清除、不对外暴露，也不继承公开作者进度。

- [ ] **Step 1:** 为本地仓储添加变更订阅和复制来源字段保留，已有离线作品读取不做破坏性迁移；本次存储失败不发出已保存反馈。
- [ ] **Step 2:** 实现 500ms 合并调度、单任务串行、在途变更再次排队及最多 1s / 2s / 4s 的短期退避；无登录态不静默登录，网络恢复或再次显示触发新重试。
- [ ] **Step 3:** 接入 App、登录完成、作品页及网络恢复生命周期；继续使用既有 CAS / tombstone / 冲突副本逻辑，发布屏障不允许冲突的旧内容冒充最新已保存版本。
- [ ] **Step 4:** 作品页改为账号入口、三类筛选、双列卡片和新建入口；移除统计大卡、同步卡、同步按钮、逐卡保存位置字样，更多面板提供查看 / 导出 / 发布 / 删除。
- [ ] **Step 5:** 保存、修色及跟拼进度进入同一调度；作品列表重新显示时读取实际仓储；已发布作品删除时确认说明需单独下架，不自动删除私有原图。

**用户验收案例:** 断网仍能保存和继续拼；恢复后无需手动同步；连续完成行不会被旧确认覆盖；后台冲突时发布阻止旧快照；账号变化不混库；保存卡片不出现「本机已保存」或「同步作品」。

## Task 6: 广场、公开详情与发布完整流程

**Files:** 新增客户端社区 / feed / downloads 模块、社区卡片 / gallery 组件、detail / publish 页面；替换 `home/index.vue`，修改 `pages.json` 和作品页入口。

**Interfaces:**
- `community.list({ query, sort, cursor, limit })`、`get(id)`、`publish({ sourceClientId, sourceRevision, title })`、`update(id, input)`、`withdraw(id)`、`downloadIntent(id)`、`confirmDownload(id, intent)` 对应 Task 2 / 3 的 DTO 与路由。
- `createFeedState() -> { reset({query,sort}), append(scopeId,items,cursor), columns, cursor, scopeId }`：旧作用域不能追加，公开 ID 去重；下一张放入估算较短列。
- `communityDownloads.begin(publicId) -> intent`、`complete(publicId,intent) -> latestCount`、`retryPending()`：保存相册成功后记录短期确认队列，重试不重新保存图片。
- 公共详情 route 参数为公开 `id`；发布 route 可选 `workId`。用户名称只读取 profile，无作者编辑字段。

- [ ] **Step 1:** 写社区客户端、搜索 250ms debounce 和分页状态；原首页整体替换为固定搜索 / 排序、双列图纸广场、发布入口与原四 tab。
- [ ] **Step 2:** 卡片采用自然图纸比例，限定过度狭长图的显示高度，透明背景用奶油底；新列表 / 新增批次在 24px → -4px → 0px、约 280ms 入场，45ms 错峰且总延迟最多 200ms，历史卡片不重播；组件提供 `reduceMotion` 开关，开启时直接落位，并在平台支持时响应系统减少动画偏好。
- [ ] **Step 3:** 实现详情读取、MARD 用量、放大查看、作者下架操作和底部开始拼 / 下载；公开复制清空原图及进度，保留 originPublicId，进入自己的新作品。
- [ ] **Step 4:** 详情复用现有 `saveExport` / `savePngToAlbum` 和正面 / 镜像面板：意图申请成功后导出，只有相册保存成功才确认；编码 / 权限失败保留重试路径，同一次保存确认复用原意图。
- [ ] **Step 5:** 发布页登录后选择本人非公开复制来源的作品、输入标题、调用 Task 5 保存屏障再发布；重复点击禁用，已有帖子用共享确认面板明确更新，无昵称表单。
- [ ] **Step 6:** 在页面展示时重试尚未过期的下载确认，确认成功只更新对应卡片数量，不突然重排旧 feed；过期队列停止重试，不反复提示或制造文件重复。

**用户验收案例:** 快速改搜索 / 排序不混入旧结果；续页无重复卡，左右列不是对齐网格；游客可下载而发布要求登录；正面 / 镜像文字均正向；下载量仅在成功后增加；图纸查看器缩放不闪；发布无昵称且显示登录名称。

## Task 7: 启动和人工验收交付

**Files:** `backend/README.md`、`docs/local-startup.md`；新增 `docs/community-manual-acceptance.md`，记录本次源码与数据库迁移边界。

- [ ] **Step 1:** 更新首次迁移和服务启动说明，准确给出 `npm --prefix backend run migrate:community`、`npm --prefix backend run dev` 和 `npm run dev:mp-weixin`，保留本机合法域名调试与正式 HTTPS 配置的区分。
- [ ] **Step 2:** 写用户人工验收清单，逐项覆盖本计划 Review Focus 和批准 spec 的十项验收；说明无账号名称时的一次资料设置、下载次数定义及内容审核上线准备事项。
- [ ] **Step 3:** 交付源码改动清单与未执行项；明确「代码已写入，未运行测试、构建或验证；迁移脚本由用户执行」，不把未运行的开发产物或接口描述为已验收。

## Execution Handoff

书面设计已批准；本实施计划待用户阅读确认。保留已选择的执行方式：由当前会话使用 `superpowers:executing-plans` 按任务顺序开发，不另开任务，不运行测试或验证。

计划确认前不安装依赖、不写产品代码、不运行迁移、不启动或重启服务。计划确认后对新增后端、前端与文档进行开发；数据库迁移和微信构建由用户按交付说明执行。
