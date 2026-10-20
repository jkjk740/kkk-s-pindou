# 豆屿微信小程序第一版

日期：2026-10-01。用户已确认设计并要求开始开发。微信 AppID：wx0ebba69092706cc6。

## 交付

uni-app Vue3 微信小程序，沿用已确认的奶油白与鼠尾草绿设计，首页、编辑器、色卡、跟拼、作品库五页。Vue 单文件组件放在 src/，保留浏览器设计稿。支付宝云后端放在 uniCloud-alipay/。已提供三个公开 ID，尚未在 HBuilderX 关联空间及配置服务端登录密钥，因此交付可导入的小程序和可部署的后端源码，不宣称已经完成云端联调或发布。

## 技术与边界

uni-app Vue3 / ES Modules / Vite。微信原生顶部胶囊与安全区，不重复绘制手机状态栏。Canvas 2D 承担图片解码、像素匹配、图纸绘制与导出。MARD 221 色参考数据随包，不依赖网络。目标微信基础库 2.32.3 及以上。

图纸模型：{version:1,paletteId:'mard-221',name,width,height,beadSize,cells}，cells 为色号或 null 的行优先数组。长边 24 / 32 / 48 / 64 格，短边保持比例；最大 8 / 12 / 16 / 24 色；透明格不计入数量。支持原图、像素、色号预览，近似底色移除，逐格修色与撤销、材料统计、PNG 图纸保存相册。导出至少 20 px / 格，含坐标和材料清单。

作品模型：{id,pattern,completedRows,createdAt,updatedAt,revision,dirty,deleted}。本地保存即时可用，最多 40 份活动作品，删除云端作品保留待同步 tombstone。进度按已完成行数计算；新图从 0% 开始。图片与像素计算本地执行，云端只同步图纸色号、参数与进度，不上传原图。

## uniCloud 合同

uni-app 默认通过 uniCloud.callFunction 调用支付宝云函数 bead-island。入参 {action,payload,token}，登录之外携带顶层 token。可选 HTTP URL 化入口仍支持 Authorization: Bearer token。响应统一 {ok:true,data} / {ok:false,error:{code,message,details?}}。

- auth.login：payload {code}；服务器用微信 code2Session 获取 openid，签发有时效的 HMAC session。返回 {token,expiresAt,userId}；AppSecret 仅云端环境变量，session_key 不返回。
- works.list：payload {cursor?,limit?}；返回 {items,cursor}；仅当前用户，包括删除标记，按稳定 ID 分页，每页最多 20 个。
- works.save：payload {work:{id,pattern,completedRows},baseRevision}；首次保存 baseRevision=0；按 owner + id 唯一标识，更新需要匹配 revision；返回 {work}，work 包含客户端 id、pattern、completedRows、revision、updatedAt、deleted:false。
- works.delete：payload {id,baseRevision}；返回 {work}，work 为删除标记，保留 revision；重复删除相同已删除记录可幂等成功。

服务端用户隔离不可由客户端指定。严格验证请求大小、已知色号、格数、cells 长度、行范围、标题长度、revision、分页参数。登录配置 env：WECHAT_APPID、WECHAT_APP_SECRET、SESSION_SECRET。客户端 config.js 只有公开 ID 和云同步开关，无密钥。云端未配置时保留本地功能并解释「云端同步尚未开启」。

同步在用户点击时执行：先逐份推送 dirty 和删除标记，再分批拉取。revision 冲突不覆盖任何作品，用户先保留本机副本再使用云端版本。网络失败保留 dirty；持久化失败不显示成功、不丢当前草稿。

## 验证

算法：比例、透明、颜色上限、实际统计、未知色号。存储：写入失败、保存恢复、进度与修色、删除、同步冲突与网络失败。后端：失效 / 篡改 token、跨用户读取 / 改写、无效网格、并发 revision、防止原图和私密字段回传。

编译结果目录为 dist/build/mp-weixin；这是 uni-app 编译产物，不是维护原生小程序源码。外部部署需 HBuilderX 关联服务空间、云端密钥与合法域名配置。没有部署和真机测试前不宣称上线或云端联调完成。
