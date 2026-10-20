<template>
  <view class="screen"><app-header title="图纸详情" back /><view v-if="item" class="content action-content">
    <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="detail-art press" @tap="detailOpen = true"><safe-image :src="imageUrl" height="560rpx" /><text class="image-label">查看大图 ⤢</text></button>
    <view class="public-heading"><text class="title">{{ item.title }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="item.canManage" class="text-action press" @tap="manage">•••</button></view><view class="author-row"><text>{{ item.author.name }}</text><text>↓ {{ item.downloadCount.toLocaleString() }} 次下载</text></view>
    <text class="subtitle">{{ item.width }} × {{ item.height }} · {{ item.colorCount }} 色 · {{ item.beadCount }} 颗</text>
    <view class="materials"><text class="material-title">MARD 用量</text><view v-for="color in colors" :key="color.code" class="material-row"><view class="bead" :style="{ background: color.hex }"><view class="bead-hole" /></view><text>{{ color.code }}</text><text class="quantity">{{ color.count }} 颗</text></view></view>
  </view><view v-else class="empty"><text>{{ error || '正在加载图纸' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="error" class="secondary press" @tap="load">重试</button></view>
  <view v-if="item" class="bottom-actions"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="secondary press" @tap="start">开始拼</button><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" :disabled="exportBusy" @tap="openExport">↓ 下载图纸</button></view>
  <pattern-detail :show="detailOpen" :work="previewWork" :pose="pose" @update:pose="pose = $event" @close="detailOpen = false" />
  <export-sheet :show="exportOpen" :pattern="item?.pattern" :preview-src="imageUrl" :busy="exportBusy" :phase="exportPhase" :progress="exportProgress" :selection="exportSelection" :error="exportError" :retry-path="retryPath" :permission-denied="albumDenied" @close="closeExport" @direction="resetResult" @save="exportImage" @retry="retryImage" />
  <ui-host route="pages/community/detail" />
  </view>
</template>
<script>
import { markRaw } from 'vue';
import { createWorkingCanvas, releaseCanvasFile } from '../../lib/working-canvas.js';
import { community, thumbnailUrl } from '../../lib/community.js';
import { communityDownloads } from '../../lib/community-downloads.js';
import { countColors } from '../../lib/pattern.js';
import { encodeExport, savePngToAlbum } from '../../lib/render.js';
import { createExportPlan } from '../../lib/export-plan.js';
import { createExportSession } from '../../lib/export-session.js';
import { confirm, showActions, showError, toast } from '../../lib/ui.js';
import { currentRoute, dismiss } from '../../lib/ui-controller.js';
import { errorMessage } from '../../lib/errors.js';
import paletteData from '../../data/mard.json';
export default {
  data() { return { id: '', item: null, error: '', loading: false, detailOpen: false, pose: { x: 0, y: 0, scale: 1 }, exportOpen: false, exportBusy: false, exportPhase: '', exportProgress: '', exportSelection: { mirror: false, format: 'full' }, exportError: '', retryPath: '', albumDenied: false, intent: null }; },
  computed: { imageUrl() { return this.item ? thumbnailUrl(this.item) : ''; }, colors() { return this.item ? countColors(this.item.pattern, paletteData.colors) : []; }, previewWork() { return this.item ? { pattern: this.item.pattern, completedRows: [], publicPreview: true } : null; } },
  onLoad(options) { this.id = options.id; this.load(); this.onDownload = result => { if (this.item && result.id === this.id) this.item = { ...this.item, downloadCount: result.downloadCount }; }; uni.$on('bead-public-download', this.onDownload); },
  onShow() { communityDownloads.retryPending(); },
  onHide() { dismiss('pages/community/detail'); },
  onUnload() { dismiss('pages/community/detail'); this.disposed = true; releaseCanvasFile(this.exportSession?.status().file); uni.$off('bead-public-download', this.onDownload); },
  methods: {
    async load() { if (this.loading) return; this.loading = true; this.error = ''; try { const item = await community.get(this.id); if (!this.disposed) this.item = item; } catch (error) { if (!this.disposed) this.error = errorMessage(error, '图纸暂时无法加载，请重试'); } finally { this.loading = false; } },
    start() {
      try {
        const saved = getApp().globalData.repository.save({ pattern: JSON.parse(JSON.stringify(this.item.pattern)), completedRows: [], originPublicId: this.item.id, sourceImageId: null });
        getApp().$vm.setDraft(saved); uni.navigateTo({ url: '/pages/making/index', fail: showError });
      } catch (error) { showError(error); }
    },
    async manage() {
      try {
        if (await showActions([{ id: 'withdraw', label: '下架作品', destructive: true }]) !== 'withdraw') return;
        if (!await confirm({ title: '下架这份图纸？', content: '下架后其他人将无法下载。', confirmText: '下架', destructive: true })) return;
        await community.withdraw(this.id);
        getApp().globalData.communityChanged = true;
        if (this.disposed || currentRoute() !== 'pages/community/detail') return;
        this.item = null; this.error = '这份图纸已下架'; this.exportOpen = false;
      } catch (error) { if (!this.disposed && currentRoute() === 'pages/community/detail') showError(error); }
    },
    openExport() { if (this.exportBusy || !this.item) return; if (!this.exportSession || this.exportSession.status().complete || this.exportFingerprint !== JSON.stringify(this.item.pattern)) this.resetResult(); this.exportOpen = true; },
    closeExport() { if (!this.exportBusy) this.exportOpen = false; },
    resetResult(selection) { if (!this.exportBusy) { releaseCanvasFile(this.exportSession?.status().file); this.exportSession = null; this.exportFingerprint = ''; this.exportSelection = selection || { mirror: false, format: 'full' }; this.retryPath = ''; this.exportError = ''; this.exportProgress = ''; this.albumDenied = false; this.intent = null; } },
    canvas() { try { return Promise.resolve(markRaw(createWorkingCanvas())); } catch (error) { return Promise.reject(error); } },
    async finishDownload() { if (!this.intent || this.intent.expiresAt <= Date.now()) this.intent = await communityDownloads.begin(this.id); this.exportOpen = false; this.retryPath = ''; if (currentRoute() === 'pages/community/detail') toast('已保存到相册'); const count = await communityDownloads.complete(this.id, this.intent); if (this.item && count !== null) this.item = { ...this.item, downloadCount: count }; },
    async exportImage({ mirror, format = 'full' }) {
      if (this.exportBusy) return;
      if (this.exportSession && !this.exportSession.status().complete && this.exportFingerprint === JSON.stringify(this.item.pattern) && mirror === this.exportSelection.mirror && format === this.exportSelection.format) return this.retryImage();
      this.resetResult({ mirror, format }); this.exportBusy = true;
      try {
        this.intent = await communityDownloads.begin(this.id);
        if (this.disposed || currentRoute() !== 'pages/community/detail') return;
        const canvas = await this.canvas();
        this.exportFingerprint = JSON.stringify(this.item.pattern);
        this.exportSession = markRaw(createExportSession({ pages: createExportPlan(this.item.pattern, paletteData.colors, { mirror, format }), renderPage: page => encodeExport(canvas, page.pattern, { mirror: page.mirror, cellsMirrored: page.cellsMirrored, block: page.block, cellSize: page.block ? 40 : undefined, scope: this, onPhase: phase => { this.exportPhase = phase; } }), savePage: async path => { await savePngToAlbum(path, { openSettings: this.albumDenied }); this.albumDenied = false; }, releaseFile: releaseCanvasFile, onProgress: progress => { this.exportPhase = progress.phase; this.exportProgress = `第 ${progress.page} / ${progress.total} 张`; } }));
        await this.exportSession.run();
        await this.finishDownload();
      } catch (error) { this.exportError = errorMessage(error, '导出未完成，请重试'); this.retryPath = error.retryPath || (this.exportSession ? 'pending' : ''); this.albumDenied = error.code === 'ALBUM_PERMISSION'; }
      finally { this.exportBusy = false; this.exportPhase = ''; }
    },
    async retryImage() {
      if (this.exportBusy || !this.exportSession) return;
      this.exportBusy = true; this.exportPhase = 'saving';
      try { if (!this.intent || this.intent.expiresAt <= Date.now()) this.intent = await communityDownloads.begin(this.id); await this.exportSession.retry(); await this.finishDownload(); }
      catch (error) { this.exportError = errorMessage(error, '保存未完成，请重试'); this.retryPath = error.retryPath || 'pending'; this.albumDenied = error.code === 'ALBUM_PERMISSION' || this.albumDenied; }
      finally { this.exportBusy = false; this.exportPhase = ''; }
    }
  },
  onShareAppMessage() { return { title: this.item?.title || '豆屿图纸', path: '/pages/community/detail?id=' + this.id }; }
};
</script>
<style scoped>
.detail-art{display:block;width:100%;background:#e6ebdd;border-radius:28rpx;position:relative;overflow:hidden}.detail-image{display:block;width:100%;height:560rpx}.image-label{position:absolute;right:20rpx;bottom:20rpx;background:#fffefa;border-radius:18rpx;padding:14rpx 20rpx;font-size:22rpx;color:#355c48}.public-heading{display:flex;align-items:center;gap:16rpx;margin-top:28rpx}.public-heading .title{flex:1;font-size:38rpx}.author-row{display:flex;justify-content:space-between;gap:20rpx;color:#7b8478;font-size:24rpx;margin-top:20rpx}.materials{background:#fffefa;border-radius:28rpx;padding:24rpx;margin-top:30rpx}.material-title{font-size:28rpx;font-weight:600}.material-row{display:flex;align-items:center;gap:24rpx;padding:20rpx 0;border-bottom:2rpx solid #eef0e7}.quantity{margin-left:auto;color:#7b8478;font-size:24rpx}.empty{margin:32rpx;min-height:360rpx;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28rpx;color:#7b8478}.empty .secondary{min-width:240rpx}
</style>
