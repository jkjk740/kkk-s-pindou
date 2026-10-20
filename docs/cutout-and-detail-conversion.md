# 抠图与精细转图

## 本轮能力

- 原图独立保留。上传照片默认 64 格、32 色；大小支持 24 / 32 / 48 / 64 / 80 / 96 / 128，颜色支持 8 / 12 / 16 / 24 / 32 / 48 / 64 / 全部 MARD 221 色。
- 不再根据左上角颜色删背景，白色主体不会被这个旧阈值误删。少色模式采用感知配色；全部模式匹配完整参考色卡，实际用量只包含用到的色号。
- 转图页面「抠图」进入独立编辑页：圈选保留、保留／擦除画笔、移动、缩放、撤销重做、按住对比。智能结果只能明确应用；复杂背景或卡通图用手动修正。
- 原图归一化到最长边 1024。编辑的是独立灰度选区；确认后原图透明度与选区相乘。确认返回后转换成功才替换当前草稿及重置进度；取消不改变旧作品。
- 高清整张／64 格分块、正面／左右镜像。128 方格分块为四张。整图自适应分辨率，最长边不超过 4096，总像素不超过 1200 万；分块每格 40 px，包含全局坐标及各块材料用量。
- 相册中途失败继续未保存页，不重新保存已成功页；公开下载只在全部保存后确认一次。下载量依然是客户端报告，非防刷的独立人数。
- 本机作品采用不可变记录与小索引，保留旧 v1 数据。40 份及 5 MiB 内容预算；索引失败不替换旧数据。原图和抠图临时路径不写入作品存储。

## Aidge 智能抠图接入（2026-10-17 更新）

旧视觉智能开放平台的 `SegmentCommonImage` 已停止新用户开通，本项目改用 Aidge `ImageMatting`（2026-04-28 API）。官方 Node SDK 为 `@alicloud/aidge20260428`，固定北京 HTTPS 端点、透明背景、不指定目标宽高，保持现有输入图的坐标。原图仍保存在本机私有目录，前端接口和手动修边流程沿用现有实现，无需数据库迁移。

### 云端准备

1. 在 [Aidge 控制台](https://ecoa.console.aliyun.com/) 开通智能抠图，确认试用额度／用完即停和实际计费设置。配置完整不代表服务已开通或权限已验证。
2. 专用 RAM 用户需要 Aidge 调用权限。当前官方系统策略 `AliyunAidgeFullAccess` 包含整个 Aidge 产品的权限；只做抠图时可使用 `aidge:ImageMatting` 自定义最小权限。
3. 创建私有 OSS Bucket，标准存储，不开公共读、不启用传输加速；临时工作副本仅写入 `douyu-cutout-tmp/`。只对这个前缀授予 `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`。不要授予整个 OSS 的管理权限。
4. 为这个临时前缀设置创建 1 天后删除的生命周期规则，作为请求结束清理失败时的保底；不要对其他目录或既有原图设置清理。生命周期清理非实时，签名 URL 独立地在 5 分钟后到期。
5. 新开通中国内地 OSS 的账号可能受默认公网域名的数据 API 限制，须绑定已备案的自定义域名及 HTTPS 证书，并完成 DNS CNAME 配置。此时配置 `CUTOUT_OSS_ENDPOINT=https://实际绑定的域名`、`CUTOUT_OSS_CNAME=true`。不能靠把 Bucket 改成公共读解决该限制。境外／香港地域的选择另行确认，不能为了本机调试自动改变用户图片的存放地域。

### 后端本地配置

只修改 `backend/.env`，保留已有数据库／微信配置。AccessKey ID 和 Secret 必须来自同一对凭证，只保存在后端本地文件中（0600），不要粘贴进聊天、文档、前端或提交到 Git。

```dotenv
CUTOUT_AI_ENABLED=false
ALIBABA_CLOUD_ACCESS_KEY_ID=专用RAM的AccessKeyId
ALIBABA_CLOUD_ACCESS_KEY_SECRET=同一对凭证的AccessKeySecret
CUTOUT_OSS_BUCKET=实际创建的私有Bucket名称
CUTOUT_OSS_REGION=oss-cn-shanghai
CUTOUT_OSS_ENDPOINT=
CUTOUT_OSS_CNAME=false
CUTOUT_DAILY_LIMIT=10
CUTOUT_QUEUE_LIMIT=8
```

云端配置齐全后再将 `CUTOUT_AI_ENABLED` 改成 `true` 并重启后端。缺少凭证、Bucket、地域或有效的自定义端点时，智能识别不可用；手动工具继续可用。

### 图片处理与费用边界

- 用户点击「智能」并确认后才排队，图片不会因为上传而自动调用 Aidge。微信隐私保护指引需要如实说明阿里云处理和临时云存储。
- 后端将最长边 1024 内的工作副本合成白底 JPEG，去除元数据后临时上传；原图 RGB 和透明度不被修改。新版 API 的保守输入限制为最短边至少 256，过小或过窄的图片留给手动工具，不静默缩放或裁剪。
- OSS 使用 V4 签名、对象 ACL 为 private、禁止覆盖，每次仅创建随机 UUID 对象；生成 5 分钟的 HTTPS GET 签名 URL，供 Aidge 获取。不把用户原图目录公开，不向小程序暴露云凭证或厂商签名 URL。
- 结果必须是同尺寸、单帧、带 alpha 的 PNG；仅提取 alpha 为不透明灰度蒙版，再接入现有选区流程。尺寸不同不强行 resize，避免画笔和蒙版错位。
- 结果下载仅接受受限的上海 OSS 域名并固定到校验后的公网 IPv4；官方 HTTP 示例链接只升级到 HTTPS，绝不回退明文或跟随重定向。限制下载字节与解码像素。
- 每次暂存结束清理本次对象；异常时不输出密钥、完整 SDK 错误或签名 URL。没有自动重试、没有失败后回退旧接口的二次计费调用。保留每日每用户 10 次、队列和 request UUID 幂等限制。

参考：[新版 ImageMatting API](https://help.aliyun.com/zh/aidge/api-aidge-2026-04-28-imagematting)、[Aidge 鉴权](https://help.aliyun.com/zh/aidge/authentication-method)、[OSS V4 初始化](https://help.aliyun.com/zh/oss/initialization-10)、[OSS 默认公网域名限制](https://help.aliyun.com/zh/oss/publicendpointforbidden-error-when-upload-object)。

本轮仅进行源码／配置接入，不自动执行测试、接口联调或真实 AI 调用。当前云端开通与实际调用状态以交付说明为准。

## 启动与数据

本次 Aidge 替换不改表结构，已有本机库不要重复初始化或执行迁移。下面迁移命令仅供尚未安装过抠图表的环境参考；日常只启动后端和前端编译。

目标仅为 `127.0.0.1:3306/bead_island` / `bead_island_app`，不操作 bless／3307。已存在的表不清空、密码不重置。

```sh
cd /Users/jkliang/Desktop/pindou
npm --prefix backend run migrate:cutout
npm --prefix backend run dev
```

另一个终端：

```sh
cd /Users/jkliang/Desktop/pindou
npm run dev:mp-weixin
```

迁移复用 `~/.local/etc/mysql/private/root-client.cnf`，可重复运行。新库执行完整 `backend/sql/schema.sql`，已有库执行增量迁移。私有资源在 `backend/data/private-images`，所有读取和抠图接口校验当前登录账号。原图、工作副本、遮罩、结果都计入现有 100 MiB 配额。备份时数据库与私有目录一起备份。

本后端目前按单实例部署，勿启用 PM2 cluster／多副本；启动恢复会把未完成的 processing 标为 interrupted，不自动重收识别费用。 queued 任务继续。任务请求 UUID 幂等，每人一个未完成任务，默认每天 10 次、一个执行和 8 个排队。关闭或重启时已发出的厂商请求未必能物理撤回，但不自动重新发起。数据库提交状态不确定的最终文件不盲目删除，避免丢掉已提交资源。

## 私有接口

全部使用 Bearer session：

- `GET /api/cutout/capabilities`：可用工具。
- `GET /api/images/:id/cutout-input`：原图对应规范工作副本。
- `POST /api/images/:id/cutout-tasks`：`{ requestId }`，不自动重试付费请求。
- `GET /api/cutout-tasks/:id`：任务状态，ready 后只返回私有 mask ID。
- `POST /api/images/:id/cutouts`：multipart `mask` PNG、`inputImageId`、`requestId`，单个文件 ≤2 MiB、必须同尺寸、不透明灰度且非空。
- `GET /api/cutouts/:id`：私有输入、遮罩、结果引用。
- 图片继续 `GET /api/images/:id/content` 鉴权下载。

公开图纸只存格阵快照，不暴露作者的任何原图／遮罩 ID。

## 用户验收（代理不运行）

新增与调整的用例仅编写，**未执行，不代表通过**。用户可运行：

```sh
node --test tests/client-conversion-detail.test.cjs tests/client-work-store.test.cjs tests/client-cutout-mask.test.cjs tests/client-cutout-session.test.cjs tests/client-export-plan.test.cjs tests/client-export-session.test.cjs tests/backend-cutout-contract.test.cjs tests/backend-cutout-repository.test.cjs tests/backend-cutout-images.test.cjs tests/backend-cutout-provider.test.cjs tests/client-cutout-integration.test.cjs
```

人工重点：白猫复杂背景、透明／EXIF 原图、圈选跨边缘、保留还原原色、快速画笔、双指接入、电脑移动、缩放锚点、撤销 20 步、AI 迟到后手动选区不被覆盖、隐藏再返回、取消和确认网络失败、重开已保存作品、跨账号私有读取、128 格／全部色号、原图恢复、断网保留图纸、容量不足保持旧作品、四张镜像全局坐标、第 3 张保存失败续存及最终下载计数。

不会代发真实收费 AI 调用或代验收相册；真实主体识别需完成以上云端配置，并由用户发起验收。

## 2026-10-09 历史交付状态

- 已执行本项目增量迁移，前端开发编译完成，后端开发服务监听 `127.0.0.1:3001`。微信开发工具当前项目已打开；没有为了更新而重启或清空正在编辑的选区。
- 未开通阿里云服务或未填写后端凭据时，智能识别不可用，不伪造识别结果；手动圈选和画笔不需要 AI 开通。
- 自动依赖安装报告提示 1 项高危安全建议，尚未执行额外审计或强制升级。上线前需要排查对应依赖及影响；这不属于已通过的验证项。
- 自动用例、真机手势、相册导出和真实收费识别均留给你测试；开发编译成功不代表这些场景已经验收。

## 2026-10-17 Aidge 接入状态

- 已替换后端供应商代码、安装官方 Aidge/OSS SDK、准备私有暂存与蒙版适配，并从用户下载的 CSV 将同一对凭证写入仅后端可读的本地配置；源码和文档不保存实际密钥。
- 已完成 OSS ¥0 服务开通，并创建私有 Bucket `douyu-cutout-20261017-7f3a`，地域为 `oss-cn-shanghai`，使用标准存储、LRS、AES256 服务端加密并阻止公共访问。
- 生命周期规则 `douyu-cutout-tmp-1d` 已启用，仅处理 `douyu-cutout-tmp/` 前缀，按最后修改时间满 1 天后删除。规则生效与后台清理存在延迟，不保证在精确 24 小时后删除；请求结束仍会尝试清理本次对象。
- 自定义 RAM 策略 `DouyuCutoutTempOSSAccess` 已创建并绑定至 `douyu-aidge`，仅允许上述 Bucket 的 `douyu-cutout-tmp/` 前缀执行 `oss:PutObject`、`oss:GetObject`、`oss:DeleteObject`，不含 List 或管理权限；原有 `AliyunAidgeFullAccess` 保留。策略文件为 `docs/ops/douyu-cutout-oss-policy.json`，其中的 Bucket 名与实际创建名称一致。
- RAM Beta 摘要曾提示无效授权，原因未经证实。源策略 ARN／Actions 与官方语法相符且绑定成功，但尚未通过真实请求验证上传、读取和删除权限，不能据此宣称授权实测成功。
- 域名 `tpejocq.cn` 已完成实名，ICP 备案尚未完成；SSL、OSS 自定义域名绑定及业务 DNS CNAME 均未配置。
- 已打开免费自助备案的基础信息校验表单，填入域名并按用户选择切换为个人；省市区、证件与身份信息由用户直接填写，尚未提交备案申请。现有杭州 ECS 已只读核对为运行中、包年包月、3 Mbps 公网带宽，创建于 2026-10-08、到期于 2027-10-08；是否可绑定该备案订单仍以后续服务器校验结果为准，未另购或续费服务器。
- 后端本地配置已填写实际 Bucket 与地域，`CUTOUT_OSS_CNAME=true`、`CUTOUT_OSS_ENDPOINT` 仍为空、`CUTOUT_AI_ENABLED=false`。自定义 HTTPS 端点尚未就绪，智能识别继续关闭；待备案及域名配置完成后再由用户决定启用和验收。
- 已编写对应离线用例，按用户约定未运行测试、lint、接口探针、真实上传或 AI 请求，不能视作云端接通或识别质量验收通过。

## 2026-10-19 备案进度

- 根据用户提供的备案进度截图：2026-10-17 12:54 提交审核，2026-10-17 16:33 阿里云初审通过，2026-10-18 16:30 提交管局，2026-10-18 22:53 工信部短信核验通过。
- 当前为管局审核中，页面预估 7 个工作日；预估不代表承诺通过日期，页面同时提示最长 20 个工作日。当前无需重复提交短信核验或备案订单，留意审核来电、短信及补充资料通知。
- 公安联网备案区域显示待通信管理局审核通过，已授权的数据码需管局审核通过后生成；尚不能记录为公安备案完成。
- HTTPS 证书可提前准备；上海 OSS 的自定义域名绑定和正式域名访问需等待 ICP 备案完成。后续顺序为确认备案成功、绑定 OSS 域名、配置其业务 CNAME 与 HTTPS、填写后端端点，再安排用户授权的实际验收。
- 本次仅更新操作记录，未申请证书、变更 DNS、部署服务、启用 AI 或发起真实请求。

### 2026-10-19 后续：微信备案确认与证书签发

- 用户提供的微信通知显示小程序已于 2026-10-10 通过管局审核，通知 AppID 与当前项目一致。无需重复办理小程序备案；网站域名备案仍等待阿里云该订单的管局审核结果。
- 已通过 Let's Encrypt DNS-01 正式签发 `api.tpejocq.cn` 和 `img.tpejocq.cn` 的独立证书，证书链、域名及私钥匹配已核对成功。到期时间为北京时间 2027-01-17，具体时间及仓库外私有文件路径见 [HTTPS 证书操作记录](ops/https-certificates.md)。
- 本次创建的两条 `_acme-challenge` TXT 验证记录已清理，DNS 控制台核对为 0 条记录；未添加业务 A/CNAME。
- 当前只完成证书签发，尚未部署 ECS／OSS HTTPS、配置业务 A/CNAME 解析或开启智能抠图。手动 DNS 验证模式尚未自动续期，正式部署时须补齐续签与证书更新。
