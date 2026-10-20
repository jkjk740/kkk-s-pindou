<template>
  <view class="card-entry" :class="{ 'reduce-motion': reduceMotion || item.entering === false }" :style="{ animationDelay: item.delay + 'ms' }"><button hover-start-time="0" hover-stay-time="0" class="public-card press" hover-class="press-hover" @tap="$emit('open', item.id)"><safe-image :height="item.imageHeight + 'rpx'" :src="imageUrl" :lazy-load="true" /><view class="public-copy"><text class="public-title">{{ item.title }}</text><view class="public-meta"><text class="public-author">{{ item.author.name }}</text><text class="public-count">↓ {{ item.downloadCount.toLocaleString() }}</text></view></view></button></view>
</template>
<script>
import { thumbnailUrl } from '../lib/community.js';
export default { props: { item: Object, reduceMotion: Boolean }, emits: ['open'], computed: { imageUrl() { return thumbnailUrl(this.item); } } };
</script>
<style scoped>
.public-card{display:block;width:100%;overflow:hidden;text-align:left;border-radius:24rpx;background:#fffefa;border:2rpx solid #e8eadf}.card-entry{width:100%;animation:card-in 280ms cubic-bezier(.23,1,.32,1) backwards}.public-art{display:block;width:100%;background:#f1f1e7}.public-copy{padding:20rpx 18rpx}.public-title{display:block;line-height:1.5;font-size:26rpx;font-weight:600;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.public-meta{display:flex;justify-content:space-between;gap:12rpx;margin-top:14rpx;font-size:21rpx;color:#7b8478}.public-author{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-count{flex-shrink:0;font-variant-numeric:tabular-nums}@keyframes card-in{0%{opacity:0;transform:translateY(24px)}75%{opacity:1;transform:translateY(-4px)}100%{opacity:1;transform:translateY(0)}}.reduce-motion{animation:none}@media(prefers-reduced-motion:reduce){.card-entry{animation:none}}
</style>
