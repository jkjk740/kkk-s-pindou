# 豆屿微信小程序开发计划

目标：实现已确认设计的原生小程序和 uniCloud 后端。

依据：miniprogram-spec.md。执行方法：在当前已授权任务持续开发，不进行未授权发布、不创建 Git 提交。

- [x] 图纸核心和本地仓库：先编写有意义的 Node 测试，再实现 CommonJS 算法、校验、序列化与存储。
- [x] 小程序壳和五页面：配置 AppID、uni-app 自定义导航、安全区、Canvas 组件、图片导入、修色、导出和跟拼。
- [x] uniCloud API：独立实现认证、作品接口、用户隔离、CAS revision 和数据库 schemas，后端测试隔离外部网络。
- [x] 云端客户端：接通 uni.login + uniCloud.callFunction、本地和云端同步、冲突保留与失败恢复。
- [x] 导入与部署：校验工程配置 / 页面资源、编译微信目标并运行全套测试；提供微信工具导入与 uniCloud 部署说明。

独立写入范围：主实现 src/、tests/client-*.test.cjs、工程配置与 docs/；后端并行实现 uniCloud-alipay/、tests/backend-*.test.cjs、docs/unicloud-deployment.md。

核对点：PNG 透明 / 极端比例；照片渲染先后竞争；更新进度写盘失败；同步冲突时保留本地图案；HTTP JSON / Base64 请求解析与用户隔离。
