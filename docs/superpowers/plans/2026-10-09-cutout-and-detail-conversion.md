# AI 抠图与精细转图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Steps use checkbox syntax for tracking. The user retains test execution and acceptance; do not create branches or commits.

**Goal:** 交付阿里云主体识别＋非破坏性手动抠图，以及 128 格／完整 MARD 221 色的保存、跟拼、广场和高清导出兼容。

**Architecture:** 原图、工作副本、灰度遮罩和透明结果分别存储，由 owner 鉴权关联；抠图会话只在确认成功后提交当前草稿。Node.js 管理幂等 AI 任务和私有资源，小程序负责可撤销的画笔／圈选编辑。统一提高转换与验证限制，使用分键作品仓库和有预算的整图／分块导出。

**Tech Stack:** uni-app Vue3、微信 Canvas 2D、Node.js >=22.12、Express 5、MySQL 8、sharp、阿里云官方 imageseg Node.js SDK。

**Spec:** `docs/superpowers/specs/2026-10-09-cutout-and-detail-conversion-design.md`

**Execution record:** `docs/superpowers/plans/2026-10-09-cutout-progress.md` records delivered code, review fixes and startup evidence separately from the unexecuted acceptance checklist below.

## Global Constraints

- 当前会话、当前工作目录实施；不建立 worktree、Git 分支、提交或外部任务。
- 不运行测试、lint 或真机验收；先写回归用例，交给用户运行。允许安装正式依赖、迁移本项目数据库、编译及启动更新。
- 本机目标严格限定 `127.0.0.1:3306/bead_island`，数据库用户为 `bead_island_app`；不操作 bless／3307，不重置密码。
- AI 为可选配置，未开通或未配置时不能阻止上传、手动抠图、转图和广场运行；不替用户开通、购买或接受服务协议。
- 自定义弹层与提示；不新增 uni.showModal／uni.showToast；固定顶栏／工具栏，编辑器保留 tabBar。
- 最大长边 128、最大格数 16384、完整 MARD 221 色；图纸 version=1、paletteId=mard-221。
- 同步请求统一上限 262144 字节，其他请求限制不扩大；广场仍每次最多 10 条。
- 工作副本最长边 1024；手动遮罩最多 2097152 字节、1024² 像素，尺寸必须匹配输入，原图 alpha 与遮罩相乘。
- 默认 AI 并发 1、队列 8、每人 1 个未完成任务／每天 10 次；厂商 60 秒超时，客户端查询最多 90 秒。
- 画布长边最多 4096、总像素最多 12000000；分块最多 64×64 格、40 像素／格，逐张保存和释放。

## Review Focus

- 同一请求的并发重放、任务重启及确认重试不能重复付费、重复存文件或关联其他用户资源。
- AI 迟到、返回／切 tab、放弃或确认转换失败，不能覆盖当前草稿、手动画笔、已保存图纸及跟拼进度。
- 原图带方向信息或透明像素时，工作图、灰度遮罩、点击坐标和恢复原图必须一致。
- 本机旧作品迁移／容量不足／索引写入失败不能造成旧作品丢失或其他账号作品混入。
- 128 格／221 色的镜像分块、失败续存与公开下载计数必须保留全局坐标并且只确认一次完整下载。

## 文件职责与交付顺序

1. 转换限制与感知配色：`src/lib/conversion-limits.js`、`src/lib/color-quantization.js`、`src/lib/pattern.js`；后端集中限制在 `backend/src/conversion-limits.cjs`。
2. 本机作品分键持久化：`src/lib/work-store.js`；`storage.js` 保留现有仓库接口和冲突语义。
3. 数据持久化：`backend/src/cutout-repository.cjs`、增量 SQL／迁移脚本及作品 cutoutId DTO。
4. 图片处理：`backend/src/cutout-images.cjs`；任务与厂商适配分别位于 `cutout-service.cjs`、`cutout-provider.cjs`，路由在 `cutout.cjs`。
5. 手动遮罩：`src/lib/cutout-mask.js`、`cutout-geometry.js`、`cutout-session.js`；Canvas 绘制位于 `cutout-renderer.js` 和独立工具组件。
6. 页面与事务：`src/pages/cutout/index.vue`、编辑器集成、私有客户端和保存恢复。
7. 高清导出：`export-layout.js`、`export-plan.js`、`export-session.js`、`render.js`、共享 export-sheet 与调用页面。
8. 回归说明、配置说明、一次只读审查、更新迁移／开发启动交付。

每一步的自动测试都只编写，不由代理执行；用户验收命令记录在最终开发说明。不得将未运行用例标记为通过。

## Task 1：转换范围与配色算法

**Files:** 新建 `src/lib/conversion-limits.js`、`src/lib/color-quantization.js`、`backend/src/conversion-limits.cjs`；修改 `src/lib/pattern.js`、`src/lib/community.js`、`backend/src/validation.cjs`、`backend/src/app.cjs`；新增 `tests/client-conversion-detail.test.cjs` 并调整 `tests/client-pattern.test.cjs`、`tests/backend-api.test.cjs` 中旧边界断言。

**Interfaces:**
- 前端常量：`MAX_GRID_EDGE=128`、`MAX_GRID_CELLS=16384`、`MAX_PALETTE_COLORS=221`、`GRID_SIZES=[24,32,48,64,80,96,128]`、`COLOR_LIMITS=[8,12,16,24,32,48,64,221]`。
- 后端限制模块提供相同三个上限及 `MAX_BODY_BYTES=262144`；回归用例比较两端上限，不引入前端对后端源码的运行时依赖。
- `selectPalette(image, palette, maximum)` 返回已存在的 MARD 色对象数组；`convertRgba(image,palette,options)` 保持原签名和 pattern 格式。

- [ ] 先写用例：128×128／221 色有效，129 边或 16385 格无效；所有色号须已知；白色不因 `removeBackground` 被删除；全部颜色不会硬凑 221 色；少色模式输出不超所选上限。
- [ ] 实现感知色差、带权代表色选择和最多 4 次优化；全部模式匹配完整色表。移除按左上角颜色删背景的分支，只使用源 alpha 判定空格。
- [ ] 扩大所有客户端、后端与广场边界，256 KiB 请求解析和业务上限统一；原有登录／发布接口的小请求限制保持不变。
- [ ] 写用例：小面积高对比色在足够色数下不被单纯频率截断；透明像素不参与配色；旧图纸仍读写；新的同步体超过 64 KiB 但不超过 256 KiB 可处理，超限拒绝。

## Task 2：分键作品存储与容量保护

**Files:** 新建 `src/lib/work-store.js`；修改 `src/lib/storage.js`、`src/lib/auto-save.js`；扩展 `tests/client-storage.test.cjs`、`tests/client-revision.test.cjs`。

**Interfaces:**
- `createWorkStore(platform)` 返回 `readAll()` 和 `writeAll(records)`；仓库现有 save／all／list／find／mergeRemote／acknowledge／forkConflict 接口不变。
- 工作记录支持可空 `cutoutId`；内容摘要和发布前快照比较包括该字段。临时 sourcePath／cutoutPath 不持久保存。

- [ ] 先写用例：旧 v1 键可读；新记录按作品写入；索引失败仍读到原作品；新版重启后内容和 cutoutId 完全一致。
- [ ] 实现每作品不可变存储键与单个小索引：先写记录，再原子切换索引，索引成功后才处理已无引用的版本；旧键不先删除。校验索引及记录形态，损坏不静默变空库。
- [ ] 继续限制 40 个未删除作品，并在完整写入前计算缓存预算（作品总序列化数据最多 5 MiB）；预算或系统写入失败保留旧版本，给自定义错误提示。
- [ ] 扩展用例：128² 作品、容量不足、部分写入失败、dirty 合并、冲突副本、同步 scope 和账号切换保持现有语义。平台缺少存储清理 API 时仍可读写，不崩溃。

## Task 3：抠图模型、增量迁移与作品引用

**Files:** 新建 `backend/sql/migrations/2026-10-09-cutout.sql`、`backend/scripts/migrate-cutout.cjs`、`backend/src/cutout-repository.cjs`；修改 `backend/sql/schema.sql`、`backend/package.json`、`backend/src/repository.cjs`、`backend/src/api.cjs`、`backend/src/validation.cjs`、`backend/src/readiness.cjs`；新增 `tests/backend-cutout-repository.test.cjs`，更新既有 mock repository fixture。

**Interfaces:**
- `createCutoutRepository(pool)` 提供 `getInput(owner,sourceId)`、`saveInput(owner,sourceId,imageId)`、`getCutout(owner,id)`、`findConfirmation(owner,sourceId,requestId)`、`saveConfirmation(owner,input)`。
- 任务接口：`findTask(owner,requestId)`、`enqueueTask(owner,input,limits,now)`、`claimTask(id)`、`finishTask(id,{maskImageId,errorCode},now)`、`getTask(owner,id)`、`findReadyMask(owner,inputImageId)`、`recoverInterrupted(now)`。
- `bead_cutout_inputs` 存储唯一的 owner／原图／处理版本工作副本映射，是规格中「核验工作副本匹配原图」的具体落点；`bead_cutouts` 和 `bead_cutout_tasks` 按设计文档建表。
- 作品 DTO、CAS 插入／更新及保存校验携带 `cutoutId`，默认 null；关联必须匹配 owner 和 sourceImageId。

- [ ] 先写用例：旧 DTO 默认 null；未知或其他用户的 cutoutId 拒绝；抠图原图不匹配拒绝；正常保存、列表和冲突响应保留引用。
- [ ] 编写增量迁移和新库 schema；唯一索引覆盖 owner／原图工作副本、owner／requestId 的任务及确认。每日配额和每人未完成任务在锁定用户的事务中校验，不做仅进程内计数。
- [ ] 迁移脚本复用现有管理员配置读取，严格核对 127.0.0.1／3306／bead_island；可重复运行，不打印凭据，不重建或清空现有表。
- [ ] 实现任务 CAS 认领、失败记录和中断恢复；任务错误只记录预定义代码。写用例验证幂等键请求内容不一致被拒绝、重复确认不产生新记录、事务失败不留下错误引用。

## Task 4：规范化图片、灰度遮罩与私有结果

**Files:** 新建 `backend/src/cutout-images.cjs`；对 `backend/src/repository.cjs` 增加批量派生图片事务能力，必要时扩展 `backend/src/storage.cjs`；新增 `tests/backend-cutout-images.test.cjs`。

**Interfaces:**
- `createCutoutImages({storage,repository,limits})` 提供 `prepareInput(owner,sourceImage)`、`readMask(owner,maskImageId)`、`compose(owner,inputImage,maskPath)`、`saveMask(owner,inputImage,buffer)`。
- prepareInput 返回 `{imageId,width,height}`；compose 返回 `{maskImageId,resultImageId,width,height}`。上传确认持久化前的文件归属由调用者明确提交或回滚，不能误删可能已提交的文件。

- [ ] 先写用例：带 EXIF 旋转、alpha 原图、最长边 1024、同尺寸灰度遮罩、原 alpha×覆盖率；恢复保留区域从原工作图读取，不填白色。
- [ ] 使用 sharp 正规化工作源与 mask，限制解码像素和文件大小；严格拒绝不透明灰度规范以外的用户遮罩、尺寸不匹配、动画图和全空选区。
- [ ] 批量写派生图片时锁定用户并校验总配额，完成文件提交与数据库关联；失败清理临时文件，持久化状态不确定时不自动删除最终文件。
- [ ] 写用例：错误 MIME、伪装 PNG、过大数据、文件提交失败、配额不足、存储中断及重复确认；现有原图下载行为不变。

## Task 5：阿里云适配、幂等任务服务与鉴权路由

**Files:** 新建 `backend/src/cutout-provider.cjs`、`backend/src/cutout-service.cjs`、`backend/src/cutout.cjs`；修改 `backend/src/config.cjs`、`backend/src/app.cjs`、`backend/src/server.cjs`、`backend/src/errors.cjs`、`backend/.env.example`、`backend/package.json`；新增 `tests/backend-cutout-provider.test.cjs`、`tests/backend-cutout-service.test.cjs`、`tests/backend-cutout-http.test.cjs`。

**Interfaces:**
- `createCutoutProvider(config,{request,fetchResult}={})` 提供 `configured()`、`segment(inputPath,{width,height}) -> grayscale PNG Buffer`；允许测试注入，不在生产配置里提供假成功。
- 使用官方 `@alicloud/imageseg20191230` 及其 OpenAPI／Runtime／credentials 依赖；选择受支持版本后锁定 lockfile。通过 Advance 文件流上传，参数 `ReturnForm=mask`，固定上海 endpoint，禁用自动付费重试。
- `createCutoutService({config,pool,repository,storage,provider,clock})` 提供 `capabilities()`、`input(owner,sourceId)`、`start(owner,sourceId,requestId)`、`task(owner,id)`、`confirm(owner,sourceId,{inputImageId,requestId,maskPath})`、`cutout(owner,id)`、`close()`。
- 路由按 spec 实现五个端点；补充 GET `/api/cutouts/:id` 返回当前用户已确认的 input／mask／result 引用，供重开编辑与恢复工作源，不返回任意路径或厂商 URL。

- [ ] 先写用例：AI 开关关闭或凭据缺失时 capabilities 正确、其他服务启动正常，智能任务返回精简不可用错误；手动确认不要求 AI 凭据。
- [ ] 安装官方 SDK 并实现适配器：输入转换为合法 RGB JPEG，3 MB／尺寸边界检查，最多 60 秒，校验厂商返回形态，HTTPS OSS 结果下载拒绝跳转／内网和过大文件。记录错误代码，不打印签名 URL 或凭据。
- [ ] 实现串行队列、持久幂等和默认限制；缓存初始 AI 遮罩；后台任务不得覆盖已确认遮罩。服务关闭停止领新任务；重启处理中的任务标记中断，禁止自动重收费。
- [ ] 挂载鉴权路由，限定确认文件为一张 mask（2 MiB）与规范字段。配置使用 `CUTOUT_AI_ENABLED`、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET` 及限额；敏感值不进入前端。无凭据为安全不可用，损坏非空配置给明确服务错误。
- [ ] 写用例：跨 owner 读取、每日配额、9 个排队任务、同用户并发、幂等重放、厂商超时／重启、恶意结果 URL、伪造输入引用、HTTP 返回不泄露原图路径。

官方 SDK 接入依据：[Node.js SDK 文件流上传](https://www.alibabacloud.com/help/en/sdk/developer-reference/v2-nodejs-integrated-sdk)。实现前核对所安装 SDK 的导出和 Advance 请求字段，不猜测函数名称。

## Task 6：纯遮罩、坐标变换和撤销历史

**Files:** 新建 `src/lib/cutout-mask.js`、`src/lib/cutout-geometry.js`、`src/lib/cutout-session.js`；新增 `tests/client-cutout-mask.test.cjs`、`tests/client-cutout-session.test.cjs`。

**Interfaces:**
- `createMaskEditor({width,height,values,historySteps=20,historyBytes=8388608})` 提供 `values()`、`beginStroke()`、`paint(points,radius,keep)`、`endStroke()`、`lasso(points)`、`apply(values)`、`undo()`、`redo()`、`status()`；值数组为 Uint8Array，0～255。
- `fitImage(image,viewport)`、`toImagePoint(point,pose,geometry)`、`zoomImage(pose,scale,anchor,geometry)`、`clampImagePose(pose,geometry)`；图像坐标只从一个 pose 计算。
- `createCutoutSession({draftId,sourceImageId,cutoutId})` 提供当前会话版本和 candidate，应用迟到结果前检查身份与编辑版本；取消不改变全局 draft。

- [ ] 先写用例：半径画笔、连续快速笔画、画布边界、闭合多边形、多个相连区域、还原原值、撤销／重做，以及 21 步和 8 MiB 上限淘汰最早历史。
- [ ] 实现笔画差分和扫描线圈选，不对每个触摸点复制全图；圈选不足三个点不更改。AI apply 作为可撤销的整体操作，但需显式确认覆盖当前编辑。
- [ ] 实现固定视口内的缩放／平移及点映射，范围 1～8 倍；单指编辑与双指交接时终止已有笔画，不把第二根手指接成画线。
- [ ] 写用例：缩放锚点不跳、拖动后位置正确、边缘约束、旧会话及手动修改后的 AI 结果不能自行应用。

## Task 7：抠图 Canvas 工具、私有客户端与页面

**Files:** 新建 `src/lib/cutout-api.js`、`src/lib/cutout-renderer.js`、`src/components/cutout-workspace.vue`、`src/pages/cutout/index.vue`；修改 `src/pages.json`、`src/lib/cloud.js`、`src/lib/errors.js`；新增 `tests/client-cutout-api.test.cjs`、`tests/client-cutout-page.test.cjs`。

**Interfaces:**
- 客户端：`capabilities()`、`prepareInput(sourceId)`、`startTask(sourceId,requestId)`、`getTask(taskId)`、`getCutout(cutoutId)`、`confirmCutout(sourceId,{inputImageId,requestId,filePath})`；图像下载复用现有 downloadImage。
- `pollCutoutTask(taskId,{isCurrent,onStatus,deadlineMs=90000})` 在离页、超时或终态停止，不隐式发起新任务。
- workspace props：`inputPath,maskPath,width,height,tool,brushSize,compare`；提供 `exportMask()`、`applyMask(path)`、`undo()`、`redo()`、`zoom(delta)`、`reset()`，发出 change／history／pose 事件。
- 页面的返回值通过 App 内的一次性会话结果（含 sourceImageId、cutoutId、resultImageId、会话 token）交给编辑器，不能直接替换编辑器图纸。

- [ ] 先写用例：未配置 AI 展示手动工具；取消登录／放弃修改／页面隐藏停止查询；元数据或下载损坏不生成错误选区；初次智能操作弹自定义第三方处理提示。
- [ ] 绘制原工作图、棋盘格、遮罩、轮廓、笔刷和放大镜；所有内容裁切到固定视口，画笔按需合成，轮廓空闲时才动。工具离页释放定时器、图片与临时像素缓存。
- [ ] 实现智能／圈选／保留／擦除、移动模式、画笔大小、撤销重做、1～8 倍按钮／双指操作、按住对比原图、确认与恢复原图；顶部和底部按实际安全区布局。
- [ ] 确认先输出规范灰度 PNG 并提交后端，成功结果作为候选返回；失败留在页面、保留画笔和 requestId 重试。没有明确应用时，迟到 AI 结果只显示「识别完成，可应用」。
- [ ] 写用例：原生相册／登录切回生命周期、空遮罩、第二根手指、电脑移动模式、确认过程中重复点击、离页后下载迟到、已存遮罩重开不触发计费。

## Task 8：编辑器确认事务与保存／恢复联动

**Files:** 修改 `src/App.vue`、`src/lib/draft.js`、`src/lib/cloud.js`、`src/pages/editor/index.vue`、`src/pages/making/index.vue`、`src/components/pattern-detail.vue`、`src/pages/works/index.vue`；扩展 `tests/client-editor.test.cjs`、`tests/client-cloud.test.cjs`，新增 `tests/client-cutout-integration.test.cjs`。

**Interfaces:**
- 新照片 draft 默认 `size=64,maxColors=32,cutoutId=null`；原图 path／id 不变。
- `sourcePixels(size,draft)` 先取 cutout 工作源（有 cutoutId 时），其次原图，最后现有主动示例源；保留主体 alpha，基于可见边界紧凑居中取景并留一格空白，透明全空拒绝。
- 一次性 cutout 会话结果经 `consumeCutoutResult()` 下载、转换候选成功后提交；匹配原 draft／source 身份，否则丢弃。

- [ ] 先写用例：抠图取消、结果下载失败、转换失败、草稿被换图及用户退出后迟到响应都不覆盖旧图纸或进度；成功才清空进度。
- [ ] 移除去底色开关与原颜色阈值调用，增加抠图／恢复原图入口和全部新档位；保留已保存作品原来的格数与色数。
- [ ] 完成候选转换事务，原图预览继续展示上传照片；恢复原图同样先转换成功后清除 cutout 引用，不依赖透明结果恢复 RGB。
- [ ] 保存、重新打开、同步 CAS、冲突副本及跟拼均保留 cutoutId；公开下载仅携带公开图纸，不能携带作者私有源引用。
- [ ] 写用例：新照片默认值、128 格所有档位、221 色、空输入、已上传透明图片、已抠图改变尺寸不丢遮罩、旧 removeBackground 作品不自动重新生成。

## Task 9：高清整图／分块导出与断点续存

**Files:** 新建 `src/lib/export-plan.js`、`src/lib/export-session.js`；修改 `src/lib/export-layout.js`、`src/lib/render.js`、`src/components/export-sheet.vue`、`src/pages/editor/index.vue`、`src/pages/community/detail.vue`、`src/lib/community-downloads.js`；新增 `tests/client-export-plan.test.cjs`、`tests/client-export-session.test.cjs`，扩展 `tests/client-editor-export.test.cjs`。

**Interfaces:**
- `createExportPlan(pattern,palette,{mirror=false,format='full'})` 返回页面描述数组 `{pattern,layout,block:{row,column,rows,columns,startRow,startColumn},mirror}`；full 为一页，tiles 为每块最多 64²。
- `createExportLayout` 支持按总预算选择整图 cellSize 和材料列数；保留旧 40 px 图的正常输出，最多 4096 边／12000000 像素。
- `createExportSession({pages,renderPage,savePage,onProgress})` 提供 `run()`、`retry()`、`status()`；已成功保存的页不再保存，失败文件保留供权限恢复，修改方向／格式才重置会话。

- [ ] 先写用例：128²／221 色仍满足画布预算；分块共 4 张且格子恰好覆盖一次；横／竖长图、空格、镜像、块边界、全局坐标和块材料数量正确。
- [ ] 实现先全局镜像再切块，渲染文字不反向；分块不单独重配色。整图自适应像素和图例，分块每格 40 px、适配块材料列数，确保预算不是只检查格阵。
- [ ] 自定义导出层增加整图／分块和预估张数；save 事件携带 mirror／format，忙碌时禁用方向／格式；预览仍使用普通 image，不叠原生 Canvas。
- [ ] 顺序生成和保存，释放上一页，提供「第 N／总张数」进度；失败仅重试未完成页。拒绝权限时继续现有自定义设置入口，不丢方向／文件／已完成页。
- [ ] 公共图纸所有页保存成功后才调用 downloads.complete 一次；中途失败不计数，计数重试保持现有幂等规则。写用例验证第 3 页失败后只保存第 3、4 页，确认只触发一次。

## Task 10：审查、部署准备与启动交付

**Files:** 新建 `docs/cutout-and-detail-conversion.md`，更新 `README.md`、`backend/.env.example` 和本计划状态。

- [ ] 完成一次全链路只读代码审查，重点按 Review Focus 检查；不让审查者运行测试，不触碰凭据。修复本范围内的阻断问题，记录无法由静态审查确认的真机行为。
- [ ] 写阿里云开通／RAM 后端配置指南、额度配置、可选 AI 状态与私有图片流程；不填用户凭据、不替用户开通、不发起真实收费 AI 调用。
- [ ] 写用户验收命令及操作列表，明确所有新增测试未执行，包含卡通图手动兜底、白色主体、复杂背景、离线、跨账号、128 格和分块相册等场景。
- [ ] 用户批准执行本计划后，迁移只运行 `npm --prefix backend run migrate:cutout`，目标限制在本机 bead_island；失败则保留原配置和服务，不转去 bless 或另一端口。
- [ ] 完成 uni-app 开发编译、更新本项目后端服务与微信开发工具；只在没有用户未保存草稿时重启小程序。有草稿则保留并说明新工具在下次打开可用。
- [ ] 交付时分别汇报代码／编译／启动状态与用户尚需完成的阿里云配置和真机验收，不把未配置 AI 或未运行用例说成通过。

## 计划自审与执行交接

规格章节 1～4 对应任务 6～8；数据与接口章节 5～6 对应任务 3～5；精细转换和存储章节 7 对应任务 1～2、8；预览与导出章节 8 对应任务 7、9；职责与准备事项章节 9～10 对应文件分工与任务 10；验收章节 11 分散到各任务用例并汇总到开发说明。

本计划补充了实现必须的两项明确接口：工作副本原图关联表，以及重新进入抠图所需的私有 cutout 元数据 GET；不增加公开原图能力或新的商业服务。

执行方式沿用用户已指定的当前会话由我实施，最后一次只读审查。请用户审阅本实施计划并确认其覆盖需求；确认之前不开始产品代码、安装依赖或数据库变更。
