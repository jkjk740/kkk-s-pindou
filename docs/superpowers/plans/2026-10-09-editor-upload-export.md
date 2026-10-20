# Editor Upload and Export Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this already approved session. Do not create branches or commits.

**Goal:** 实现已批准的上传初始页和自定义正面／镜像导出流程。

**Architecture:** App 草稿可为空；图片草稿与转换结果分开。编辑器打开方向弹层时生成小尺寸图片预览，实际导出仍复用高清绘制和相册权限恢复流程。

**Tech Stack:** uni-app Vue3、微信 Canvas 2D、现有 Node.js/MySQL API。

**Spec:** `docs/superpowers/specs/2026-10-09-editor-upload-export-design.md`

## Global Constraints

- 不运行测试/lint；只写回归用例、编译更新、维持服务运行，由用户验收。
- 保留 tabBar、登录后私有上传、MARD 色号和高清 PNG 输出。
- 不操作 bless、数据库凭据、生产安全配置、Git 分支和提交。

## Review Focus

- 空草稿不能触发猫咪回退或空对象访问。
- 取消登录／选图／上传失败不能替换已有作品。
- 预览失败不能挡住导出；关闭后异步预览不能写入新弹层。
- 导出按钮事件必须实际调用处理函数，不能仅返回函数引用。
- 相册权限弹出和重返页面不能重置正在导出的图纸与方向。

## Tasks

- [x] 先补充空草稿、上传草稿、导出事件和方向重置的回归用例，按用户要求不执行。
- [x] 增加 `src/lib/draft.js` 的 `createImageDraft(image)`；调整 App、editor 及 palette/making 空草稿调用方。
- [x] 保存图片资产 `src/static/editor-upload.jpg`，实现自适应上传卡片、按钮及加载反馈。
- [x] 将编辑器入口重命名为 `openExport()`；添加 `renderPatternPreview(canvas, pattern, options)`。
- [x] 重写可复用 export-sheet 为图片方向卡、高清说明、进度／重试／相册权限反馈；公共详情继续复用。
- [x] 更新人工验收说明，重新编译当前开发目录并维持本机 API。
- [x] 解锁后恢复微信开发项目交付：工具已打开当前开发目录，保留用户正在编辑的上传草稿，不重复重启清空；导出方向与相册保存交由用户验收。

## Investigation

- 当前编译产物将 `@tap="export"` 生成 `($event) => $options.export`，没有调用方法；其他方法生成正常调用。
- App 的 onLaunch 和 getDraft 都自动使用猫咪；去掉两个默认入口，并同步处理空草稿。
- 方向卡目前嵌套原生 canvas，且宽度按页面而非卡片计算；改为定尺寸图片预览。

## Delivery Record

- 在用户指定的当前工作目录内执行，没有建立 worktree、分支或提交。
- 按用户要求未运行测试／lint；新增回归用例交给后续验收，不声称测试通过。
- 已重新启动本项目 uni-app 开发监听，完整编译输出为 `DONE Build complete. Watching for changes...`。
- 编译产物的导出按钮现在调用 `$options.openExport(...args)`，不再仅返回 `$options.export`。
- 现有本机 API 继续监听 `127.0.0.1:3001`；本轮没有后端或数据库改动，不需要迁移。
- 正式 manifest 域名校验仍开启；仅开发目录保留用户已允许的本机调试设置。
- 只读最终审查发现并修正两处重要问题：上传候选仅在转换成功后提交全局草稿，切 tab 中断不覆盖原作品；公共详情重新打开导出时清除旧文件、错误和计数意图，避免镜像旧文件与正面选择不一致。
- 保留未执行的回归用例覆盖上述情况。未扩大修复范围：既有相册授权后遇到其他保存错误可能再次打开设置的轻微问题单独留待真机验收。
- 收尾修改已由开发监听完成增量编译；用户解锁后已恢复微信开发工具。保留当前上传草稿，没有执行重新编译／重启、测试／lint 或真实相册保存；用户同时操作工具导致代理打开弹层被中断，未声称弹层或相册流程已验收。
