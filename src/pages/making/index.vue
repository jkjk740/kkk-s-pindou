<template>
  <view class="screen"><app-header title="开始跟拼" back/>
    <view v-if="work" class="content action-content">
      <view class="making-heading"><view><view class="title">{{ work.pattern.name }}</view><view class="subtitle">已完成 {{ work.completedRows.length }} / {{ work.pattern.height }} 行</view></view><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="chip press" @tap="detailOpen = true">详情 ⤢</button></view>
      <view class="progress-track"><view :style="{ width: progress + '%' }"/></view>
      <view class="making-board"><pattern-viewer v-if="!detailOpen" :pattern="work.pattern" :height-limit="320" :pose="pose" :selecting-rows="selectingRows" :highlighted="highlighted" :completed-rows="work.completedRows" @update:pose="setPose" @select-row="chooseRow" @inspect="detailOpen = true" /><view v-else class="board-placeholder" /></view>
      <view class="row-heading"><text>{{ selectedRow === null ? '这一幅，拼好了！' : '正在拼第 ' + (selectedRow + 1) + ' 行' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="chip press" :class="{ selected: selectingRows }" @tap="selectingRows = !selectingRows">{{ selectingRows ? '选行已开启' : '点图选行' }}</button></view>
      <scroll-view scroll-x class="row-picker"><view class="row-buttons"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-for="row in rowNumbers" :key="row" class="chip press" :class="{ selected: selectedRow === row, done: work.completedRows.includes(row) }" @tap="selectedRow = row">{{ work.completedRows.includes(row) ? '✓' : row + 1 }}</button></view></scroll-view>
      <view class="section-heading"><text class="heading">按颜色找豆子</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action press" @tap="highlighted = ''">显示全部</button></view>
      <view class="making-colors"><button hover-start-time="0" hover-stay-time="0" v-for="color in colors" :key="color.code" class="color-filter press" :class="{ selected: highlighted === color.code }" hover-class="press-hover" @tap="highlighted = highlighted === color.code ? '' : color.code"><view class="bead" :style="{ background: color.hex }"><view class="bead-hole"/></view><text>{{ color.code }}</text><text class="muted">{{ color.count }} 颗</text></button></view>

    </view>
    <view v-if="work" class="bottom-actions"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="secondary press" @tap="edit">修色</button><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" :disabled="selectedRow === null" @tap="toggleRow">{{ selectedRow === null ? '完成这幅作品 ✓' : work.completedRows.includes(selectedRow) ? '取消这一行完成' : '这一行拼好了 ✓' }}</button></view>
    <pattern-detail :show="detailOpen" :work="work" :highlighted="highlighted" :selecting-rows="selectingRows" :pose="pose" @update:pose="setPose" @select-row="chooseRow" @close="detailOpen = false" />
    <ui-host route="pages/making/index" />
  </view>
</template>
<script>
import { countColors, nextIncompleteRow } from '../../lib/pattern.js';
import { applyRowProgress } from '../../lib/progress.js';
import { toast, showError } from '../../lib/ui.js';
import { dismiss } from '../../lib/ui-controller.js';
export default {
  data() { return { work: null, colors: [], selectedRow: 0, highlighted: '', detailOpen: false, selectingRows: false, pose: { x: 0, y: 0, scale: 1 } }; },
  computed: { progress() { return this.work ? this.work.completedRows.length / this.work.pattern.height * 100 : 0; }, rowNumbers() { return this.work ? Array.from({ length: this.work.pattern.height }, (_, index) => index) : []; } },
  onShow() {
    const app = getApp(); const draft = app.$vm.getDraft();
    if (!draft?.id) { this.work = null; uni.switchTab({ url: '/pages/editor/index' }); return; }
    if (this.work?.id === draft.id && this.detailOpen) return;
    if (this.work?.id !== draft.id) this.pose = { x: 0, y: 0, scale: 1 };
    this.work = app.globalData.repository.find(draft.id);
    if (!this.work) { toast('先保存一幅图纸，再来跟拼'); uni.switchTab({ url: '/pages/editor/index' }); return; }
    this.selectedRow = nextIncompleteRow(this.work.pattern.height, this.work.completedRows);
    this.colors = countColors(this.work.pattern, app.globalData.palette);
    if (app.globalData.detailOnShow) { app.globalData.detailOnShow = false; this.detailOpen = true; }
  },
  onHide() { dismiss('pages/making/index'); },
  onUnload() { dismiss('pages/making/index'); },
  methods: {
    setPose(pose) { this.pose = pose; },
    chooseRow(cell) { this.selectedRow = cell.row; },
    toggleRow() {
      if (this.selectedRow === null) return;
      try {
        const { completedRows, nextRow } = applyRowProgress(this.work, this.selectedRow);
        this.work = getApp().globalData.repository.save({ ...this.work, completedRows });
        getApp().$vm.setDraft(this.work);
        this.selectedRow = nextRow;
        if (this.selectedRow === null) toast('作品完成');
      } catch (error) { showError(error); }
    },
    edit() { getApp().$vm.setDraft({ ...this.work, editing: true }); uni.switchTab({ url: '/pages/editor/index' }); }
  }
};
</script>
<style scoped>
.making-heading{display:flex;align-items:center;justify-content:space-between}.making-heading .title{font-size:40rpx}.progress-track{height:12rpx;background:#e5e9dd;border-radius:12rpx;overflow:hidden;margin:24rpx 0 32rpx}.progress-track view{height:100%;background:#829e70}.making-board{background:#fffefa;border:2rpx solid #e9e9e0;border-radius:32rpx;overflow:hidden}.row-heading{display:flex;justify-content:space-between;align-items:center;margin:30rpx 0 20rpx;font-size:28rpx}.row-picker{width:100%;white-space:nowrap}.row-buttons{display:inline-flex;gap:12rpx}.row-buttons .chip{min-width:88rpx}.chip.done{color:#355c48;background:#edf1e7}.making-colors{display:flex;flex-wrap:wrap;gap:16rpx}.color-filter{width:calc((100% - 32rpx)/3);background:#fffefa;border:2rpx solid #e9e9e0;border-radius:24rpx;padding:20rpx 8rpx;display:flex;flex-direction:column;align-items:center;gap:12rpx;font-size:24rpx}.color-filter.selected{border-color:#829e70;background:#e6ebdd}.making-note{margin-top:30rpx;text-align:center}
.board-placeholder{height:calc(320px + 168rpx)}
</style>
