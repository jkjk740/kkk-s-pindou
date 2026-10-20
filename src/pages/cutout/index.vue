<template>
  <view class="cutout-page">
    <app-header title="抠图" style="flex-shrink:0"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action press" :disabled="saving" @tap="cancel">取消</button></app-header>
    <view class="cutout-content">
      <view class="workspace-wrap">
        <cutout-workspace v-if="inputPath" ref="workspace" :input-path="inputPath" :mask-path="maskPath" :width="input.width" :height="input.height" :tool="tool" :brush-size="brushSize" :compare="compare" :active="active" :disabled="saving" @applying="applyingMask = $event" @ready="ready = $event !== false" @history="history = $event" @change="edited" @pose="scale = $event" @error="error = errorMessage($event)" />
        <view v-else class="cutout-empty"><view v-if="loading" class="loading-ring" /><text>{{ loading ? '正在打开原图' : error || '原图暂时无法打开' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="!loading" class="secondary press" @tap="load">重试</button></view>
      </view>
      <view class="workspace-controls"><view class="zoom-controls"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="control zoom-control press" aria-label="缩小图片" :disabled="!ready || saving || applyingMask || scale <= 1" @tap="$refs.workspace.zoom(-.5)">−</button><text class="scale">{{ Math.round(scale * 100) }}%</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="control zoom-control press" aria-label="放大图片" :disabled="!ready || saving || applyingMask || scale >= 8" @tap="$refs.workspace.zoom(.5)">＋</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="control reset-control press" :disabled="!ready || saving || applyingMask" @tap="$refs.workspace.reset()">复位</button></view><view class="history-controls"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="control history-control press" aria-label="撤销选区" :disabled="!history.undo || saving || applyingMask" @tap="$refs.workspace.undo()">↶</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="control history-control press" aria-label="重做选区" :disabled="!history.redo || saving || applyingMask" @tap="$refs.workspace.redo()">↷</button></view></view>
      <view class="cutout-tools"><button hover-start-time="0" hover-stay-time="0" v-for="item in tools" :key="item.id" class="tool press" :class="{ selected: tool === item.id }" :disabled="saving || applyingMask || !ready || item.id === 'smart' && processing" hover-class="press-hover" @tap="chooseTool(item.id)"><text class="tool-icon">{{ item.icon }}</text><text>{{ item.id === 'smart' && processing ? '识别中' : item.label }}</text></button></view>
      <view v-if="tool === 'keep' || tool === 'erase'" class="brush-control"><text>画笔</text><slider class="brush-slider" :disabled="saving || applyingMask" :value="brushSize" min="8" max="72" activeColor="#355c48" block-color="#355c48" :block-size="18" @changing="brushSize = $event.detail.value" @change="brushSize = $event.detail.value" /></view>
      <view class="cutout-feedback"><text v-if="error" class="failure">{{ error }}</text><text v-else>{{ processing ? '正在识别，可继续手动修正' : !intelligent ? '圈选主体 · 画笔修正边缘' : tool === 'lasso' ? '圈出需要保留的区域' : tool === 'move' ? '单指移动 · 双指缩放' : '涂抹修正选区 · 双指缩放' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="aiMaskPath" class="text-action press" :disabled="saving || applyingMask" @tap="applyAI">应用识别结果</button></view>
    </view>
    <view class="cutout-footer"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="secondary compare-button press" :disabled="!ready || saving || applyingMask" @touchstart="compare = true" @touchend="compare = false" @touchcancel="compare = false">按住对比</button><button hover-start-time="0" hover-stay-time="0" class="primary confirm-button press" :disabled="!ready || saving || applyingMask" hover-class="press-hover" @tap="save">{{ saving || applyingMask ? '正在处理' : '确认选区' }}</button></view>
    <view class="cutout-overlays"><ui-host route="pages/cutout/index" /></view>
  </view>
</template>
<script>
import { markRaw } from 'vue';
import CutoutWorkspace from '../../components/cutout-workspace.vue';
import { cutoutApi, pollCutoutTask, requestId } from '../../lib/cutout-api.js';
import { createCutoutSession } from '../../lib/cutout-session.js';
import { downloadImage } from '../../lib/cloud.js';
import { confirm, isCurrentPage } from '../../lib/ui.js';
import { errorMessage } from '../../lib/errors.js';
import { dismiss } from '../../lib/ui-controller.js';
import { releaseCanvasFile } from '../../lib/working-canvas.js';
export default {
  components: { CutoutWorkspace },
  data() { return { input: null, inputPath: '', maskPath: '', loading: false, ready: false, active: true, tool: 'lasso', brushSize: 24, compare: false, scale: 1, history: { undo: false, redo: false }, error: '', intelligent: false, processing: false, saving: false, applyingMask: false, aiMaskPath: '', tools: [{ id: 'smart', icon: '✦', label: '智能' }, { id: 'lasso', icon: '◌', label: '圈选' }, { id: 'keep', icon: '＋', label: '保留' }, { id: 'erase', icon: '−', label: '擦除' }, { id: 'move', icon: '↔', label: '移动' }] }; },
  onLoad({ token }) { const pending = getApp().globalData.cutoutSession; if (!pending || pending.token !== token) { this.error = '编辑会话已结束，请重新进入'; return; } this.identity = { ...pending }; this.session = markRaw(createCutoutSession(pending)); this.confirmationId = requestId(); this.load(); },
  onShow() { this.active = true; if (this.taskId && this.processing) this.observeTask(); },
  onHide() { this.active = false; this.compare = false; this.pollVersion = (this.pollVersion || 0) + 1; dismiss('pages/cutout/index'); },
  onUnload() { this.active = false; this.session?.cancel(); this.pollVersion = (this.pollVersion || 0) + 1; this.loadVersion = (this.loadVersion || 0) + 1; if (!this.saving) releaseCanvasFile(this.pendingMask); dismiss('pages/cutout/index'); },
  methods: {
    errorMessage,
    async load() {
      if (!this.identity || this.loading) return;
      const version = this.loadVersion = (this.loadVersion || 0) + 1; this.loading = true; this.error = '';
      try {
        const input = await cutoutApi.prepareInput(this.identity.sourceImageId);
        const inputPath = await downloadImage(input.imageId);
        let maskPath = '';
        if (this.identity.cutoutId) { const previous = await cutoutApi.getCutout(this.identity.cutoutId); if (previous.inputImageId !== input.imageId || previous.sourceImageId !== this.identity.sourceImageId) throw new Error('原图与选区不匹配'); maskPath = await downloadImage(previous.maskImageId); }
        if (version !== this.loadVersion) return;
        this.input = input; this.maskPath = maskPath; this.inputPath = inputPath;
        cutoutApi.capabilities().then(value => { if (version === this.loadVersion) this.intelligent = value.intelligent; }).catch(() => {});
      } catch (error) { if (version === this.loadVersion) this.error = errorMessage(error); }
      finally { if (version === this.loadVersion) this.loading = false; }
    },
    edited() { this.session.edited(); this.confirmationId = requestId(); releaseCanvasFile(this.pendingMask); this.pendingMask = null; this.error = ''; },
    chooseTool(tool) { if (this.applyingMask || this.saving) return; if (tool === 'smart') this.smart(); else this.tool = tool; },
    async smart() {
      if (this.processing || this.saving || this.applyingMask || !this.ready) return;
      this.error = '';
      if (!this.intelligent) { this.error = '智能抠图未开通，请使用圈选或画笔'; return; }
      const accepted = await confirm({ title: '智能识别主体', content: '待处理图片将发送给阿里云进行识别。复杂背景可能需要手动修正，卡通图请优先圈选。', confirmText: '开始识别' });
      if (!accepted || !isCurrentPage('pages/cutout/index')) return;
      this.processing = true; this.aiStamp = this.session.stamp();
      try { const task = await cutoutApi.startTask(this.identity.sourceImageId, this.aiRequestId || (this.aiRequestId = requestId())); this.taskId = task.id; await this.observeTask(); }
      catch (error) { if (this.active) this.error = errorMessage(error); this.processing = false; }
    },
    async observeTask() {
      const version = this.pollVersion = (this.pollVersion || 0) + 1;
      const current = () => this.active && version === this.pollVersion && isCurrentPage('pages/cutout/index');
      try {
        const task = await pollCutoutTask(this.taskId, { isCurrent: current });
        if (!task || !current()) return;
        const path = await downloadImage(task.maskImageId);
        if (!current()) return;
        this.session.offer(path, this.aiStamp); this.aiMaskPath = path; this.processing = false; this.error = '';
      } catch (error) { if (current()) { this.error = errorMessage(error); this.processing = false; if (['CUTOUT_FAILED', 'CUTOUT_INTERRUPTED', 'MASK_INVALID', 'CUTOUT_UNAVAILABLE'].includes(error.code)) { this.aiRequestId = null; this.taskId = null; } } }
    },
    async applyAI() {
      if (!this.aiMaskPath || this.saving || this.applyingMask) return;
      const candidate = this.session.candidate();
      if (candidate?.stale || this.session.stamp() !== this.aiStamp) { const accepted = await confirm({ title: '替换当前选区？', content: '应用识别结果会替换手动修改，可撤销。', confirmText: '应用' }); if (!accepted) return; }
      try { if (await this.$refs.workspace.applyMask(this.aiMaskPath)) { this.aiMaskPath = ''; this.tool = 'keep'; } }
      catch (error) { this.error = errorMessage(error); }
    },
    async save() {
      if (this.saving || this.applyingMask || !this.ready) return;
      this.saving = true; this.error = ''; this.pollVersion = (this.pollVersion || 0) + 1;
      try {
        this.pendingMask ||= await this.$refs.workspace.exportMask();
        const result = await cutoutApi.confirmCutout(this.identity.sourceImageId, { inputImageId: this.input.imageId, requestId: this.confirmationId, filePath: this.pendingMask });
        if (!this.active || !isCurrentPage('pages/cutout/index')) return;
        getApp().globalData.cutoutResult = { token: this.identity.token, sourceImageId: this.identity.sourceImageId, cutoutId: result.id, resultImageId: result.resultImageId };
        uni.navigateBack();
      } catch (error) { if (this.active) this.error = errorMessage(error); }
      finally { this.saving = false; if (!this.active) releaseCanvasFile(this.pendingMask); }
    },
    async cancel() { if (this.saving) return; if (this.session?.stamp() && !await confirm({ title: '放弃这次修改？', content: '当前图纸保持不变。', confirmText: '放弃' })) return; uni.navigateBack(); }
  }
};
</script>
<style scoped>
.cutout-page{position:relative;width:100%;height:100vh;display:flex;flex-direction:column;overflow:hidden;background:#f8f7f2}.cutout-content{display:flex;flex-direction:column;flex:1;min-height:0;padding:20rpx 28rpx 0}.workspace-wrap{position:relative;flex:1;min-height:0;overflow:hidden;border:2rpx solid #e6e9dc;border-radius:26rpx}.cutout-empty{display:flex;height:100%;flex-direction:column;align-items:center;justify-content:center;gap:24rpx;background:#eeefe7;color:#7b8574;font-size:26rpx}.workspace-controls{display:flex;align-items:center;justify-content:space-between;flex-shrink:0;margin:16rpx 0 20rpx}.zoom-controls,.history-controls{display:flex;align-items:center;gap:10rpx}.control{display:flex;align-items:center;justify-content:center;min-height:88rpx;border-radius:16rpx;background:#eef0e7;color:#355c48;font-size:30rpx}.zoom-control,.history-control{width:88rpx}.reset-control{padding:0 20rpx;font-size:23rpx}.history-control{font-size:34rpx;background:#fffefa;border:2rpx solid #e4e8dc}.scale{font-variant-numeric:tabular-nums;font-size:22rpx;color:#6c7e61;width:78rpx;text-align:center}.cutout-tools{display:flex;gap:10rpx;flex-shrink:0;padding:8rpx;border-radius:24rpx;background:#ecefe4}.tool{flex:1;min-width:0;border-radius:18rpx;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6rpx;min-height:100rpx;color:#6c7b61;font-size:23rpx}.tool.selected{background:#355c48;color:#fffefa;box-shadow:0 3rpx 8rpx #355c4818}.tool-icon{font-size:32rpx;height:34rpx;line-height:34rpx}.brush-control{display:flex;align-items:center;height:66rpx;flex-shrink:0;font-size:23rpx;color:#7b8574}.brush-slider{flex:1;margin-right:0}.cutout-feedback{display:flex;align-items:center;justify-content:center;gap:12rpx;height:66rpx;flex-shrink:0;font-size:22rpx;line-height:1.4;color:#7b8574;overflow:hidden}.failure{color:#a16a50}.cutout-overlays{position:absolute;top:0;left:0;right:0;height:0}.cutout-footer{display:flex;gap:18rpx;flex-shrink:0;padding:20rpx 28rpx;padding-bottom:calc(20rpx + env(safe-area-inset-bottom));border-top:1px solid #e8e9de;background:#fffefa}.compare-button{min-width:200rpx}.confirm-button{flex:1}.loading-ring{width:38rpx;height:38rpx;border:3rpx solid #c6d1b7;border-top-color:#355c48;border-radius:50%;animation:cutout-spin .7s linear infinite}@keyframes cutout-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.loading-ring{animation:none}}
</style>
