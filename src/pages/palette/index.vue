<template>
  <view class="screen palette-screen">
    <app-header title="豆子色卡" />
    <view class="page-content">



      <view class="brand-banner">
        <view>
          <text class="brand-name">MARD <text class="brand-series">221 色</text></text>

        </view>
        <text class="reference-tag">参考色卡</text>
      </view>

      <view class="search palette-search">
        <view class="search-icon" />
        <input
          :value="query"
          class="search-input"
          placeholder="搜索豆子色号，如 M12、B7"
          placeholder-class="search-placeholder"
          confirm-type="search"
          :maxlength="32"
          :adjust-position="false"
          @input="onSearch"
        />
        <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="query" class="clear-search press" aria-label="清空搜索" @tap="clearSearch">×</button>
      </view>

      <scroll-view class="filter-scroll" :scroll-x="true" :show-scrollbar="false">
        <view class="filter-row">
          <button hover-start-time="0" hover-stay-time="0"
            v-for="filter in filters"
            :key="filter.id"
            class="chip press filter-chip"
            :class="{ selected: activeGroup === filter.id }"
            hover-class="press-hover"
            @tap="selectGroup(filter.id)"
          >{{ filter.label }}</button>
        </view>
      </scroll-view>

      <view class="color-heading">
        <text class="color-heading-title">{{ resultTitle }}</text>
        <text class="color-count">{{ visibleColors.length }} 色</text>
      </view>
      <view v-if="visibleColors.length" class="color-grid">
        <button hover-start-time="0" hover-stay-time="0"
          v-for="color in visibleColors"
          :key="color.code"
          class="color-card press"
          :class="{ 'color-selected': selectedCode === color.code }"
          hover-class="press-hover"
          :aria-label="color.code"
          @tap="selectColor(color.code)"
        >
          <view class="color-bead" :style="{ background: color.hex }"><view class="color-hole" /></view>
          <text class="color-code">{{ color.code }}</text>
          <text v-if="selectedCode === color.code" class="selected-check">✓</text>
        </button>
      </view>
      <view v-else class="empty palette-empty">
        <view class="empty-swatch"><view /><view /><view /></view>
        <text class="empty-title">这颗颜色还没找到</text>
        <text class="muted">试试 M12 或 B7。</text>
        <text class="muted empty-search-note">搜索会查找全部 221 色。</text>
        <button hover-start-time="0" hover-stay-time="0" class="secondary press reset-button" hover-class="press-hover" @tap="resetFilters">看看全部颜色</button>
      </view>

      <text class="palette-note">MARD 色号 · 颜色以实物为准</text>
    </view>

    <app-sheet v-if="sheetOpen && selectedColor" :show="true" title="颜色详情" @close="closeSheet">
        <scroll-view class="detail-scroll" :scroll-y="true" :show-scrollbar="false" @touchmove.stop="noop">
          <view class="selected-preview">
            <view class="large-bead" :style="{ background: selectedColor.hex }"><view class="large-hole" /></view>
            <view class="selected-copy">
              <text class="selected-brand">MARD 221 色</text>
              <text class="selected-code">{{ selectedColor.code }}</text>

            </view>
          </view>

          <view class="similar-heading">
            <text class="similar-title">相近色</text>
            <text class="similar-note">近似参考</text>
          </view>
          <view class="similar-grid">
            <button hover-start-time="0" hover-stay-time="0"
              v-for="color in similarColors"
              :key="color.code"
              class="similar-card press"
              hover-class="press-hover"
              :aria-label="'查看相近颜色 ' + color.code"
              @tap="selectColor(color.code)"
            >
              <view class="color-bead" :style="{ background: color.hex }"><view class="color-hole" /></view>
              <text class="color-code">{{ color.code }}</text>
            </button>
          </view>

        </scroll-view>
        <button hover-start-time="0" hover-stay-time="0" class="primary press use-color-button" hover-class="press-hover" @tap="useColor">用 {{ selectedColor.code }} 修图</button>
    </app-sheet>
    <ui-host route="pages/palette/index" />
  </view>
</template>

<script>
import paletteData from '../../data/mard.json';
import { showError } from '../../lib/ui.js';
import { dismiss } from '../../lib/ui-controller.js';

const filters = [
  { id: 'all', label: '全部', groups: [] },
  { id: 'warm', label: '暖色', groups: ['A', 'F'] },
  { id: 'green', label: '绿色', groups: ['B'] },
  { id: 'blue', label: '蓝色', groups: ['C'] },
  { id: 'purple', label: '粉紫', groups: ['D', 'E'] },
  { id: 'neutral', label: '中性色', groups: ['G', 'H', 'M'] }
];
const naturalCodes = ['M1', 'B27', 'A1', 'G1', 'E1', 'G2', 'A11', 'A12', 'B7', 'G7', 'H1', 'H21', 'C3', 'D1', 'E2', 'M2', 'M3', 'M4', 'M5', 'M6'];

function colorDistance(first, second) {
  const mean = (first.rgb[0] + second.rgb[0]) / 2;
  return (2 + mean / 256) * (first.rgb[0] - second.rgb[0]) ** 2
    + 4 * (first.rgb[1] - second.rgb[1]) ** 2
    + (2 + (255 - mean) / 256) * (first.rgb[2] - second.rgb[2]) ** 2;
}

export default {
  data() {
    return {
      palette: paletteData.colors,
      orderedPalette: paletteData.colors.slice().sort((first, second) => {
        const firstRank = naturalCodes.indexOf(first.code);
        const secondRank = naturalCodes.indexOf(second.code);
        return (firstRank < 0 ? naturalCodes.length : firstRank) - (secondRank < 0 ? naturalCodes.length : secondRank);
      }),
      filters,
      activeGroup: 'all',
      query: '',
      sheetOpen: false,
      sheetClosing: false,
      selectedColor: null,
      similarColors: []
    };
  },
  computed: {
    visibleColors() {
      const query = this.query.trim().toUpperCase();
      if (query) {
        return this.orderedPalette.filter(color => color.code.toUpperCase().includes(query));
      }
      const filter = this.filters.find(candidate => candidate.id === this.activeGroup);
      return !filter || !filter.groups.length
        ? this.orderedPalette
        : this.orderedPalette.filter(color => filter.groups.includes(color.group));
    },
    resultTitle() {
      if (this.query.trim()) return '搜索结果';
      const filter = this.filters.find(candidate => candidate.id === this.activeGroup);
      return this.activeGroup === 'all' ? '全部色号' : filter.label + '色号';
    },
    selectedCode() {
      return this.selectedColor ? this.selectedColor.code : '';
    }
  },
  onShow() {
    uni.showTabBar({ animation: false });
  },
  onHide() {
    this.resetSheet();
    dismiss('pages/palette/index');
  },
  onUnload() {
    dismiss('pages/palette/index');
    this.resetSheet();
  },
  methods: {
    onSearch(event) {
      this.query = event.detail.value;
    },
    clearSearch() {
      this.query = '';
    },
    selectGroup(id) {
      if (!this.filters.some(filter => filter.id === id)) return;
      this.activeGroup = id;
      this.query = '';
    },
    resetFilters() {
      this.query = '';
      this.activeGroup = 'all';
    },
    selectColor(code) {
      const selected = this.palette.find(color => color.code === code);
      if (!selected) return;
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.selectedColor = { ...selected, rgbLabel: selected.rgb.join(' / ') };
      this.similarColors = this.palette.filter(color => color.code !== code)
        .sort((first, second) => colorDistance(selected, first) - colorDistance(selected, second)).slice(0, 5);
      this.sheetClosing = false;
      this.sheetOpen = true;
    },
    closeSheet() {
      this.resetSheet();
    },
    resetSheet() {
      if (this.closeTimer) clearTimeout(this.closeTimer);
      this.closeTimer = null;
      this.sheetOpen = false;
      this.sheetClosing = false;
      this.selectedColor = null;
      this.similarColors = [];
    },
    useColor() {
      if (!this.selectedColor || this.sheetClosing) return;
      try {
        const app = getApp();
        const draft = app.$vm.getDraft();
        if (draft?.pattern) app.$vm.setDraft({ ...draft, editColor: this.selectedColor.code, editing: true });
        this.resetSheet();
        uni.switchTab({ url: '/pages/editor/index', fail: showError });
      } catch (error) {
        showError(error);
      }
    },
    noop() {}
  },
  onShareAppMessage() {
    return { title: '豆屿 · 把喜欢，一颗颗拼出来', path: '/pages/home/index' };
  }
};
</script>

<style scoped>
.page-content { padding: 28rpx 40rpx calc(44rpx + env(safe-area-inset-bottom)); }
.page-description { display: block; margin-top: 16rpx; color: #7b8478; font-size: 23rpx; line-height: 1.8; }
.brand-banner { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 0; padding: 24rpx; border: 2rpx solid #dce3d2; border-radius: 28rpx; background: #e6ebdd; }
.brand-name { display: block; color: #355c48; font-size: 34rpx; font-weight: 600; letter-spacing: 1rpx; }
.brand-series { margin-left: 8rpx; font-size: 26rpx; font-weight: 400; }
.brand-note { display: block; margin-top: 10rpx; color: #72836a; font-size: 21rpx; line-height: 1.6; }
.reference-tag { flex-shrink: 0; padding: 12rpx 16rpx; border-radius: 12rpx; background: #fffefa99; color: #64765b; font-size: 20rpx; }
.palette-search { min-height: 100rpx; padding: 6rpx 0 6rpx 26rpx; margin: 26rpx 0 18rpx; gap: 20rpx; }
.search-icon { position: relative; width: 28rpx; height: 28rpx; margin-right: 4rpx; flex-shrink: 0; border: 3rpx solid #8d9882; border-radius: 50%; }
.search-icon::after { position: absolute; right: -10rpx; bottom: -6rpx; width: 15rpx; height: 3rpx; border-radius: 2rpx; background: #8d9882; transform: rotate(45deg); content: ''; }
.search-input { min-width: 0; height: 88rpx; font-size: 23rpx; }
.search-placeholder { color: #939b8c; font-size: 23rpx; }
.clear-search { width: 88rpx; height: 88rpx; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #7b8478; font-size: 36rpx; }
.filter-scroll { width: 100%; white-space: nowrap; }
.filter-row { display: inline-flex; gap: 14rpx; padding: 6rpx 0 18rpx; }
.filter-chip { min-width: 102rpx; padding: 18rpx 22rpx; flex-shrink: 0; }
.filter-chip.selected { border-color: #355c48; background: #355c48; color: #fffefa; }
.color-heading { display: flex; align-items: center; justify-content: space-between; margin: 22rpx 0; }
.color-heading-title { font-size: 27rpx; font-weight: 500; }
.color-count { color: #7b8478; font-size: 21rpx; font-variant-numeric: tabular-nums; }
.color-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16rpx; }
.color-card { position: relative; min-width: 0; min-height: 158rpx; padding: 20rpx 6rpx 16rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16rpx; border: 2rpx solid #e9e9e0; border-radius: 24rpx; background: #fffefa; }
.color-card.color-selected { border-color: #355c48; background: #edf0e5; }
.color-bead { position: relative; width: 60rpx; height: 60rpx; flex-shrink: 0; border-radius: 18rpx; box-shadow: inset 0 0 0 2rpx #29372e0a; }
.color-hole { position: absolute; top: 50%; left: 50%; width: 17rpx; height: 17rpx; border-radius: 50%; background: #29372e26; box-shadow: 0 2rpx 0 #ffffff40; transform: translate(-50%, -50%); }
.color-code { font-size: 21rpx; line-height: 1.4; font-variant-numeric: tabular-nums; }
.selected-check { position: absolute; right: 8rpx; top: 5rpx; color: #355c48; font-size: 22rpx; }
.palette-empty { padding: 44rpx 24rpx; }
.empty-swatch { display: flex; align-items: center; justify-content: center; gap: 10rpx; margin-bottom: 24rpx; }
.empty-swatch view { width: 34rpx; height: 34rpx; border-radius: 11rpx; background: #a3b496; }
.empty-swatch view:nth-child(2) { background: #e6ebdd; }
.empty-swatch view:nth-child(3) { background: #efa980; }
.empty-title { display: block; margin-bottom: 14rpx; font-size: 30rpx; font-weight: 500; }
.palette-empty .muted { display: block; }
.empty-search-note { margin-top: 8rpx; }
.reset-button { width: 300rpx; margin: 26rpx auto 0; }
.palette-tip { display: flex; align-items: center; gap: 24rpx; margin-top: 32rpx; padding: 28rpx; background: #e6ebdd; border-radius: 26rpx; }
.tip-bead { position: relative; width: 54rpx; height: 54rpx; flex-shrink: 0; border-radius: 17rpx; background: #8da483; transform: rotate(-8deg); }
.tip-bead view { position: absolute; top: 19rpx; left: 19rpx; width: 16rpx; height: 16rpx; border-radius: 50%; background: #355c4855; }
.tip-copy { min-width: 0; }
.tip-title { display: block; color: #355c48; font-size: 25rpx; font-weight: 500; line-height: 1.5; }
.tip-note { display: block; margin-top: 10rpx; color: #72836a; font-size: 21rpx; line-height: 1.8; }
.palette-note { display: block; margin-top: 24rpx; color: #7b8478; font-size: 21rpx; line-height: 1.9; }
.detail-mask { position: fixed; z-index: 100; top: 0; right: 0; bottom: 0; left: 0; display: flex; align-items: flex-end; background: #202c2557; animation: mask-in 220ms cubic-bezier(.23, 1, .32, 1); }
.detail-sheet { width: 100%; max-height: 86vh; padding: 18rpx 40rpx calc(32rpx + env(safe-area-inset-bottom)); border-radius: 48rpx 48rpx 0 0; background: #f8f7f2; animation: sheet-in 220ms cubic-bezier(.23, 1, .32, 1); }
.detail-scroll { height: 52vh; max-height: 740rpx; }
.selected-preview { display: flex; align-items: center; gap: 34rpx; padding: 22rpx 4rpx 30rpx; }
.large-bead { position: relative; width: 164rpx; height: 164rpx; flex-shrink: 0; border-radius: 46rpx; box-shadow: inset 0 0 0 2rpx #29372e0a; }
.large-hole { position: absolute; top: 50%; left: 50%; width: 46rpx; height: 46rpx; border-radius: 50%; background: #29372e26; box-shadow: 0 3rpx 0 #ffffff40; transform: translate(-50%, -50%); }
.selected-copy { min-width: 0; }
.selected-brand { display: block; color: #7b8478; font-size: 20rpx; letter-spacing: 1rpx; }
.selected-code { display: block; margin: 10rpx 0; font-size: 56rpx; font-weight: 600; line-height: 1.3; font-variant-numeric: tabular-nums; }
.selected-note { display: block; color: #7b8478; font-size: 21rpx; line-height: 1.7; }
.color-values { overflow: hidden; border: 2rpx solid #e9e9e0; border-radius: 24rpx; background: #fffefa; }
.value-row { display: flex; align-items: center; justify-content: space-between; gap: 22rpx; min-height: 88rpx; padding: 22rpx 26rpx; }
.value-row + .value-row { border-top: 2rpx solid #eeeee5; }
.value-label { color: #7b8478; font-size: 22rpx; }
.value-text { font-size: 26rpx; font-variant-numeric: tabular-nums; }
.similar-heading { display: flex; align-items: center; justify-content: space-between; margin: 34rpx 0 22rpx; gap: 16rpx; }
.similar-title { font-size: 27rpx; font-weight: 500; }
.similar-note { color: #7b8478; font-size: 19rpx; }
.similar-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14rpx; }
.similar-card { min-height: 152rpx; padding: 20rpx 4rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14rpx; border: 2rpx solid #e9e9e0; border-radius: 22rpx; background: #fffefa; }
.detail-note { display: block; margin: 24rpx 0 28rpx; color: #7b8478; font-size: 21rpx; line-height: 1.9; }
.use-color-button { margin-top: 22rpx; }
.sheet-closing { animation: mask-out 160ms ease-out forwards; }
.sheet-closing .detail-sheet { animation: sheet-out 160ms ease-out forwards; }
@keyframes mask-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mask-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes sheet-in { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes sheet-out { from { transform: translateY(0); } to { transform: translateY(100%); } }
@media (prefers-reduced-motion: reduce) { .detail-mask, .detail-sheet { animation: none; } .press { transition: none; } .press-hover { transform: none; } }
</style>
