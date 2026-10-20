<template>
  <view v-if="show && work" class="pattern-detail">
    <app-header title="图纸详情"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="close-button press" aria-label="关闭图纸详情" @tap="$emit('close')">×</button></app-header>
    <view class="detail-copy"><text class="detail-title">{{ work.pattern.name }}</text><text class="muted">{{ work.pattern.width }} × {{ work.pattern.height }} 格 · {{ colors.length }} 色 · {{ total }} 颗 · {{ work.pattern.beadSize }} mm</text><text v-if="!work.publicPreview" class="muted">已完成 {{ work.completedRows.length }} / {{ work.pattern.height }} 行</text></view>
    <view class="detail-board"><pattern-viewer :pattern="work.pattern" :height-limit="viewerHeight" :highlighted="highlighted" :completed-rows="work.completedRows" :selecting-rows="selectingRows" :inspectable="false" :pose="pose" @update:pose="$emit('update:pose', $event)" @select-row="$emit('select-row', $event)" /></view>
    <scroll-view class="detail-scroll" scroll-y>
      <view v-if="work.sourceImageId" class="original-action"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="secondary press" :disabled="loadingOriginal" :loading="loadingOriginal" @tap="previewOriginal">{{ loadingOriginal ? '正在读取原图' : '查看自己的原图' }}</button><text class="muted">仅自己可见</text></view>
      <view class="detail-materials"><text class="detail-label">MARD 用量</text><view v-for="color in colors" :key="color.code" class="detail-color"><view class="bead" :style="{ background: color.hex }"><view class="bead-hole" /></view><text>{{ color.code }}</text><text class="muted">{{ color.count }} 颗</text></view><text class="muted">颜色以实物为准</text></view>
    </scroll-view>
  </view>
</template>
<script>
import paletteData from '../data/mard.json';
import { countColors } from '../lib/pattern.js';
import { downloadImage } from '../lib/cloud.js';
import { confirmAccount, showError } from '../lib/ui.js';
import { windowInfo } from '../lib/device.js';
export default {
  props: { show: Boolean, work: Object, highlighted: String, selectingRows: Boolean, pose: Object },
  emits: ['close', 'update:pose', 'select-row'],
  data() { return { loadingOriginal: false, viewerHeight: Math.max(160, Math.min(340, windowInfo().windowHeight * 0.38)) }; },
  computed: { colors() { return this.work ? countColors(this.work.pattern, paletteData.colors) : []; }, total() { return this.colors.reduce((sum, color) => sum + color.count, 0); } },
  methods: {
    async previewOriginal() {
      if (this.loadingOriginal || !this.work.sourceImageId) return;
      this.loadingOriginal = true;
      try {
        await confirmAccount();
        const filePath = await downloadImage(this.work.sourceImageId);
        if (!this.show) return;
        await new Promise((resolve, reject) => uni.previewImage({ urls: [filePath], current: filePath, success: resolve, fail: reject }));
      } catch (error) { showError(error); }
      finally { this.loadingOriginal = false; }
    }
  }
};
</script>
<style scoped>
.pattern-detail{position:fixed;inset:0;z-index:120;background:#f8f7f2;display:flex;flex-direction:column}.detail-heading{display:flex;align-items:center;justify-content:space-between;padding:12rpx 32rpx;font-size:32rpx;font-weight:600;border-bottom:2rpx solid #e9e9e0;flex-shrink:0}.detail-scroll{height:0;flex:1;min-height:0}.detail-copy{padding:28rpx 32rpx;display:flex;flex-direction:column;gap:8rpx}.detail-title{font-size:34rpx;font-weight:600;word-break:break-all}.detail-board{margin:0 24rpx;border:2rpx solid #e9e9e0;border-radius:28rpx;overflow:hidden;background:#fffefa}.original-action{padding:24rpx 32rpx;display:flex;flex-direction:column;gap:12rpx}.detail-materials{padding:24rpx 32rpx calc(40rpx + env(safe-area-inset-bottom))}.detail-label{display:block;font-size:28rpx;font-weight:600;margin-bottom:20rpx}.detail-color{display:flex;align-items:center;gap:24rpx;padding:18rpx 0;border-bottom:2rpx solid #e9e9e0}.detail-color .muted{margin-left:auto}
.detail-copy,.detail-board{flex-shrink:0}.detail-scroll{margin-top:12rpx}
</style>
