# 豆屿：本地开发与阿里云采购配置清单

更新日期：2026-10-08。本地 Node.js 后端代码、3306 专用数据库与前端接入已实施，按用户要求尚未测试或联调。本文的 ECS/OSS 部分仍是后续准备指南，不代表已经上线；价格、菜单和备案资格以实际账号当日页面为准。

## 一、先在电脑开发，不必等服务器

当前结构为 `uni-app → 本地 Node.js → 本地 MySQL`。原图登录后上传后端私有目录，本机完成转图与色号匹配；不做 uniCloud 数据迁移。

本机 3306 管理员登录此前已经恢复并冷备份；本轮已初始化 `bead_island` 和专用账号 `bead_island_app`，应用密码在 `backend/.env`。bless 的 `3307/myapp` 不变，没有再次重置 root 或修改钥匙串。

后端使用专用应用账号及必要表级权限，不使用 root。现在只需填写 `backend/.env` 的微信 AppSecret，再按 `backend/README.md` 启动；验收步骤见 `docs/local-backend-acceptance.md`。

开发配置需要：

| 参数 | 建议/用途 |
| --- | --- |
| MySQL host / port | `127.0.0.1` / `3306` |
| MySQL database | `bead_island` |
| MySQL user / password | 独立应用账号；密码只填本机环境文件 |
| 服务监听地址 / 端口 | `127.0.0.1` / `3001` |
| 微信 AppID | `wx0ebba69092706cc6` |
| 微信 AppSecret | 微信后台获取，仅放后端环境变量 |
| SESSION_SECRET | 本机生成足够强度的随机密钥；不写入前端 |

Node.js 生产环境选择受支持的 LTS；当前建议 Node.js 24 LTS。本机现有 Node.js 26 可以用于兼容性检查，但不能代替对目标生产版本的验证。[Node.js 版本说明](https://nodejs.org/en/about/previous-releases)

本地 HTTP 服务可以先通过终端验证。微信开发者工具可能因域名/HTTPS 校验阻止本机请求；官方支持临时开发调试选项，但不能把跳过校验写成正式发布设置。保持正式 `urlCheck` 开启。如果不希望临时调整开发工具，后续使用已备案域名的受控 HTTPS 测试入口。真机的 `127.0.0.1` 指向手机自身；局域网联调需同一网络、电脑局域网 IP 和专门的监听/防火墙设置。[微信网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

## 二、购买清单：现在需要什么

你已购买杭州 Ubuntu 24.04 ECS：2 vCPU / 2GiB / 40GiB / 3Mbps，公网 IPv4 121.41.36.64。本轮不操作这台服务器。可先用于低并发试运行，容量需用户实测；不因为下表推荐值就立即重复购买或升级。上线前仍需域名、备案、HTTPS、备份及安全配置。

| 项目 | 何时准备 | 推荐 |
| --- | --- | --- |
| 阿里云实名认证账号 | 现在 | 主体与将来备案主体保持一致，启用多因素认证 |
| ECS 云服务器 | 现在可采购 | 中国内地，2 核 4GB 起步，Ubuntu 24.04 LTS |
| 公网 IPv4 / 带宽 | 随 ECS | 固定带宽 3–5Mbps 起步 |
| 域名 | 现在 | 一个自己拥有的 `.com` 或 `.cn` 普通域名即可 |
| ICP 备案 | 服务器和域名齐备后 | 通过实际接入商办理；与微信小程序备案区分 |
| HTTPS 证书 | 域名可验证后 | API 证书；启用 OSS 域名时还需覆盖该域名 |
| MySQL | 本地已有；上线前配置 | 初期同一台 ECS 部署 MySQL，后期按需使用 RDS |
| OSS | 图片备份时；也可用于异机数据库备份 | 私有 Bucket、与 ECS 同地域 |
| 备份、日志与监控 | 上线前 | 离机备份、磁盘/内存告警、费用与证书到期提醒 |

暂时不要采购 Redis、CDN、负载均衡、Kubernetes、独立 NAT 网关或昂贵通配符证书。生产数据库不要连接你的个人电脑。

## 三、ECS 怎么选和怎么买

推荐 ECS，而不是传统虚拟主机：可以运行独立 Node.js 服务，后续方便配置 VPC、RAM 角色和 RDS。轻量应用服务器可以作为价格更低的备选，但本方案按 ECS 编写，购买前分别核对配置、续费和备案资格。

在 ECS 购买页面选择：

| 配置项 | 起步选择 |
| --- | --- |
| 地域 | 杭州、上海或深圳等适合主要用户分布的内地地域；无特别偏好可选杭州 |
| 计费方式 | 包年包月；计划做新备案时必须核对资源资格 |
| 购买周期 | 建议一年；预算有限则选满足备案资格的包月周期 |
| 实例 | 2 vCPU、4GB RAM；不优先选受 CPU 积分限制的突发型 |
| 操作系统 | 官方 Ubuntu 24.04 LTS 镜像 |
| 磁盘 | 60–80GB SSD 类系统盘；先不额外购买大数据盘 |
| 网络 | VPC、开通公网 IPv4、固定带宽 3–5Mbps |
| 登录方式 | SSH 密钥，私钥仅保存在你的设备 |
| 附加产品 | 按需选择；不默认勾选无关付费服务 |

假设初期并发较低且转图在手机本机完成。2 核 4GB 不是承载量保证；上线后根据 CPU、内存、连接数和响应时间升级。ECS 和 MySQL 共机不具备高可用能力，必须有离机备份。[ECS 创建指南](https://help.aliyun.com/zh/ecs/user-guide/create-an-instance-by-using-the-wizard)

阿里云当前备案资料对内地 ECS、包年包月购买周期和公网带宽有要求。不要仅凭“买了三个月”判断合格；购买前在备案资源校验中确认，建议一年购买以避免周期歧义，免费试用和按量实例不应直接当作合格备案资源。[备案资源要求](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)

核对订单的首购价、正常续费价、带宽计费、备份或快照附加费用；不以宣传优惠价作为固定长期预算。[公网带宽计费](https://help.aliyun.com/zh/ecs/public-bandwidth/)

## 四、域名、备案与 HTTPS

只需购买一个根域名，下面的子域名无需分别购买。以下 `example.com` 仅为示例，不能原样使用。

| 子域名 | 用途 | DNS |
| --- | --- | --- |
| `api.example.com` | Node.js API | A 记录指向 ECS 公网 IPv4 |
| `files.example.com` | 用户图片，启用 OSS 后使用 | CNAME 指向 OSS 控制台指定目标 |
| `www.example.com` | 以后需要官网时使用 | 当前不要求配置 |

顺序：购买域名 → 实名认证 → 准备合格 ECS → 提交 ICP 备案 → 配置 DNS → 部署 HTTPS → 配置微信合法域名。已有备案域名需要核对主体、接入商和接入备案要求，不等于必须再买一个域名。

域名备案与微信小程序备案是两项不同工作。微信 API 域名要求 HTTPS、ICP 备案，不能用公网 IP 或 localhost 代替；香港服务器不会免除微信的域名要求。[微信网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)

API 在 Nginx 部署证书和完整证书链，HTTP 跳转 HTTPS，配置自动续期和到期提醒。证书可以由可信 CA 签发，不需要为了 API 先买昂贵证书；若领取云厂商证书，需要核对有效期、是否收费及续签/重新部署方式，不能假设免费证书永久有效。OSS 自定义域名的证书要在 OSS 对应域名配置处部署，不能只给 Nginx 装证书。

## 五、安全组、部署和数据库

ECS 安全组和系统防火墙共同核对：

| 端口 | 对外规则 |
| --- | --- |
| 22 / SSH | 仅你的当前管理公网 IP，优先密钥登录 |
| 80 / HTTP | 网站入口、HTTPS 跳转及证书验证按需开放 |
| 443 / HTTPS | 对外开放 |
| 3001 / Node.js | 不对公网开放，仅由 Nginx 访问 |
| 3306 / MySQL | 不对公网开放，仅后端私网或本机访问 |

不要使用全端口开放规则，也不要为方便连接将数据库公开。[安全组配置](https://help.aliyun.com/zh/ecs/user-guide/start-using-security-groups)

上线按以下顺序执行，不需要现在在电脑安装云服务器环境：

1. 更新系统，建立非 root 部署账号，配置 SSH 密钥和必要权限。
2. 安装 Docker Engine / Compose，或选择原生 Node.js + systemd；只使用一种主要进程管理方案。
3. 初始化生产专用 MySQL 数据库和应用账号，设置持久化卷/目录、字符集和连接限制。
4. 配置后端环境变量，密钥文件不进版本控制、不放在可下载的静态目录中。
5. 运行后端，先验证进程健康、数据库就绪，再验证真实微信登录和作品增删同步。
6. 配置 API 域名解析、Nginx 反向代理和 HTTPS，确认 3001/3306 未暴露公网。
7. 设置自动重启、日志轮转、备份、磁盘/内存告警和证书提醒。
8. 配置小程序正式地址与合法域名，正式构建、真机验收后再考虑上传审核。

Docker 部署时，同一网络中的后端通过 MySQL 服务名连接数据库，不使用容器内的 `127.0.0.1` 连接另一个容器。只发布必要端口；数据库卷必须持久化。日常不直接挂载整个开发工作目录。

MySQL 数据库每天备份，保存到本机磁盘之外的受限位置，例如独立私有 OSS 备份 Bucket；设置保留周期，定期恢复验证。不要只备份到同一 ECS，也不要把有个人数据的 SQL 备份放公开 Bucket。若使用 RDS，则选择与 ECS 同地域的 VPC 内网连接与备份方案，不默认开公网连接。

## 六、OSS 怎么开通和配置

当前原图已由本地后端私有文件适配器接收，MySQL 保存原图 metadata、图纸和进度；OSS 不阻塞本地开发。以下是以后切换私有 OSS 的配置方案，本轮没有创建 Bucket 或配置 RAM 角色。

### 1. 创建 Bucket

进入 OSS 控制台，开通服务，创建 Bucket：

- 名称：全局唯一的小写名称，例如 `douyu-private-你的后缀`。
- 地域：与 ECS 一致，例如杭州；创建前确认，避免以后跨地域访问。
- 存储类型：标准存储；频繁访问图片不要一开始选归档。
- 冗余：根据可用选项与预算选择本地冗余或同城冗余；同城冗余提高可用性但不是误删除备份。
- 权限：私有，保持“阻止公共访问”开启。
- 初期不开传输加速、CDN、静态网站托管，也不启用会删除用户照片的全局生命周期规则。

私有权限限制匿名读写，但允许经过授权的访问；不能为了显示图片改成公共读写。[Bucket 权限说明](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)

### 2. 绑定文件域名和 HTTPS

建议直接规划 `files.example.com`：在 Bucket 的域名管理绑定 → 如要求则添加 TXT 验证所有权 → DNS 配置 CNAME 到控制台给出的目标 → 配置对应 SSL 证书 → 测试签名 URL。

不要把 `files` 的 A 记录指向 ECS 后又添加同名 CNAME，也不要随手填写一个与目标 Bucket 无关的 OSS Endpoint。内地 Bucket 绑定自定义域名要求域名已备案。[OSS 自定义域名配置](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)

阿里云官方英文文档仍列出新开通 OSS 账号在内地使用默认公网域名访问数据 API 的限制，而中文域名说明已采用不同表述。为避免按默认域名设计后遇到账号限制，本方案统一使用已备案的自定义域名 + HTTPS；实际可用范围以目标账号控制台与官方最新公告为准。[OSS 官方访问规则](https://www.alibabacloud.com/help/en/oss/user-guide/access-oss-via-bucket-domain-name)

### 3. 权限与上传流程

上线优先给 ECS 绑定 RAM 角色，后端获取临时凭证，而不是把账号永久 AK/SK 写进代码。角色权限限制为指定 Bucket 和所需前缀/动作，不使用管理员权限或 OSS 全权限作为应用默认权限。[ECS RAM 角色](https://help.aliyun.com/zh/ecs/user-guide/attach-an-instance-ram-role-to-an-ecs-instance)

图片直传的后续实现流程：用户已登录 → Node.js 校验身份并签发短时上传授权 → 小程序直传私有 OSS → Node.js 验证文件并记录归属 → 查看时签发短时下载 URL。数据库保存 objectKey、所属用户、大小和类型，不保存作为永久地址的短时签名 URL。[服务端签名直传](https://help.aliyun.com/zh/oss/user-guide/obtain-signature-information-from-the-server-and-upload-data-to-oss)

后续授权必须由服务器生成用户目录和不可猜测文件名，限制文件大小、类型、有效期和用户配额；不能让客户端随意指定其他用户路径。验证实际文件内容，不能仅信任扩展名或客户端 Content-Type。

小程序原生上传不是浏览器 CORS；如果以后增加 H5 直传，才为实际 H5 来源配置需要的 CORS 规则。CORS 不提供文件鉴权。防盗链配置需允许真实客户端所需请求，不能把 Referer 当作身份认证。

### 4. 费用与备份

OSS 费用需分别考虑存储容量、请求次数、外网下载流量以及可选图片处理/加速功能。存储包不能当作所有流量都已包月；先小量按量使用并设置预算提醒，再根据账单选择资源包。[OSS 定价](https://cn.aliyun.com/price/detail/oss)、[OSS 流量费用](https://help.aliyun.com/zh/oss/traffic-fees)

用户图片与数据库备份最好分开 Bucket/权限。按需启用版本控制并核对额外存储费用；备份对象生命周期只针对备份前缀，先确认保留策略再开启自动清理。

## 七、微信后台需要配置什么

| 项目 | 配置 |
| --- | --- |
| request 合法域名 | `https://api.你的域名` |
| uploadFile 合法域名 | 只有增加 OSS 直传时填写实际 HTTPS 上传域名 |
| downloadFile 合法域名 | 只有下载 OSS 文件时填写实际 HTTPS 文件域名 |
| socket 合法域名 | 当前后台不使用 WebSocket，不需要新增 |
| 隐私保护指引 | 按实际选图、保存相册能力声明；增加原图上传时更新处理目的和保存说明 |
| 小程序备案 | 在微信后台完成，不能用域名备案代替 |

`api.weixin.qq.com` 由后端访问，不能作为小程序直连域名；AppSecret 仅在后端。旧 HBuilderX 本机日志回显 socket 与新的业务 HTTP 服务是不同问题，不能为日志回显配置正式 socket 域名。

## 八、交接信息与验收清单

可告诉开发者的非敏感信息：ECS 地域和实例配置、系统版本、公网 IP、API 域名、备案状态、SSH 用户名、MySQL 地址/端口/库名/用户名、OSS Bucket 名称/地域/文件域名。私钥、密码、AppSecret、永久 AK/SK 和 SESSION_SECRET 均通过本机受限环境文件配置，不在聊天中发送。

- [ ] 本地专用数据库和账号可连接，不影响已有项目。
- [ ] 真实微信登录、保存、列表、进度更新和删除通过。
- [ ] 断网失败保留本机作品，分页和冲突处理通过。
- [ ] 生产 API 为备案域名的有效 HTTPS，正式构建不含本机地址。
- [ ] Node.js 和 MySQL 内部端口不对公网开放。
- [ ] 数据库有离机备份，已测试恢复。
- [ ] 服务器、域名、证书和 OSS 费用设置提醒。
- [ ] 原图默认不上传；以后启用上传时先完成权限、配额、隐私声明与签名访问验证。
