# 本地验证记录

本工程是 uni-app Vue3，不是原生微信源码；微信目标由 Vite / uni-app 编译。

## 自动化

`npm run check:uniapp`：五个 Vue 页面、组件与 JavaScript 语法、JSON、两个 AppID、221 色去重、示例图片及 tab 图标均通过。

`npm test`：算法、比例、透明背景、已知色号、材料用量、本机存储、写盘失败、按行进度、撤销进度、草稿转换竞争、云同步失败与冲突、revision、用户隔离、微信登录适配、token 篡改／超时、数据库 CAS／索引、callFunction／HTTP 共 66 项测试通过。打开的旧草稿在远端内容变化后保存为本机副本，不借用新的云端版本号覆盖远端；仅自己的上传确认允许推进版本。

`npm run build:mp-weixin`：编译成功，输出 `dist/build/mp-weixin`。静态文件总体约 620 KB，不包含源图上传和云端密钥。

## 微信开发者工具模拟器

实际导入上述 uni-app 编译结果，用用户提供的微信 AppID 运行，在 iPhone 12/13 mini 模拟器检查：

- 首页及三个原创示例正常绘制，导航与 tabBar 正常。
- 小猫进入编辑器，32 格切到 24 格，用量从 530 颗变为 295 颗，实际尺寸同步变化。
- 色号预览及坐标可切换；保存后进入跟拼，进度从 0 开始。
- 完成一行：1 / 24 行，选中下一行，放大按钮有效。
- 重新编译重启后，首页仍显示该作品及 4% 进度。
- 未发现运行时错误；组件选择器兼容警告已修正。工具本身存在预加载资源告警，不改动工具资源。

## 尚未验证／需要账号配置

模拟器选图返回 `chooseImage:fail api scope is no...`（微信 toast 截断了后半部分），没有打开选图器。若完整错误为 `api scope is not declared in the privacy agreement`，客户端已提供微信后台声明接口的中文提示；没有关闭隐私检查或伪造选图成功。请在对应小程序后台完善用户隐私保护指引与实际隐私接口，再重新编译并真机确认。官方说明：<https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/miniprogram-intro.html>。

原始照片解码和相册保存权限仍需在配置完成后用真机验收；当前模拟器示例转图验证不能替代照片授权、Canvas 导出和真机检测。

支付宝云部署、真实 wx.login、服务端环境变量、合法域名、跨设备同步均未实际联调。源码与隔离测试通过不等于已部署，`src/config.js` 的云端开关保持关闭，具体步骤见 `docs/unicloud-deployment.md`。
