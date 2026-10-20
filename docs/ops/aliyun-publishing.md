# 豆屿：阿里云后端发布与本机小程序连接

## 当前部署记录（2026-10-19）

后端、数据库和图片已部署到 ECS，用户已确认启用 `http://121.41.36.64` 临时公网入口，用于需手机开启调试的 IP 体验版。本机开发地址也已切到该公网入口；正式域名 HTTPS 仍待网站备案及后续配置。本页保存已执行记录和后续发布步骤，微信上传与体验成员设置见 [IP 体验版手册](./ip-experience.md)。

| 项目 | 已确认的状态 |
| --- | --- |
| ECS | 杭州 `i-bp1g06vyjlzxo0ac510z`，公网 `121.41.36.64`，Ubuntu 24.04.5 x86_64 |
| 基础软件 | 已安装 MySQL 8.0.46、Nginx、Node.js v24.22.0；Node 官方下载包已核对 SHA-256 |
| 数据库 | 已在新环境导入完整九张表及本地数据；安装器退出码 0 |
| 首次迁移 | 已核对九表行数、完整内容哈希、实际 DDL，以及 44 张图片清单及内容哈希，全部一致；逐表最小权限已核对 |
| Linux 依赖 | 生产 `npm ci` 完成，共 189 个包，耗时约 12 秒 |
| 后端服务 | 已 `enable --now`，active/running；本机 `/health/ready` 返回 HTTP 200、`{"ok":true}` |
| 监听与网关 | Node 3001、MySQL 3306/33060 均仅 `127.0.0.1`；Nginx 已启用并运行，提供临时公网 HTTP 80 |
| SSH 权限 | 项目密钥已收紧到专用 `douyu-tunnel` 账号，只允许转发至云端 `127.0.0.1:3001`；本项目 root 公钥授权已撤销 |
| 小程序连接 | 当前开发配置为 `http://121.41.36.64`，编译已完成并持续监听；SSH 本机隧道作为可选开发通道保留 |
| 体验版产物 | 已独立构建 `dist/experience-ip/mp-weixin`；尚未上传微信、设为体验版或添加体验成员 |
| API 域名 | `api.tpejocq.cn`；网站 ICP 尚待管局审核，正式 HTTPS 尚未部署 |
| 图片域名 | `img.tpejocq.cn`；OSS 自定义域名、CNAME、证书托管尚未完成 |
| 微信备案 | 小程序 `wx0ebba69092706cc6` 已于 2026-10-10 通过管局审核 |
| 证书 | API、图片域名各一张 Let's Encrypt 证书已在本机签发；尚未配置自动续期 |
| AI | `CUTOUT_AI_ENABLED=false`；本次生产配置不复制 Aidge AccessKey |

本次 release 为 `20261019-initial`。首次迁移包已通过已验证的 SSH 连接上传到 `/root/douyu-incoming/douyu-20261019-initial.tar.gz`，共 14,631,482 字节，SHA-256 为 `1299a5cc8069647729977c2e1bc114d27098b331478d709e63baafef4da74298`。

`install-first-release.py` 和 `verify-migration.py` 均已实际执行并以退出码 0 完成。远程九张表行数与下文源快照一致，`rowHashesMatch=true`；44 个图片文件的清单及内容校验一致，`imageHashesMatch=true`。九张表的 `SHOW CREATE TABLE` 与本地结构逐字一致，`ddlExactMatches=9`、`differences=[]`。应用账号的逐表最小权限也已核对。

Linux 生产依赖已安装，`douyu-backend` 已启用开机启动并运行。本次记录的 PID 为 56075，`NRestarts=0`、`ExecMainStatus=0`，就绪检查成功。部署时曾建立 SSH 隧道（PID 82409），本机经 `http://127.0.0.1:13001/health/ready` 得到 HTTP 200、`{"ok":true}`；之后按用户需求将开发配置改为公网 IP，开发 watcher 已再次编译 DONE。这些 PID/计数是部署时的状态，后续以实时查询为准。

Nginx 首次检查时只有系统默认站点，没有其他用户站点。现已应用独立 IP 体验站点，`nginx -t` 成功，并执行 `enable --now`；Nginx 和后端均 active。安全组已按用户确认保存 TCP 80 入站、来源 `0.0.0.0/0`，规则描述 `douyu-experience-ip-http`。从公网访问 `/api/_connection-check` 得到后端 Express 的 HTTP 404、JSON `NOT_FOUND`（该路径不存在，证明已到应用）；公网 `/health/ready` 为 403，主机内经 Nginx 检查则为 200、`{"ok":true}`。

本次公网配置对应 `deploy/aliyun/nginx-api-experience-ip.conf`。`nginx-api-http.conf` 仍是只允许开发者来源 IP 的开发模板，两份用途不同，不要混用或同时启用重复 upstream。临时公网 HTTP 会明文传输令牌和图片，私有接口仍需登录；正式使用应切换 HTTPS。

迁移、启动、开发连接及公网入口的部署检查已完成。尚未执行真实微信登录、作品操作、真机或 AI 验收，也没有上传微信体验版；公网 HTTPS 尚未启用。请在本机开发者工具中重新登录一次：生产使用了新的 SESSION_SECRET，旧令牌已失效，用户 ID 和已迁移作品归属保持不变，不要删除本地草稿。

## 目录与服务边界

```text
/opt/node24 -> /opt/node-v24.<实际版本>-linux-x64
/opt/douyu/releases/<release>/backend/
/opt/douyu/current -> /opt/douyu/releases/<release>
/opt/douyu/releases/<release>/backend/data -> /var/lib/douyu
/var/lib/douyu/private-images/
/var/lib/douyu/community-thumbnails/
/etc/douyu/backend.env
/etc/systemd/system/douyu-backend.service
```

`current` 指向包含 `backend/` 的 release 目录。用户原图、抠图输入和结果、社区缩略图全部持久化到 `/var/lib/douyu`，不随源码切换。社区缩略图仍通过 `backend/data/community-thumbnails` 读取，因此每个 release 都需要 `backend/data` 链接。

应用由系统用户 `douyu` 运行，只有一个 systemd 进程，不再叠加 PM2 或其他 worker。抠图队列和锁按单进程运行设计；旧后端与新后端不能同时消费同一个数据库。应用仅监听 `127.0.0.1:3001`，MySQL 仅监听 loopback，安全组不开放 3001、3306。项目隧道密钥的 `from=` 限制为配置时实际观察到的 SSH 来源 IP；正式业务入口将通过 Nginx 的 443。

环境文件、数据库密码、AppSecret、SESSION_SECRET、SSH 私钥和 TLS 私钥不得进入前端、源码包、Git 或聊天。`/etc/douyu` 为 root 0700，`backend.env` 为 root 0600；数据目录由 `douyu:douyu` 持有，目录 0700、文件 0600。Nginx 不直接暴露私有图片目录。

## 首次部署与迁移

### 1. 准备一致快照

本次迁移范围已经用户确认：本地用户、作品、公开作品、下载记录、抠图数据及对应图片一起迁移。先停止本地豆屿后端写入，再用 `mysqldump --single-transaction` 导出，同一时间复制整个 `backend/data`，生成数据库行内容和图片 SHA-256 清单。不要停止、修改其他项目的数据库或进程。

本次源快照预期为九张表：

| 表 | 行数 |
| --- | ---: |
| `bead_users` | 2 |
| `bead_images` | 33 |
| `bead_works` | 17 |
| `bead_public_works` | 11 |
| `bead_public_downloads` | 2 |
| `bead_cutout_inputs` | 10 |
| `bead_cutouts` | 4 |
| `bead_cutout_tasks` | 0 |
| `bead_cutout_lock` | 1 |

图片快照共 44 个文件，约 14.68 MB，其中 33 个私有图片、11 个社区缩略图。最终以 `migration/source-manifest.json` 和 `migration/files-manifest.json` 的实际内容为准。行数一致只表示数量一致，完整性还要核对排序后各表内容哈希和每张图片哈希。

迁移包保存在仓库外的私有暂存目录，权限 0600，通过受保护的连接传输。首次包包含源码、数据库快照、图片、清单和生产环境配置；它含用户数据与密钥，不能作为公开下载文件或普通发布包保留。

### 2. 安装运行环境并检查目标

在确认是这台 ECS 后安装受支持的 Node.js 24 LTS。仓库的 `deploy/aliyun/install-node24.sh` 从 Node.js 官方下载 Linux x64 包，使用同次官方 `SHASUMS256.txt` 校验后安装到 `/opt`，首次运行要求 `/opt/node24` 不存在。保留实际版本与下载校验记录。

导入前再次检查目标数据库、`/opt/douyu`、`/var/lib/douyu` 和 `/etc/douyu`。只有目标确定为空时才能执行本次完整首次导入。如果已有同名表、图片或服务，应停止自动流程并制定增量合并方案，不能清库、覆盖数据或使用本地快照替换线上数据。

不要在服务器运行 `backend/scripts/provision-local.cjs`、`migrate-community.cjs` 或 `migrate-cutout.cjs`：这些本地脚本不能直接作为生产迁移流程。首次结构来自已核对的实际数据库转储；后续结构变更另行审查。

### 3. 导入、授权、配置与启用

首次安装脚本负责新库、新应用账号、持久目录、源码 release、环境配置和 systemd 单元的落地。它不安装 npm 依赖，不启动、不启用服务；执行中途失败会保留现场，不能删掉安全检查后重跑，也不能清空已有目标。迁移包校验并解压至本次专用目录后，在 ECS 管理员终端执行：

```sh
python3 /root/douyu-incoming/20261019-initial/deploy/aliyun/install-first-release.py \
  --bundle-root /root/douyu-incoming/20261019-initial \
  --release-id 20261019-initial
```

生产数据库为 `bead_island`，应用账号为 `bead_island_app`，通过 `127.0.0.1:3306` 连接。应用账号仅授予以下权限，建表和改表使用独立管理员身份：

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

锁记录由首次导入准备；`SELECT ... FOR UPDATE` 需要对应 UPDATE 权限。生产环境配置采用新数据库密码、新 SESSION_SECRET，保留同一小程序 AppID/AppSecret，AI 保持关闭。新的 SESSION_SECRET 会使旧会话失效，用户需要重新登录；用户 ID 仍由 AppID/openid 决定，迁移时不重建用户、不改作品归属。

生产依赖必须单独在 Linux 的 release 下安装，不能上传 macOS 的 `node_modules`。后端无需编译：

```sh
cd /opt/douyu/releases/20261019-initial/backend
env PATH="/opt/node24/bin:$PATH" \
  /opt/node24/bin/npm ci --omit=dev --no-audit --no-fund
```

配置设置 `HOST=127.0.0.1`、`PORT=3001`、`TRUST_PROXY_LOOPBACK=true`；该代理选项只信任 loopback Nginx，Nginx 覆写转发头为实际连接来源。

导入后、应用产生新写入前，在服务器以管理员执行迁移校验：

```sh
python3 /root/douyu-incoming/20261019-initial/deploy/aliyun/verify-migration.py \
  --bundle-root /root/douyu-incoming/20261019-initial \
  --data-root /var/lib/douyu
```

脚本只读比较全部九表行数和内容哈希、全部图片内容和文件清单，不打印用户行内容。任何不一致都应先处理，不能仅凭“导入无报错”宣告迁移完成。校验完再启用单个 `douyu-backend` 服务；本次已执行：

```sh
systemctl enable --now douyu-backend
```

### 4. 基础部署检查

以下在 ECS 上执行，用于核实部署和连接，不调用付费 AI：

```sh
/opt/node24/bin/node --version
systemctl is-active mysql douyu-backend
systemctl status douyu-backend --no-pager
ss -lntp
curl --fail --silent --show-error http://127.0.0.1:3001/health/ready
```

确认 3001、3306 没有监听公网；`/health/ready` 成功代表必要配置、数据库结构和图片目录可用，不证明真实微信登录和作品功能已经验收。健康检查只能由主机内或受控隧道访问，不开放为公网管理入口。

排查启动问题时查看 `journalctl -u douyu-backend -n 80 --no-pager`，不要输出完整环境文件、上传内容、令牌或数据库用户资料。数据库和图片校验必须先于真实业务写入，否则校验清单会因新数据出现预期变化。

## 本机微信开发者工具连接云端后端

当前 `.env.development.local` 使用 `http://121.41.36.64`，开发编译已完成。邀请他人体验时使用独立 `dist/experience-ip/mp-weixin`，按 [IP 体验版手册](./ip-experience.md) 上传并设置体验成员；体验者必须在手机开启调试，不需要连接 Mac 或使用 SSH。

SSH 本地转发保留为可选的本机开发通道。以下记录仅适用于选择隧道模式时：本机 FlClash TUN 的默认路由经 `utun6`，普通 SSH 曾在 banner 交换前超时；专用 ProxyCommand 将连接 socket 绑定到实际网卡 `en0` 后已成功连接。FlClash 设置、系统代理和路由没有修改，后续也不需要修改。SSH 命令必须带下述项目配置；项目密钥当前已没有 root 登录权限。

连接配置为 `/Users/jkliang/.local/share/pindou-deploy/ssh_config`，Host 别名为 `douyu-ecs`、User 为 `douyu-tunnel`；其中 ProxyCommand 调用同目录 `direct-ecs-ssh.py`，固定连接 `121.41.36.64:22`，通过 macOS `IP_BOUND_IF` 绑定 `en0`。主机公钥先从 Workbench 读取，再固定到同目录 `known_hosts`，`StrictHostKeyChecking=yes`。已核实的 ED25519 指纹为：

```text
SHA256:mw4D+hLO2J4moLwBk//9pnN6v938An4gCgODD7fYFSg
```

项目专用私钥保存在仓库外、权限 0600。用户曾亲自在 root 下安装项目公钥供首次部署使用；部署完成后已仅撤销 root `authorized_keys` 中本项目的公钥，其他 root 授权全部保留，并保存私有备份。当前同一项目密钥仅用于 `douyu-tunnel` 账号，公钥按实际 SSH 来源 IP 限制。

`configure-development-tunnel.py` 已执行成功。`douyu-tunnel` 为 nologin 账号，sshd 末尾的专用 Match 配置只允许 local TCP forwarding，`PermitOpen` 仅 `127.0.0.1:3001`，禁止远程监听、Unix socket 转发、agent、X11、PTY、TUN，并通过 `ForceCommand` 禁止执行命令。实际 `sshd -T` 生效值已核对；通过当前配置尝试 `id -u` 返回 nologin、退出码 1，改用 root 返回 `Permission denied (publickey)`、退出码 255，符合预期。此配置不能 SCP、打开管理 shell 或执行发布命令。

后续发布请使用已登录的 Workbench root 免密管理员入口、文件管理上传和手动管理员命令，或由本人恢复仅供本次发布的短期管理权限，完成后收回；不能将当前隧道配置当作管理连接。若来源公网 IP、网卡、代理环境、服务器或主机指纹发生变化，应先由管理员核实并更新对应配置，不能取消来源限制或关闭主机校验。

需要隧道模式时，先确认本机 13001 没有已有隧道，再在单独终端运行以下命令并保持终端打开；公网 IP 模式无需这一步：

```sh
ssh -F /Users/jkliang/.local/share/pindou-deploy/ssh_config -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:13001:127.0.0.1:3001 \
  douyu-ecs
```

`127.0.0.1:13001` 是本机隧道入口，实际业务进程和数据库在 ECS。只有配置为隧道模式的本机小程序才依赖这条连接；当前公网 IP 体验包不依赖它。如果提示端口占用，应先查明原进程，不结束其他项目进程、不改其他项目端口。

项目根目录使用开发专用的 `.env.development.local`，避免把调试地址带入正式构建。本次已从共享 `.env.local` 中移除原有 API 地址行，保留其他原内容，并在仓库外保留该文件的私有备份。当前实际配置为：

```dotenv
VITE_API_BASE_URL=http://121.41.36.64
```

如需切回仅本机的 SSH 隧道模式，再将该开发专用文件改为 `VITE_API_BASE_URL=http://127.0.0.1:13001` 并重启开发编译；这不会修改独立 IP 体验包。

本次开发编译已完成并持续监听；需要重新启动时执行：

```sh
cd /Users/jkliang/Desktop/pindou
npm run dev:mp-weixin
```

本机开发工具导入 `dist/dev/mp-weixin`，上传 IP 体验版则导入 `dist/experience-ip/mp-weixin`。开发输出已有的私有 `project.private.config.json` 保持 `urlCheck=false`，正式 `project.config.json` 仍为 `urlCheck=true`。工具本地跳过校验不能代替体验者手机开启调试。真机无法直接访问 Mac 的 `127.0.0.1`；临时 IP 体验依照专用手册，正常扫码使用和正式发布应改为已备案 HTTPS API。

不要删除客户端本地草稿以解决重新登录问题。生产使用新 SESSION_SECRET 后重新登录即可恢复同一用户的云端作品。

## 后续发布：只切换源码，保留生产数据

以下命令供下一次明确授权发布时使用。正常更新不再把本地数据库和本地图片导入生产；生产环境文件、数据库、图片目录始终保留。改代码后也不自动执行本地种子或清库脚本。

### 1. 本机制作源码包

在项目根目录生成一个唯一发布名，不覆盖已有归档：

```sh
cd /Users/jkliang/Desktop/pindou
release=$(date +%Y%m%d-%H%M%S)
archive="/Users/jkliang/.local/share/pindou-deploy/douyu-source-$release.tar.gz"
umask 077
test ! -e "$archive"
tar -czf "$archive" \
  backend/src backend/sql backend/package.json backend/package-lock.json
shasum -a 256 "$archive"
```

该包刻意只列出源码、依赖锁及供人工审查的 SQL，不包含 `.env`、`backend/data`、`node_modules` 或数据库快照。通过 Workbench 管理员文件管理上传，并在服务器核对 SHA-256；或由本人另行恢复本次发布所需的短期管理员权限，完成后收回。当前 `douyu-ecs` 配置只有隧道权限，不能上传文件或执行下述服务器管理命令。

### 2. 发布前备份

在 ECS 管理员终端执行。确认磁盘有足够空间，备份放在 Nginx 无法访问的私有目录，随后复制到受保护的离机位置。先停止唯一后端，防止数据库和图片在备份间隙继续变化；这是短暂停机操作，应安排在适合的窗口。

```sh
set -euo pipefail
umask 077
backup="/var/backups/douyu/$(date +%Y%m%d-%H%M%S)"
test ! -e "$backup"
test ! -L "$backup"
install -d -m 0700 "$backup"
readlink -f /opt/douyu/current > "$backup/previous-release.txt"
systemctl stop douyu-backend
mysqldump --single-transaction --quick --hex-blob \
  --set-gtid-purged=OFF --no-tablespaces bead_island \
  > "$backup/database.sql"
tar -czf "$backup/data.tar.gz" -C /var/lib/douyu .
cp -a /etc/douyu/backend.env "$backup/backend.env"
cp -a /etc/systemd/system/douyu-backend.service "$backup/"
```

Ubuntu MySQL 本机 root 的上述命令通过 Unix socket 管理认证执行，不在参数中填写密码。如该主机认证配置不同，改用管理员私有 `--defaults-extra-file`，不得在命令行写明文密码。任何一步失败先排查，不继续切换；需要取消本次发布时启动原服务。备份含用户数据和密钥，不发送聊天、不存进 Git、不放公网目录。

### 3. 创建新 release，审查结构变更

将下面两个变量替换为本次实际上传文件和对应发布名。解压前检查压缩包只含预期相对路径，不含绝对路径、`..`、链接或其他目录；使用本手册生成的自有源码包。

```sh
set -euo pipefail
release='填入本次发布名'
archive='/root/填入已校验的源码包.tar.gz'
[[ "$release" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,63}$ ]]
target="/opt/douyu/releases/$release"
test ! -e "$target"
test ! -L "$target"
install -d -m 0755 "$target"
tar -xzf "$archive" -C "$target" --no-same-owner
test ! -e "$target/backend/data"
ln -s /var/lib/douyu "$target/backend/data"
cd "$target/backend"
env PATH="/opt/node24/bin:$PATH" \
  /opt/node24/bin/npm ci --omit=dev --no-audit --no-fund
```

有表结构变更时，先对照生产 `SHOW CREATE TABLE` 和拟发布 SQL；确认兼容旧版数据、索引/列默认值、执行时间、所需权限以及失败恢复办法，再用管理员执行审查过的增量迁移。`backend/sql/schema.sql` 是结构基线，不能直接当作已有数据库的升级器。MySQL 的许多 DDL 会隐式提交，事务不能保证撤销；会丢数据或使旧代码无法读取的迁移应先另行准备可执行恢复方案。新增表要同步授予应用所需的最小权限。

### 4. 原子切换并检查

确认备份和必要迁移成功后，在同一管理终端切换链接。`current.next` 必须不存在，防止覆盖他人留下的发布状态：

```sh
set -euo pipefail
test ! -e /opt/douyu/current.next
test ! -L /opt/douyu/current.next
ln -s "$target" /opt/douyu/current.next
mv -Tf /opt/douyu/current.next /opt/douyu/current
systemctl start douyu-backend
systemctl is-active douyu-backend
curl --fail --silent --show-error http://127.0.0.1:3001/health/ready
```

仅源码更新不需要 `daemon-reload` 或 Nginx reload。修改 systemd 单元后先执行 `systemctl daemon-reload`；修改 Nginx 独立站点时先 `nginx -t`，通过后再 `systemctl reload nginx`，不覆盖全局配置或其他站点。真实业务验收按当次用户授权执行，AI 付费调用需另有明确授权。

保留上一个可用 release 和对应离机备份。确认新版本稳定后才按保留策略清理旧版本；清理范围不能包含 `current`、持久图片或生产环境文件。

## 故障回滚

先保存故障日志并停止新进程。只有数据库结构仍兼容旧代码时，才可按备份记录恢复源码链接：

```sh
set -euo pipefail
systemctl stop douyu-backend
previous=$(cat /实际备份目录/previous-release.txt)
test -d "$previous/backend"
test ! -e /opt/douyu/current.next
test ! -L /opt/douyu/current.next
ln -s "$previous" /opt/douyu/current.next
mv -Tf /opt/douyu/current.next /opt/douyu/current
systemctl start douyu-backend
curl --fail --silent --show-error http://127.0.0.1:3001/health/ready
```

源码回退不会还原数据库、图片或环境配置。若失败涉及 DDL、迁移写入或图片损坏，应继续停写，先确认恢复点、备份完整性和备份后的新增数据，再制定并授权数据恢复。不要把旧 SQL 直接覆盖生产库，不用删库重建解决失败，也不把“服务重新启动”描述成“数据已恢复”。

## 备案通过后切换正式 HTTPS

1. 确认网站 ICP 已通过、域名和服务器仍有效，再为 `api.tpejocq.cn` 添加 ECS 的 A 记录。备案和微信小程序备案是独立状态，微信已通过不表示网站域名已可正式使用。
2. 将 API 证书链和私钥通过私有通道部署到 ECS 的 `/etc/letsencrypt/live/api.tpejocq.cn/`，保护私钥权限。应用 `deploy/aliyun/nginx-api-https.conf` 为独立站点，按实际切换计划停用临时 IP 站点，避免重复 upstream 或 server 冲突；先运行 `nginx -t`，成功后 reload 已运行的 Nginx。确认正式入口可用后收回不再需要的临时公网规则；3001、3306 始终不对公网开放。
3. OSS 先绑定 `img.tpejocq.cn`，再按 OSS 控制台给出的目标配置 CNAME，并单独托管图片域名证书。不能把 API 的 A 记录、证书或 Nginx 配置直接当作 OSS 图片配置。
4. 由用户在微信小程序后台配置 `https://api.tpejocq.cn` 为 **request、uploadFile、downloadFile** 合法域名；现有客户端三种请求都使用这个 API 域名。后台网址受当前浏览器工具权限限制，需用户自行操作。
5. 开发地址只放 `.env.development.local`。备案及 HTTPS 入口就绪后，正式构建显式指定 API 地址：

   ```sh
   cd /Users/jkliang/Desktop/pindou
   VITE_API_BASE_URL=https://api.tpejocq.cn npm run build:mp-weixin
   ```

   正式代码会拒绝 HTTP、IP、localhost。正式构建前仍应核对环境配置，不要为了打包通过而关闭这个保护。
6. 保留小程序正式域名/HTTPS 校验，完成当次授权的真实环境验收后再提交微信审核和发布。HTTPS 生效也不会自动启用 AI；Aidge/OSS 的真实上传与付费调用在后续单独验证。

证书记录和手动续签命令见 [https-certificates.md](./https-certificates.md)。目前两张证书均为手动 DNS-01 签发，**没有自动续期**；到期时间为 2027-01-17（上海时间）。上线前应补齐自动续签、部署更新和成功告警。续签后 API 端还要执行 Nginx 配置检查与 reload，OSS 端也要更新托管证书，仅更新本机文件不会更新线上证书。

## 相关文件

- 部署模板与代理/权限说明：`deploy/aliyun/README.md`
- systemd：`deploy/aliyun/douyu-backend.service`
- HTTPS 站点：`deploy/aliyun/nginx-api-https.conf`
- 环境配置样例：`deploy/aliyun/production.env.example`
- 迁移内容与文件校验：`deploy/aliyun/verify-migration.py`
- 本次执行计划：`docs/superpowers/plans/2026-10-19-aliyun-deployment.md`
