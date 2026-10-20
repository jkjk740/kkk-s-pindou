<template>
  <view class="screen"><app-header brand @height-change="headerHeight = $event"><button hover-start-time="0" hover-stay-time="0" class="publish-button press" hover-class="press-hover" aria-label="发布作品" @tap="publish">＋</button></app-header>
    <view class="gallery-controls" :style="{ top: headerHeight + 'px' }"><view class="gallery-search"><text>⌕</text><input :value="input" :maxlength="50" placeholder="搜索图纸或作者" confirm-type="search" @input="search" @confirm="applySearch" /><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="input" aria-label="清空搜索" @tap="clear">×</button></view><view class="gallery-filters"><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" :class="{ selected: sort === 'hot' }" @tap="sort = 'hot'">最热</button><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" :class="{ selected: sort === 'latest' }" @tap="sort = 'latest'">最新</button></view></view>
    <view class="gallery-content"><community-gallery ref="gallery" :query="query" :sort="sort" /></view><ui-host route="pages/home/index" />
  </view>
</template>
<script>
import CommunityGallery from '../../components/community-gallery.vue';
import { confirmAccount, showError, isCurrentPage } from '../../lib/ui.js';
import { dismiss } from '../../lib/ui-controller.js';
import { navigationMetrics } from '../../lib/device.js';
export default {
  components: { CommunityGallery },
  data() { return { headerHeight: navigationMetrics().statusHeight + navigationMetrics().navHeight, input: '', query: '', sort: 'hot', publishing: false }; },
  onShow() { uni.showTabBar({ animation: false }); const app = getApp(); if (app.globalData.communityChanged && this.$refs.gallery) { app.globalData.communityChanged = false; this.$refs.gallery.refresh(); } },
  onHide() { dismiss('pages/home/index'); clearTimeout(this.searchTimer); },
  onUnload() { dismiss('pages/home/index'); clearTimeout(this.searchTimer); },
  onReachBottom() { this.$refs.gallery?.loadMore(); },
  onPullDownRefresh() { Promise.resolve(this.$refs.gallery?.refresh()).finally(() => uni.stopPullDownRefresh()); },
  methods: {
    search(event) { this.input = event.detail.value; clearTimeout(this.searchTimer); this.searchTimer = setTimeout(this.applySearch, 250); },
    applySearch() { clearTimeout(this.searchTimer); this.query = this.input.trim(); },
    clear() { this.input = ''; this.applySearch(); },
    async publish() { if (this.publishing) return; this.publishing = true; try { await confirmAccount(); if (!isCurrentPage('pages/home/index')) return; uni.navigateTo({ url: '/pages/community/publish', fail: showError }); } catch (error) { if (isCurrentPage('pages/home/index')) showError(error); } finally { this.publishing = false; } }
  },
  onShareAppMessage() { return { title: '豆屿 · 图纸广场', path: '/pages/home/index' }; }
};
</script>
<style scoped>
.publish-button{display:flex;align-items:center;justify-content:center;width:88rpx;height:88rpx;font-size:44rpx;color:#355c48}.gallery-controls{position:fixed;left:0;right:0;z-index:35;height:208rpx;padding:12rpx 28rpx 20rpx;background:#f8f7f2}.gallery-search{height:84rpx;border-radius:22rpx;background:#eeefe7;padding:0 24rpx;display:flex;align-items:center;gap:16rpx;color:#7b8478}.gallery-search input{height:64rpx;flex:1;min-width:0;font-size:25rpx}.gallery-search button{display:flex;align-items:center;justify-content:center;width:60rpx;height:72rpx;font-size:32rpx}.gallery-filters{display:flex;gap:16rpx;margin-top:18rpx}.gallery-filters button{min-width:150rpx;height:70rpx;border-radius:36rpx;background:#eeefe7;color:#7b8478;display:flex;align-items:center;justify-content:center;font-size:25rpx}.gallery-filters .selected{background:#355c48;color:#fffefa}.gallery-content{padding:224rpx 28rpx 32rpx}
</style>
