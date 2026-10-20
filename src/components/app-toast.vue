<template><view v-if="message" class="toast-wrap" :style="{ top: top + 'px' }"><view class="toast-card"><text class="toast-icon" :class="{ error: tone === 'error' }">{{ tone === 'error' ? '!' : '✓' }}</text><text>{{ message }}</text></view></view></template>
<script>
import { windowInfo } from '../lib/device.js';
export default { props: { message: String, tone: String }, data() { return { top: (windowInfo().statusBarHeight || 0) + 60 }; } };
</script>
<style scoped>
.toast-wrap{position:fixed;left:32rpx;right:32rpx;z-index:400;pointer-events:none}.toast-card{display:flex;align-items:center;gap:18rpx;background:#fffefa;border:2rpx solid #e6e9df;border-radius:24rpx;padding:26rpx;box-shadow:0 10rpx 32rpx #29372e12;font-size:25rpx;animation:toast-in 180ms cubic-bezier(.23,1,.32,1)}.toast-icon{width:40rpx;height:40rpx;line-height:36rpx;border:3rpx solid #355c48;border-radius:50%;text-align:center;color:#355c48}.toast-icon.error{color:#a16a50;border-color:#a16a50}@keyframes toast-in{from{transform:translateY(-8px);opacity:0}to{transform:translateY(0);opacity:1}}@media(prefers-reduced-motion:reduce){.toast-card{animation:none}}
</style>
