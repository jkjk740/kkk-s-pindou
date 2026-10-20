<template>
  <app-sheet :show="show" title="材料清单" :busy="busy" @close="!busy && $emit('close')">
      <view class="muted">{{ total }} 颗 · {{ colors.length }} 色 · {{ width }} × {{ height }} cm</view>
      <scroll-view class="materials-list" scroll-y><view v-for="color in colors" :key="color.code" class="material-row"><view class="bead" :style="{ background: color.hex }"><view class="bead-hole"/></view><view class="color-name"><text>{{ color.code }}</text></view><text>{{ color.count }} 颗</text></view></scroll-view>
      <view class="muted disclaimer">MARD 色号 · 以实物为准</view><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" :disabled="busy" @tap="$emit('export')">导出图片</button>
  </app-sheet>
</template>
<script>
import paletteData from '../data/mard.json';
import { countColors } from '../lib/pattern.js';
export default {
  props: { show: Boolean, pattern: Object, busy: Boolean }, emits: ['close', 'export'],
  computed: {
    colors() { return this.pattern ? countColors(this.pattern, paletteData.colors) : []; },
    total() { return this.colors.reduce((sum, color) => sum + color.count, 0); },
    width() { return ((this.pattern?.width || 0) * (this.pattern?.beadSize || 2.6) / 10).toFixed(1); },
    height() { return ((this.pattern?.height || 0) * (this.pattern?.beadSize || 2.6) / 10).toFixed(1); }
  }
};
</script>
<style scoped>
.materials-list{height:46vh;margin:20rpx 0}.material-row{display:flex;align-items:center;gap:24rpx;padding:22rpx 0;border-bottom:2rpx solid #e9e9e0;font-size:26rpx}.color-name{display:flex;flex:1;flex-direction:column;gap:4rpx}.disclaimer{margin-bottom:24rpx}
</style>
