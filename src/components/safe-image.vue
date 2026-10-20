<template>
  <view class="image-frame" :style="{ height }">
    <view v-if="!loaded" class="image-placeholder" :class="{ 'image-loading': !failed && !!src }">
      <view class="placeholder-beads"><view v-for="index in 4" :key="index" class="placeholder-bead" /></view>
      <text v-if="failed || !src" class="placeholder-label">图片暂未加载</text>
      <view v-if="failed && src" class="image-retry press" role="button" aria-label="重新加载图片" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" :hover-stop-propagation="true" @tap.stop="retry">重试</view>
    </view>
    <image v-if="src && !failed" :key="attempt" class="image-content" :class="{ 'image-visible': loaded }" :src="src" mode="aspectFit" :lazy-load="lazyLoad" @load="loaded = true" @error="failed = true" />
  </view>
</template>
<script>
export default {
  props: { src: { type: String, default: '' }, height: { type: String, default: '320rpx' }, lazyLoad: Boolean },
  data() { return { loaded: false, failed: false, attempt: 0 }; },
  watch: { src() { this.loaded = false; this.failed = false; this.attempt++; } },
  methods: { retry() { this.loaded = false; this.failed = false; this.attempt++; } }
};
</script>
<style scoped>
.image-frame{position:relative;width:100%;overflow:hidden;background:#f1f1e7}.image-content{position:absolute;inset:0;width:100%;height:100%;opacity:0}.image-visible{opacity:1}.image-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16rpx;color:#7b8478}.placeholder-beads{display:flex;flex-wrap:wrap;gap:7rpx;width:67rpx;transform:rotate(-8deg)}.placeholder-bead{position:relative;width:30rpx;height:30rpx;border-radius:8rpx;background:#c9d3bd}.placeholder-bead::after{position:absolute;top:11rpx;left:11rpx;width:8rpx;height:8rpx;border-radius:50%;background:#f1f1e7;content:''}.placeholder-label{font-size:21rpx}.image-retry{display:flex;align-items:center;justify-content:center;min-width:110rpx;min-height:88rpx;font-size:22rpx;color:#355c48}.image-loading{animation:image-pulse 1.2s ease-in-out infinite}@keyframes image-pulse{50%{opacity:.45}}@media(prefers-reduced-motion:reduce){.image-loading{animation:none}}
</style>
