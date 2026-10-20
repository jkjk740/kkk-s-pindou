<template>
  <view class="header-spacer" :style="{ height: totalHeight + 'px' }"><view class="app-header" :style="{ paddingTop: statusHeight + 'px' }"><view class="nav-row" :style="{ height: navHeight + 'px', paddingRight: rightPadding + 'px' }"><button hover-start-time="0" hover-stay-time="0" v-if="back" class="back-button press" hover-class="press-hover" @tap="goBack">‹</button><view v-if="brand" class="brand-mark"><view class="brand-bead"/><view class="brand-bead brand-leaf"/><view class="brand-bead brand-pale"/><view class="brand-bead"/></view><text class="nav-title">{{ brand ? '豆屿' : title }}</text><view class="nav-action"><slot /></view></view></view></view>
</template>
<script>
import { navigationMetrics } from '../lib/device.js';
export default {
  props: { title: String, brand: Boolean, back: Boolean }, emits: ['height-change'],
  data() { return navigationMetrics(); },
  computed: { totalHeight() { return this.statusHeight + this.navHeight; } },
  mounted() { this.measure(); uni.onWindowResize?.(this.measure); },
  beforeUnmount() { uni.offWindowResize?.(this.measure); },
  methods: {
    measure() { Object.assign(this, navigationMetrics()); this.$emit('height-change', this.totalHeight); },
    goBack() { if (getCurrentPages().length > 1) uni.navigateBack(); else uni.switchTab({ url: '/pages/home/index' }); }
  }
};
</script>
<style scoped>
.header-spacer{flex-shrink:0}.app-header{position:fixed;top:0;left:0;right:0;z-index:40;background:#f8f7f2}.nav-row{display:flex;align-items:center;gap:14rpx;padding-left:36rpx}.nav-title{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:32rpx;font-weight:600;white-space:nowrap}.nav-action{margin-left:auto;flex-shrink:0}.back-button{font-size:56rpx;width:72rpx;height:88rpx;display:flex;align-items:center;justify-content:center;margin-left:-20rpx}.brand-mark{width:42rpx;display:flex;flex-wrap:wrap;gap:5rpx}.brand-bead{width:17rpx;height:17rpx;background:#355c48;border-radius:5rpx}.brand-leaf{background:#9daf8d}.brand-pale{background:#c6d1b7}
</style>
