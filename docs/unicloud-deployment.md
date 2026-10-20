# 豆屿：支付宝云部署指南

前端为 uni-app Vue3，默认用 `uniCloud.callFunction`。已按用户确认的信息选择支付宝云（provider `alipay`），后端源已迁到标准目录 `uniCloud-alipay/`，云函数统一命名 **`bead-island`**，JavaScript 导出入口仍按官方规范为 `exports.main`。

| 配置 | 用户提供的值 |
| --- | --- |
| DCloud 应用 AppID | `__UNI__ACD00BD` |
| 支付宝云服务空间 ID | `env-00jy6xjkcc6q` |
| 微信小程序 AppID | `wx0ebba69092706cc6` |

这些 ID 不是部署凭据。目前没有提供微信 AppSecret、SESSION_SECRET，也没有在该空间完成登录、绑定、上传或云端联调；交付的是源码与本地测试，**不能宣称已经连云**。缺少配置时应继续保留本地作品，提示「云端同步尚未开启」。

## 1. 在 HBuilderX 绑定已确认的支付宝云空间

1. 打开 [uniCloud 控制台](https://unicloud.dcloud.net.cn/)，登录拥有目标空间的 DCloud 账号。在支付宝云列表中找到服务空间 ID `env-00jy6xjkcc6q`，进入空间详情，确认厂商、所属账号及空间状态。
2. 用同一账号登录 HBuilderX，打开本 uni-app Vue3 项目。前端 `src/manifest.json` 的 DCloud AppID 应为 `__UNI__ACD00BD`，微信小程序配置的 AppID 应为 `wx0ebba69092706cc6`；这两个字段不是同一个 ID。
3. 在项目管理器右键 `uniCloud-alipay` →「关联云服务空间或项目…」→「关联云服务空间」，选择支付宝云的 `env-00jy6xjkcc6q` 并确认。空间 ID 存在于文档中不等于 HBuilderX 已经关联成功。
4. 若列表没有这个空间，先核对账号和权限，不要选一个不同空间冒充。只有尚未拥有空间时才在控制台创建**支付宝云**服务空间；首次创建可能要求支付宝注册及实名认证。新空间会有自己的 ID，不能把它手填为现有 ID。套餐和费用以控制台当前显示为准。

若项目管理器没有关联菜单，可创建一个临时的空白 uni-app 上传工程，选择支付宝云，把本项目 `uniCloud-alipay/cloudfunctions` 与 `uniCloud-alipay/database` 复制到该工程的同名标准目录后绑定目标空间；Vue3 前端仍在本项目维护。

官方说明：单空间应用在 HBuilderX 关联后即可直接 `uniCloud.callFunction`，无需手写初始化。若另行选择手动 `uniCloud.init`，支付宝云还要求空间详情中的 `accessKey`、`secretKey`、`spaceAppId`；不能只凭 spaceId，也不能用 DCloud AppID 或微信 AppID 猜这些值。本交付不创建假的 `.spaceInfo` 或空间凭据配置。[服务空间关联与初始化](https://doc.dcloud.net.cn/uniCloud/concepts/space.html)。

## 2. 右键上传数据库和云函数

1. 在 `uniCloud-alipay/database` 右键上传所有 DB Schema，并上传／确认 `bead-works.index.json` 的索引。控制台中的集合名必须是 `bead-works`。
2. 确认组合唯一索引 `owner_clientId` 已建成：`owner` 升序、`clientId` 升序，支付宝云两列 Type 均为 `varchar`。
3. 在 `uniCloud-alipay/cloudfunctions/bead-island` 右键「上传部署云函数」。上传整个目录，包括 `index.js`、内层 `package.json`、`lib/` 和数据许可；不能只上传入口文件。
4. 控制台核对云函数名称为 `bead-island`，CommonJS 入口 `index.js`，Nodejs18、256 MB、15 秒超时。没有 npm 依赖。函数配置默认不设置 URL 化 path，callFunction 不需要 HTTP URL。

schema 的 `read/create/update/delete/count` 全部为 `false`，禁止公开客户端访问。服务端使用 `uniCloud.database()` 传统 API，该 API 不执行 schema 字段校验；字段校验与用户隔离由云函数完成。支付宝云的字段整体替换使用 `db.command.set`，范围分页使用 `db.command.gt`。[云数据库 API](https://doc.dcloud.net.cn/uniCloud/cf-database)、[DB Schema](https://doc.dcloud.net.cn/uniCloud/schema.html)、[支付宝云索引类型](https://doc.dcloud.net.cn/uniCloud/db-index.html)、[云函数运行时配置](https://doc.dcloud.net.cn/uniCloud/cf-functions.html)。

## 3. 配置云函数环境变量

已核查官方普通云函数文档，其中明确列出支付宝云的 callFunction 入参限制；官方统一环境变量文档提供控制台与 HBuilderX 的配置方法，并规定运行时从 `process.env` 读取，没有列出支付宝云排除项。本项目按这套 API 实现；实际目标空间中的配置是否成功仍需在上传后检查，不能用源码中的假秘密代替。[callFunction 官方说明](https://doc.dcloud.net.cn/uniCloud/cf-callfunction.html)、[环境变量官方说明](https://doc.dcloud.net.cn/uniCloud/cf-env-variables.html)。

在支付宝云 `env-00jy6xjkcc6q` 的「云函数／云对象」中打开 `bead-island` 详情，找到「环境变量」→编辑，设置并保存这三个值：

| 环境变量 | 应填的值 |
| --- | --- |
| `WECHAT_APPID` | `wx0ebba69092706cc6` |
| `WECHAT_APP_SECRET` | 此微信小程序的真实 AppSecret，仅云端保存 |
| `SESSION_SECRET` | 独立随机密钥，至少 32 字节；建议 32 随机字节的 64 位十六进制表示 |

也可在 HBuilderX **5.08+** 右键云函数 →「配置云函数环境变量」，选择并保存**远程值**。本地值用于本地调试，不能代替远程配置；编辑器可能在函数目录生成私有 `.env` 文件。`uniCloud-alipay/.env.example` 仅为占位符参考，不自动载入。本后端只读 `process.env`，不从前端、JSON 配置或示例文件读取秘密。

可以私下执行 `openssl rand -hex 32` 生成 SESSION_SECRET。不要把真实秘密放入客户端、公开源码、文档、截图或聊天，也不要把 AppSecret 复用为 SESSION_SECRET。三个变量缺失、AppID 不符、占位符或 session 密钥不足 32 字节时返回 `CLOUD_NOT_CONFIGURED`，不会请求微信或签发假登录。SESSION_SECRET 轮换后已有 token 失效。若当前账号／控制台无法配置变量，先解决权限与工具版本问题；保留未开启状态，不回退到明文密钥。

## 4. 默认使用 callFunction，配置微信 request 合法域名

在绑定好的 uni-app Vue3 项目中调用：

```js
const loginResponse = await uniCloud.callFunction({
  name: 'bead-island',
  data: { action: 'auth.login', payload: { code: wechatLoginCode } }
})
const login = loginResponse.result
if (!login.ok) throw new Error(login.error.message)

const listResponse = await uniCloud.callFunction({
  name: 'bead-island',
  data: { action: 'works.list', payload: { limit: 20 }, token: login.data.token }
})
const result = listResponse.result
```

`wechatLoginCode` 必须来自微信小程序平台上的真实 `uni.login`（微信登录），不是固定字符串或支付宝登录 code。云函数返回的业务 envelope 在 SDK 的 **`res.result`** 中；SDK 成功不等于业务成功，还要检查 `result.ok`。顶层 `data.token` 进入与 HTTP Bearer 相同的 HMAC 验证，不以 `context.appId`、SOURCE、spaceId 或客户端 owner 判断身份；此 token 也不是 uni-id 的 `uniIdToken`。网络 fail 保留 dirty，不显示保存成功。

callFunction 不需要 URL 化，但 SDK 自身仍有 request 域名。微信公众平台 →开发管理／开发设置／服务器域名，在 **request 合法域名** 中添加实际空间提供的域名。官方支付宝云默认格式为 `https://{spaceId}.api-hz.cloudbasefunction.cn`，据用户提供的 ID 可得 `https://env-00jy6xjkcc6q.api-hz.cloudbasefunction.cn`；这个地址只是按官方规则推导，未探测实际连通性，最终以控制台空间总览、HBuilderX 关联结果及实际 SDK 请求为准。无需为默认 callFunction 填 `cloudApiUrl`。本项目不上传原图，也不使用云存储；不必仅为作品同步添加云存储上传域名。[官方小程序发行域名表](https://doc.dcloud.net.cn/uniCloud/publish.html)、[支付宝云 request 域名](https://doc.dcloud.net.cn/uniCloud/request-custom-domain.html)。

## 可选：开启 HTTP URL 化

只有外部调用或明确选用 HTTP 适配器时，才在 `bead-island` 详情配置访问路径 `/bead-island`，复制控制台生成的完整 HTTPS URL。该 URL 不等于 callFunction SDK 域名，也不等于控制台地址。HTTP 使用 POST JSON `{action,payload}`，登录外带 `Authorization: Bearer <token>`；正文 token 不替代 HTTP Authorization。

如客户端另选 HTTP 请求方式，再把 URL 的域名加入微信 request 合法域名，并把完整 URL 填到前端 HTTP 配置的 `cloudApiUrl`；默认 callFunction 路径不依赖这个字段。返回集成响应带 `mpserverlessComposedResponse:true`，HTTP 正文才是 `{ok,...}`。HTTP 请求头名称和 Bearer scheme 大小写不敏感，支持规范 Base64 body。拒绝非 POST、查询参数、非 JSON、压缩正文、模糊／重复请求头和无效编码。[官方 URL 化说明](https://doc.dcloud.net.cn/uniCloud/http.html)。

## 业务合同与安全边界

| action | payload | 成功响应 data |
| --- | --- | --- |
| `auth.login` | `{code}` | `{token,expiresAt,userId}` |
| `works.list` | `{cursor?,limit?}` | `{items,cursor}` |
| `works.save` | `{work:{id,pattern,completedRows},baseRevision}` | `{work}` |
| `works.delete` | `{id,baseRevision}` | `{work}`，`deleted:true` |

两种入口业务响应都是 `{ok:true,data}` 或 `{ok:false,error:{code,message,details?}}`。callFunction 直接 return 此对象，由 SDK 包在 `res.result`。HTTP 使用状态码 200／400／401／405／409／413／415／500／503，并仍返回上述 JSON；HTTP 客户端必须读取非 2xx 的 error。

- 真实 `uniCloud.httpclient.request` 通过 HTTPS GET 请求微信 code2Session，5 秒超时、不跟随跳转。只取 openid 派生稳定 userId，不存储或回传 openid、session_key、unionid。token 为 HMAC-SHA256，7 天有效；`expiresAt` 是 Unix 毫秒，签名用 `crypto.timingSafeEqual` 校验，到期重新微信登录。
- 图纸精确字段 `{version:1,paletteId:'mard-221',name,width,height,beadSize,cells}`。宽高均为 1–64 整数，总格数≤4096，cells 为行优先平面数组且长度恰为宽×高，只含已知 221 个 MARD 色号或 null；珠径只能为数字 2.6 或 5。标题非空、不含控制字符，最多 60 个 Unicode 字符。只打包根目录 `data/mard.json` 的色号和许可。
- completedRows 是不重复的零基行号数组，范围 `0..height-1`，不是完成行数。ID 为 1–128 位 ASCII，首位字母／数字，其余允许字母、数字和 `._:-`；baseRevision 为 `0..Number.MAX_SAFE_INTEGER-1` 整数。解码后 HTTP 正文或序列化 callFunction 事件最多 65,536 字节。不接受客户端 owner、时间、私密字段或图片。
- 数据库 `_id = SHA-256(JSON.stringify([owner,clientId]))`，同用户同 ID 始终映射同一记录，跨用户同名 ID 独立。首存 baseRevision=0，使用原子 add 创建 revision=1；更新以 `_id + owner + clientId + revision` 作为同一次 where/update 的条件，不使用无条件 set/upsert。成功返回 id、pattern、completedRows、createdAt、updatedAt、revision、deleted，时间为服务器毫秒。
- 失败 `CONFLICT` 的 `error.details.work` 为当前用户的公开云端作品或 null。冲突不覆盖；先保留本机副本再决定使用云端版本，不自动用新 revision 覆盖重试。内部错误与微信／数据库异常只返回固定提示，不回传堆栈、密钥或原始上游错误。
- 删除增一 revision 后永久保留 tombstone 与原图纸／进度。相同删除的旧 baseRevision 或当前 tombstone revision 重试返回同一记录，不改变更新时间；更旧版本仍冲突。未上传 ID 用 baseRevision=0 删除也建立 revision=1 的 tombstone，不带 pattern，防止迟到首存复活。显式按 tombstone 当前 revision 保存可恢复。
- list 默认／最多每页 20 条，包括 tombstone，按稳定客户端 id 升序；cursor 是本页最后 ID，null 为结束，首次省略或用 null／空字符串。每次新同步从第一页开始。分页不是时间快照，插入到已过 cursor 前或更新前页的记录，在下次完整同步看到。

## 测试与上线验收

项目根目录执行：

```sh
node --test tests/backend-*.test.cjs
node --test --experimental-test-coverage tests/backend-*.test.cjs
```

测试为 Node.js 内置 node:test，建议 Node.js 18 或以上。业务测试注入换码、仓库与时钟，适配器测试用外部 API 替身检查请求参数和数据库原子条件；不需要真实秘密，也不会连接该支付宝云空间。本地成功不能代替真实环境验收。

绑定、上传、环境变量及微信合法域名完成后，在微信开发者工具和真机用真实 uni.login code 验证登录；两个微信账号验证隔离；并发相同 baseRevision 验证最多一份写入成功；分页确认 tombstone 可拉取；确认公开 clientDB 访问被拒绝。只有这些真实检查完成后才可称已完成云端联调。

## 本次交付文件清单

原 `uniCloud/` 的后端文件已全部迁到以下目录，旧目录已移除；本次未修改前端、根 package.json 或其他文档，也没有提交。

```text
uniCloud-alipay/.env.example
uniCloud-alipay/.gitignore
uniCloud-alipay/cloudfunctions/bead-island/index.js
uniCloud-alipay/cloudfunctions/bead-island/package.json
uniCloud-alipay/cloudfunctions/bead-island/lib/api.js
uniCloud-alipay/cloudfunctions/bead-island/lib/errors.js
uniCloud-alipay/cloudfunctions/bead-island/lib/http.js
uniCloud-alipay/cloudfunctions/bead-island/lib/transport.js
uniCloud-alipay/cloudfunctions/bead-island/lib/repository.js
uniCloud-alipay/cloudfunctions/bead-island/lib/session.js
uniCloud-alipay/cloudfunctions/bead-island/lib/validation.js
uniCloud-alipay/cloudfunctions/bead-island/lib/wechat.js
uniCloud-alipay/cloudfunctions/bead-island/lib/mard-codes.json
uniCloud-alipay/cloudfunctions/bead-island/lib/MARD-DATA-LICENSE.txt
uniCloud-alipay/database/bead-works.schema.json
uniCloud-alipay/database/bead-works.index.json
tests/backend-helpers.cjs
tests/backend-api.test.cjs
tests/backend-http.test.cjs
tests/backend-callfunction.test.cjs
tests/backend-adapters.test.cjs
docs/unicloud-deployment.md
```
