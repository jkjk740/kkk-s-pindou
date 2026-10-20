<template>
  <view>
    <view v-if="columns[0].length || columns[1].length" class="waterfall"><view v-for="(column, index) in columns" :key="index" class="waterfall-column"><community-card v-for="item in column" :key="item.id" :item="item" :reduce-motion="reduceMotion" @open="open" /></view></view>
    <view v-else-if="loading" class="waterfall"><view v-for="index in 2" :key="index" class="waterfall-column"><view class="skeleton" :style="{ height: (index === 1 ? 400 : 320) + 'rpx' }" /><view class="skeleton" :style="{ height: (index === 1 ? 290 : 370) + 'rpx' }" /></view></view>
    <view v-else class="gallery-empty"><view class="empty-mark">▦</view><text>{{ error || (query ? '没有找到图纸' : '还没有图纸，来发布第一份吧') }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="error" class="secondary press" @tap="refresh">重试</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="error || !query" class="text-action local-entry press" @tap="create">去转图</button></view>
    <view v-if="columns[0].length || columns[1].length" class="gallery-footer"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="error" class="text-action press" @tap="retry">{{ error }} · 点此重试</button><text v-else>{{ loading ? '加载中…' : ended ? '已经到底了' : '' }}</text></view>
  </view>
</template>
<script>
import CommunityCard from './community-card.vue';
import { community } from '../lib/community.js';
import { createFeedState } from '../lib/community-feed.js';
import { errorMessage } from '../lib/errors.js';
import { showError } from '../lib/ui.js';
export default {
  components: { CommunityCard }, props: { query: { type: String, default: '' }, sort: { type: String, default: 'hot' }, reduceMotion: Boolean },
  data() { return { columns: [[], []], loading: false, ended: false, error: '', scope: 0 }; },
  watch: { query() { this.refresh(); }, sort() { this.refresh(); } },
  mounted() { this.feed = createFeedState(); this.onDownload = result => this.applyDownload(result); this.onNetwork = status => { if (status.isConnected && this.error && !this.loading) this.retry(); }; uni.$on('bead-public-download', this.onDownload); uni.onNetworkStatusChange(this.onNetwork); this.refresh(); },
  beforeUnmount() { this.scope = this.feed?.reset(); uni.$off('bead-public-download', this.onDownload); uni.offNetworkStatusChange(this.onNetwork); },
  methods: {
    applyDownload(result) {
      if (!Number.isSafeInteger(result?.downloadCount) || result.downloadCount < 0) return;
      this.feed.updateCount(result.id, result.downloadCount);
      const update = columns => columns.map(column => column.map(item => item.id === result.id ? { ...item, downloadCount: result.downloadCount } : item));
      this.columns = update(this.columns);
      if (this.fallbackColumns) this.fallbackColumns = update(this.fallbackColumns);
    },
    refresh() { if (!this.feed) return Promise.resolve(); const key = JSON.stringify([this.query, this.sort]); this.fallbackColumns = key === this.feedKey ? this.columns : [[], []]; this.feedKey = key; this.scope = this.feed.reset(); this.columns = [[], []]; this.ended = false; this.loading = false; return this.loadMore(); },
    retry() { return this.feed.cursor ? this.loadMore() : this.refresh(); },
    create() { uni.switchTab({ url: '/pages/editor/index', fail: showError }); },
    async loadMore() {
      if (this.loading || this.ended || !this.feed) return;
      const scope = this.scope;
      this.loading = true; this.error = '';
      try {
        const result = await community.list({ query: this.query, sort: this.sort, limit: 10, ...(this.feed.cursor ? { cursor: this.feed.cursor } : {}) });
        if (scope !== this.scope) return;
        this.columns = this.feed.append(scope, result.items, result.cursor);
        this.ended = !result.cursor;
        this.fallbackColumns = null;
      } catch (error) { if (scope === this.scope) { this.error = errorMessage(error, '图纸暂时无法加载，请重试'); if (!this.columns[0].length && !this.columns[1].length && this.fallbackColumns) this.columns = this.fallbackColumns; } }
      finally { if (scope === this.scope) this.loading = false; }
    },
    open(id) { uni.navigateTo({ url: '/pages/community/detail?id=' + id, fail: showError }); }
  }
};
</script>
<style scoped>
.waterfall{display:flex;align-items:flex-start;gap:20rpx}.waterfall-column{width:calc((100% - 20rpx)/2);display:flex;flex-direction:column;gap:20rpx}.skeleton{background:#e9ecdf;border-radius:24rpx}.gallery-empty{padding:100rpx 24rpx;text-align:center;color:#7b8478;font-size:26rpx;line-height:1.7}.gallery-empty .secondary{width:240rpx;margin:28rpx auto}.gallery-footer{padding:36rpx 0;text-align:center;color:#8b9385;font-size:22rpx}.gallery-footer .text-action{justify-content:center}
.empty-mark{font-size:64rpx;color:#b1bea5;margin-bottom:24rpx}.local-entry{justify-content:center;margin-top:20rpx}.skeleton{animation:skeleton-pulse 1.2s ease-in-out infinite}@keyframes skeleton-pulse{50%{opacity:.45}}@media(prefers-reduced-motion:reduce){.skeleton{animation:none}}
</style>
