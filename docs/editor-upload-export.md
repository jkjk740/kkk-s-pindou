# 转图上传与导出更新

## 本轮内容

- 新启动转图页仅显示拼豆背景和「上传图片」，没有默认猫咪、参数或导出操作；已选草稿和主动打开的作品保留。
- 登录后私有上传原图，再生成图纸；取消、上传失败不替换当前作品，转换失败恢复原有草稿。
- 导出入口改为 `openExport`，避免 uni-app 将保留字 `export` 的绑定编译成仅返回函数而不调用。
- 自定义方向弹层默认正面，支持左右镜像、真实图片预览、生成进度、失败重试和相册权限恢复。
- 镜像只翻转图案的列，高清 PNG 的标题、坐标文字、MARD 色号仍正常可读。
- 方向卡使用普通 image；编辑器的底层图纸 canvas 在导出层打开期间卸载，避免动画和原生画布重叠。
- 没有后端契约或数据库改动，继续复用已有的登录／原图上传／作品 API。

## 交给用户的人工验收

1. 重启小程序后点击转图：只出现背景和上传按钮，tabBar 和顶栏正常。
2. 未登录时点上传，取消登录不换图；登录后选图、原图上传、生成参数依次出现。
3. 已有作品换图：取消选图、断网上传失败、无法解码时，原图纸仍能继续编辑。
4. 编辑器点导出立即出现自定义弹层，正面默认选中；左右镜像预览方向相反。
5. 保存高清 PNG 到真机相册，核对坐标、色号、用量、正面和镜像；镜像中文字不倒置。
6. 拒绝相册权限后留在弹层，点击设置入口允许后重试；生成中不能重复点击或更换方向。
7. 我的作品的导出入口、公共图纸详情的下载入口复用同一方向弹层；公共下载成功后计数规则不变。
8. 预览图片失败不阻止选择方向和保存高清图纸；关闭后再打开，不混入上一次异步预览。

按用户要求未执行自动测试或 lint；编译和启动不等于真机相册流程已经验收。

## 启动交付

已重新启动本项目 `npm run dev:mp-weixin` 并完成编译，监听继续运行；已有本机 Node.js API 保持在 `127.0.0.1:3001`，没有后端变更或数据库迁移。微信开发工具已经打开本项目并展示过新的上传初始页；用户解锁后已恢复工具，保留当前上传的编辑草稿，没有重复重启。导出弹层和真机相册保存仍由用户人工验收。未操作 bless 或正式域名校验。

## 背景资产

运行时文件：`src/static/editor-upload.jpg`，720 像素宽 JPEG，约 173 KiB，随小程序打包，不依赖后端图片请求。

生成方式：内置 image_gen 工具生成新背景，不从设计图截图裁切。原始 PNG 保存在 Codex generated_images 中；运行时压缩副本保存在项目内。

最终提示词：

> Create ONE production background image asset for a mobile fuse bead craft mini-program upload screen. A portrait 9:16 high-quality overhead macro still-life photograph, calm minimal creamy white and sage palette matching #F8F7F2, soft daylight, extremely subtle shadows. A large translucent ivory fuse-bead pegboard fills the full scene edge to edge diagonally at about 15 degrees, with hundreds of neat small cylindrical pegs, low contrast and soft but clearly photographic. Small hollow cylindrical plastic fuse beads in muted sage green, warm butter yellow and soft peach are loosely scattered mainly in the top-left corner, upper-right edge and bottom corners; varying orientation, some lying down, some standing to reveal real round holes. The CENTER, especially the central third, is clean empty pegboard with lots of whitespace, suitable for a real UI upload button to be overlaid later. Beads should not form any finished art, creature or design. No cats, no flowers, no icons, NO TEXT, NO UI, no frames, no letters, no watermark, no button. Soft tasteful handmade craft feel, bright but not overexposed, natural real materials rather than overly glossy CGI. Completely opaque background.
