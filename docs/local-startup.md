# 本机启动豆屿

2026-10-19 起，后端、数据库和图片已部署到阿里云 ECS。当前 `.env.development.local` 的开发 API 为 `http://121.41.36.64`，公网 Nginx 80 已启用，开发编译已完成；无需先启动本机后端或 SSH 隧道。FlClash 设置没有修改，也无需修改。

邀请别人体验时，使用 `npm run build:mp-weixin:experience-ip` 生成的独立目录 `/Users/jkliang/Desktop/pindou/dist/experience-ip/mp-weixin`，由用户上传微信、设为体验版并添加体验成员；这些微信操作尚未执行。每位体验者手机需要开启调试，具体步骤见 [IP 体验版手册](./ops/ip-experience.md)。这是临时 HTTP 方案，正式 HTTPS 仍待网站备案与后续配置。

连接、重启、可选的本机 SSH 隧道和发布命令见 [阿里云发布手册](./ops/aliyun-publishing.md)。下文保留独立本机后端模式的说明；仅想连接云端时不必启动本机后端，也不要把本机迁移或初始化命令用于云端。

## 独立本机后端模式：地址与数据库

后端：`http://127.0.0.1:3001`。数据库：`127.0.0.1:3306/bead_island`，应用账号 `bead_island_app`。3306 是 MySQL 端口，不是 HTTP 接口端口；bless 的 3000 和 3307 不改动。

## 本次新增图纸广场，先迁移一次

先停止旧的豆屿后端，确认本机 3306 MySQL 已运行，然后执行：

```sh
cd /Users/jkliang/Desktop/pindou
npm --prefix backend run migrate:community
```

迁移读取 `backend/.env` 和 `~/.local/etc/mysql/private/root-client.cnf`，仅添加社区表、字段及必要表权限，可重跑，不清库、不重置密码、不执行原先的 `provision:local`。管理员文件不在默认位置时，使用 `MYSQL_ADMIN_CNF` 指定绝对路径。2026-10-09 已在本机执行此迁移，已有记录未清空；以后新增迁移时再按对应说明执行。

## 以后自己启动

后端终端：

```sh
cd /Users/jkliang/Desktop/pindou
npm --prefix backend run dev
```

前端终端：

```sh
cd /Users/jkliang/Desktop/pindou
npm run dev:mp-weixin
```

微信开发者工具打开 `/Users/jkliang/Desktop/pindou/dist/dev/mp-weixin`。每个进程按 Ctrl+C 停止，再运行对应命令启动。后端 dev 监听代码变动；修改 `backend/.env` 后手动重启。没有监听需求时可从根目录使用 `npm --prefix backend start`。

根目录普通 `npm start` 是旧设计原型，不是 API。不要导入旧 build 目录或修改 dist 代替 Vue 源码。

## 登录配置

后端读取 `backend/.env` 的 `WECHAT_APP_SECRET`、`WECHAT_APPID`、数据库应用密码与 `SESSION_SECRET`。不在前端配置 AppSecret。不再重复建库、重置密码或初始化应用账号。配置由后端及迁移脚本读取，不在日志中输出密码；修改 `.env` 后需要重启。

## 模拟器与真机

当前开发环境已经指向云端公网 IP。如需独立本机模式，再将 `.env.development.local` 中 API 显式改为 `http://127.0.0.1:3001` 并重启开发编译。本机 HTTP 调试可仅在微信工具开发项目的「详情 → 本地设置」临时启用不校验合法域名/TLS/HTTPS 证书，正式 `src/manifest.json` 保持校验开启。开发目录重建后本地设置可能需重新设置。

真机的 127.0.0.1 是手机自身。手机与电脑同 Wi-Fi 时：
1. 后端 `backend/.env` 将 `HOST` 暂设 `0.0.0.0`，重启后端。
2. 根目录开发专用 `.env.development.local` 设置 `VITE_API_BASE_URL=http://电脑局域网IP:3001`，重启前端编译；不要将开发地址写入共享 `.env.local`。
3. 保持 MySQL 仅本机可用，不开放 3306；只在可信局域网调试，用完恢复后端监听与地址。

正式环境使用 HTTPS API 域名、合法 request/uploadFile/downloadFile 域名及正式安全校验，不能以这套本机 HTTP 配置发布。服务器和 OSS 准备见 `nodejs-local-and-aliyun.md`。

## 本轮已处理

2026-10-09 已更新社区结构、启动后端开发监听和小程序编译监听，并在微信工具中查看：首页、发布页输入框、色卡固定顶栏、作品页按钮。服务就绪与公共列表返回正常；临时关闭豆屿后端时，首页显示友好重试状态，色卡与示例转图仍正常，之后已恢复后端。没有运行全量测试或 lint，也没有替用户发布作品或修改名称。

后续交付顺序：完成源码 → 对应增量迁移 → 更新本项目后端 → 重新编译当前开发目录 → 刷新微信工具；不把需要重启的旧服务留给用户收尾。不要同时用 HBuilderX 和终端编译同一输出目录。完整真机验收仍见 `community-manual-acceptance.md`。
