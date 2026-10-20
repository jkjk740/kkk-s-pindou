# 豆屿 · uni-app 微信拼豆小程序

奶油白与鼠尾草绿。前端 **uni-app / Vue 3 / Vite**，后端 **Node.js / Express / MySQL**。微信 AppID 为 `wx0ebba69092706cc6`，DCloud AppID 为 `__UNI__ACD00BD`。旧 uniCloud 目录仅作历史资料。

接手先读 [总交接文档（2026-10-20）](docs/HANDOFF-2026-10-20.md)。后端发布、数据迁移与回滚见 [阿里云发布手册](docs/ops/aliyun-publishing.md)，上传微信体验版见 [IP 体验版手册](docs/ops/ip-experience.md)。

## 本轮源码交付

- 首页为可搜索、最热/最新排序的双列图纸广场；每次查询 10 条，触底用游标继续加载，末页不足 10 条；新增卡片错峰向上入场并轻微回弹。
- 登录账号名称用于发布署名，发布页不填昵称；本人已保存的图纸可公开、更新、下架。
- 公开详情显示 MARD 用量、可缩放大图、正面/镜像高清 PNG 下载；相册成功后幂等累计下载数。
- 公共图纸可开始跟拼并生成自己的零进度作品；原图不公开，公开复制来源不能直接二次发布。
- 登录、确认、操作列表、加载反馈、toast、材料/修色/导出面板使用可复用自定义组件。
- 各页固定顶栏；我的作品精简为账号入口、筛选与双列卡片，移除本机/同步状态和手动同步按钮。
- 登录后私有上传原图、本机转图、MARD 221 色号、24–128 格、8–全部颜色、修色、2.6/5mm 与按行进度；新增非破坏性手动抠图、可选阿里云 AI 及高清分块导出，配置与用户验收见 `docs/cutout-and-detail-conversion.md`。
- 转图初始页仅显示拼豆背景和上传入口，不自动创建猫咪；导出打开自定义正面／左右镜像选择，包含预览、高清 PNG、进度及失败重试。验收和素材提示词见 `docs/editor-upload-export.md`。

**2026-10-19 部署记录：已将后端、九张 MySQL 表和 44 个图片文件部署到阿里云 ECS，结构、行内容及图片哈希校验一致。按用户确认启用临时 HTTP 入口 `http://121.41.36.64`；开发包与独立 IP 体验包均使用该入口，不依赖本机 SSH 隧道。正式 HTTPS、网站 ICP、OSS 图片域名与证书续期尚待完成；云端 AI 保持关闭。微信上传和手机业务验收尚未执行。这里记录历史结果，接手时需按授权复核实时状态。**

## 启动顺序

### 连接云端开发与 IP 体验版

本机开发专用 `.env.development.local` 当前为 `VITE_API_BASE_URL=http://121.41.36.64`，该文件不会提交。新电脑按 `.env.example` 创建自己的开发配置；修改 API 地址后完整重启编译。连接云端无需启动本机后端或数据库：

```sh
cd /Users/jkliang/Desktop/pindou
npm ci
npm run dev:mp-weixin
```

开发者工具导入 `dist/dev/mp-weixin`。邀请体验者时生成独立包：

```sh
npm run build:mp-weixin:experience-ip
```

上传目录为 `dist/experience-ip/mp-weixin`；每位体验者需在手机上开启调试。HTTP 会明文传输登录凭证与图片，仅作临时调试。普通正式构建仍要求 HTTPS 域名，不能直接使用此 IP 模式上线。

### 独立本机后端

需要本机开发时，使用 `127.0.0.1:3001` 和 MySQL `127.0.0.1:3306/bead_island`，不改其他工程的 3000/3307。保留现有 `backend/.env`，或由 `backend/.env.example` 私下配置凭据；已有数据库不要重跑初始化、清库或重置密码。确认本机库已具备所需结构后运行 `npm --prefix backend ci`、`npm --prefix backend run dev`，并将开发专用 API 改回本机地址。结构迁移按 [后端手册](backend/README.md) 单独执行，不作为日常启动步骤。

不要直接修改 dist。根目录普通 `npm start` 是旧浏览器设计原型，不是 Node.js API。详细本机与真机步骤见 [启动说明](docs/local-startup.md)。

## 异常与页面兼容

- 跟拼/详情缩放在固定尺寸画布内重绘，支持 100%–600%、居中复位、拖动与双指缩放；打开详情时卸载底层图纸画布，图纸区固定、用量列表独立滚动，避免重叠与遮挡。

- HTTP 客户端不在默认参数中访问 `uni`，避免编译后运行时未定义；区分超时、断网、服务错误和异常响应。
- 公共图纸列表、详情、发布与下载返回值经过校验；不将技术错误直接展示给用户，不让无效数据进入图纸渲染。
- 公共图片固定占位尺寸，含加载动画、缺省图和重试；刷新失败保留当前条件下已加载的卡片。
- 色卡在本机初始化，未打开的颜色弹层不会读取空对象；顶栏独立固定并校验安全区/胶囊尺寸。
- 表单输入框使用明确高度和横向内边距，创建/更多按钮居中；后端启动与就绪接口检查社区表结构，避免旧库却显示“就绪”。

## 数据与图片

初始化 10 份原创可跟拼图纸：在项目根目录运行 `npm --prefix backend run seed:community`。只连接本机 `127.0.0.1:3306/bead_island`，以独立作者「豆屿图纸」发布真实 MARD 图纸与 PNG 缩略图，不混入个人作品。命令可重复运行，不重复添加、不重置既有下载量；新增图纸计数从 0 开始。

原图保存在 `backend/data/private-images`，只允许所属账号鉴权读取。公开缩略图由服务端使用固定 MARD 色卡绘制，保存在 `backend/data/community-thumbnails`。MySQL 存用户名称、图纸、进度、图片 metadata、公开快照和下载确认意图，不存图片二进制。

登录有效时图纸/进度后台保存；本机内容在断网时仍可用。删除个人作品不自动下架公开快照，也不自动删除可能复用的原图。下载数是客户端报告的相册成功次数，不是完全防刷或独立人数统计。

正式公开运营前还需内容审核/举报、隐私指引、HTTPS/合法域名、网站备案、监控及离机备份。实际部署进展以 [发布手册](docs/ops/aliyun-publishing.md) 为准；`docs/nodejs-local-and-aliyun.md` 保留规划背景。

## 文档与源码

- `docs/HANDOFF-2026-10-20.md`：当前总交接入口，含功能、云端、数据库、待办与操作边界。
- `docs/ops/aliyun-publishing.md`、`docs/ops/ip-experience.md`：云端发布、迁移回滚和 IP 体验版步骤。
- `docs/community-manual-acceptance.md`：本次启动和用户人工验收清单。
- `backend/README.md`：配置、迁移、私人/社区接口与存储边界。
- `backend/sql/schema.sql`：新安装完整结构；`backend/sql/migrations/2026-10-09-community.sql` 为增量迁移。
- `src/pages/`、`src/components/`、`src/lib/`：uni-app 页面、共享弹层、图纸与 HTTP 客户端。
- `docs/superpowers/specs/2026-10-09-community-and-custom-ui-design.md`：已批准设计；同日期 plans 为实施计划。
- `docs/local-backend-acceptance.md`：此前后端/高清导出人工清单。
- `tests/`：保留既有测试；本轮未运行全量测试，不代表全部功能已通过验收。
- `uniCloud-alipay/`、旧部署文档、根目录浏览器原型：历史方案，非当前 API 依赖。

色卡来自 [HansBug/pindou-color-data](https://github.com/HansBug/pindou-color-data/tree/main/mard-221-github) 的公开参考数据。渲染颜色仅为屏幕近似，展示使用 MARD 代码，颜色以实体豆子为准。参考数据许可随 `src/data/MARD-DATA-LICENSE.txt` 和 `backend/src/MARD-DATA-LICENSE.txt` 附带。
