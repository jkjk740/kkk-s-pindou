# 抠图交互与按钮反馈修正

## 调整内容

- 图片解码、遮罩、合成和导出不再使用放在负坐标的隐藏原生 canvas。改为实际的 OffscreenCanvas，页面只挂载当前可见的绘图画布；转图页进入抠图时卸载原生预览。
- 可见画布根据编辑区实测宽高设置尺寸，窗口或工具栏高度变化后重新适配。触摸拦截只作用于画布，重试和工具栏不被拦截。绘图异常停止绘制并提供重试，不继续闪烁。
- 初始全图选区不画整张图片的虚线框；产生实际选区后才显示轮廓。虚线动画在编辑、对比、页面隐藏或弹层打开时暂停。
- 抠图页固定顶部导航，编辑区和底部工具使用独立区域。工具、撤销重做、缩放和确认分组展示，不覆盖图片。
- 图纸大小与颜色数量每行四项，自动换行，标签不拆行；抠图入口改为独立的宽按钮。
- 所有应用自有按钮共用按压反馈：按下缩小至 96%，松开以回弹曲线恢复；禁用按钮不触发反馈，减少动态效果设置下不做缩放。
- OffscreenCanvas 导出通过 RGBA → 流式 PNG 编码 → 小程序私有文件目录，不依赖隐藏画布，也不使用未声明的 OffscreenCanvas 相册导出方法。成功保存、关闭预览或放弃重试时清理本次生成的文件，不删除原图。

依据：[uni-app 原生组件限制](https://uniapp.dcloud.io/component/native-component)、[OffscreenCanvas](https://zh.uniapp.dcloud.io/api/canvas/createOffscreenCanvas.html)、[fflate 流式压缩](https://github.com/101arrowz/fflate)。旧版微信缺少离屏画布支持时，显示更新提示，而不是挂住页面。

## 布局后续修正

- 抠图页不再使用进入页面时缓存的 `windowHeight` 作为整体高度。进入非 tab 页前后，可使用窗口高度可能变化；页面改用当前渲染视口的 `100vh`，确认区正常参与底部 flex 布局，仅保留安全区。
- 移除抠图组件外层和可见 canvas 的绝对定位。该组件启用 `virtualHost`，让内部编辑区域直接响应父容器的高度，不再隔着额外小程序组件节点计算百分比高度。
- 在界面尺寸更新后读取可见 canvas 自身的位置与大小，用同一矩形确定绘图中心和手势坐标。并发尺寸更新只应用最新一轮，调整工具时不重新加载图片或清空选区。
- 弹层宿主移出 flex 文档流，避免空的自定义组件撑出确认按钮下方的空白。

官方依据：[uni-app 组件 virtualHost 说明](https://uniapp.dcloud.io/tutorial/vue3-api.html)、[窗口高度定义](https://uniapp.dcloud.net.cn/api/system/getWindowInfo)。补充了定位与视口回归用例，但未运行测试或人工验收。

## 后续按钮约定

新按钮必须使用相同配置；视觉尺寸和配色由组件自身控制，交互由公共样式控制：

```vue
<button class="primary press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" @tap="submit">确认</button>
```

公共样式位于 `src/styles/common.css`。动态 class 之外也保留静态 `press`。不要恢复默认的 `button-hover` 或把处理中间画布加入页面模板。

## 交付和用户验收

本轮不修改数据库或收费 AI 配置。后端仍使用本项目的 `127.0.0.1:3001`。前端由本项目的开发编译进程更新微信开发工具，不停止其他项目的 HBuilderX 编译。

依照用户约定，没有运行测试、lint 或真机操作验收。补充以下用例，留给用户运行：

```sh
cd /Users/jkliang/Desktop/pindou
node --test tests/client-canvas-workspace.test.cjs tests/client-press-layout.test.cjs tests/client-editor-export.test.cjs
```

人工检查：重新进入抠图页，导航和五个工具均显示；圈选后撤销、重做、擦除、保留、双指缩放及按住对比；确认返回重新转图；关闭弹层、切换页面、重复进入不叠画布；大小和颜色选项不挤压；各页按钮按下和松开有反馈；高清正面／镜像图纸可保存相册。编译完成不代表以上场景已经通过验收。

## 2026-10-09 显示层与触摸区分离修正

本次用户授权在微信开发工具检查已有本地图片，不确认选区、不调用阿里云 AI。复现时，可见原生 canvas 的实测矩形为 `left=15, top=102, width=345, height=455`，但实际图片被合成到页面顶部；卸载并重新挂载画布后仍然错位。选区计算和画布像素正确，继续调整页面边距无法修复显示层和触摸区的分离。

- 抠图模板不再挂载原生 canvas。离屏画布计算图片、选区和轮廓，普通 image 层在编辑区内显示结果。图片显示和手势均使用同一普通 view 的实测矩形。
- 预览采用双缓冲：下一张图片加载完成前保留当前帧；并发请求合并到最新状态。页面释放后，迟到的渲染或加载结果不能重新显示。
- 预览帧只使用编辑区分辨率，选区仍以原图尺寸编辑和导出；不降低原图或最终图纸精度。仅清理本组件生成的预览文件，不删除用户原图。

本次已运行针对性的 20 项回归测试，全部通过，包含按编辑区偏移映射实际客户端触点的擦除与圈选用例；微信小程序开发编译完成，本项目后端仍监听 `127.0.0.1:3001`。扩大检查时，现有导出测试的两个异步测试桩出现 `finishPreview` / `finishPixels` 未初始化，涉及未修改的导出路径，本次未改动。

```sh
node --test tests/client-cutout-preview.test.cjs tests/client-canvas-workspace.test.cjs tests/client-cutout-mask.test.cjs tests/client-cutout-session.test.cjs tests/client-cutout-integration.test.cjs tests/client-press-layout.test.cjs
```

当前电脑锁屏，修正后的模拟器位置、实际圈选和擦除仍待解锁验收；不能将编译或回归测试通过视为界面已验收。

## 2026-10-09 导出选项与果冻反馈

- 导出格式改成两张等高的圆角选择卡，主副标题居中。选中卡使用豆绿描边、浅绿背景与右上角勾选；整张和分块的导出参数不变。
- 所有已有 `press` 的应用自有按钮共用果冻反馈：按下用 90ms 压扁为 `scale(1.025, 0.92)`，松开用 280ms 过冲曲线恢复为原尺寸，产生轻微拉伸和回弹。使用可中断的 transform transition，不增加点击延迟、计时器或入场抖动。
- 禁用按钮不变形，键盘焦点保留可见轮廓且无回弹，减少动态效果设置下取消变形。微信原生 tabBar 和胶囊不在应用自有按钮的样式控制范围内。

本次仅修改前端样式和选项卡结构，未修改后端或导出实现。按用户此前约定，仅编译更新开发小程序，不运行自动化测试或界面操作验收；补充了 `tests/client-press-layout.test.cjs` 的选项卡与动效回归用例，留给用户运行。
