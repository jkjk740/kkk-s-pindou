<template>
  <view v-if="show" class="custom-mask" @tap="$emit('close')" @touchmove.stop.prevent="noop"><view class="custom-sheet" @tap.stop="noop" @touchmove.stop="noop"><view class="sheet-handle" /><view class="sheet-heading"><text>{{ title }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="close-button press" aria-label="关闭" :disabled="busy" @tap="$emit('close')">×</button></view><slot /></view></view>
</template>
<script>
export default { props: { show: Boolean, title: String, busy: Boolean }, emits: ['close'], methods: { noop() {} } };
</script>
<style scoped>
.custom-mask{position:fixed;inset:0;bottom:var(--window-bottom,0px);z-index:300;background:#202c2557;display:flex;align-items:flex-end}.custom-sheet{width:100%;max-height:85vh;overflow-y:auto;background:#fffefa;border-radius:40rpx 40rpx 0 0;padding:20rpx 36rpx calc(32rpx + env(safe-area-inset-bottom));animation:sheet-in 220ms cubic-bezier(.32,.72,0,1)}@keyframes sheet-in{from{transform:translateY(28px);opacity:0}to{transform:translateY(0);opacity:1}}@media(prefers-reduced-motion:reduce){.custom-sheet{animation:none}}
</style>
