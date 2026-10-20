<template>
  <scroll-view class="board-scroll" :scroll-x="zoom" :scroll-y="zoom" :style="{ height: (controlledWidth ? boardHeight + 32 : Math.min(boardHeight, heightLimit) + 36) + 'px' }">
    <view class="board-frame" :style="{ width: (boardWidth + 32) + 'px', height: (boardHeight + 32) + 'px' }">
      <view v-if="mode === 'codes'" class="columns"><text v-for="item in columns" :key="item.label" class="axis-label" :style="{ left: item.position + '%' }">{{ item.label }}</text></view>
      <view v-if="mode === 'codes'" class="rows"><text v-for="item in rows" :key="item.label" class="axis-label" :style="{ top: item.position + '%' }">{{ item.label }}</text></view>
      <canvas id="board" type="2d" :style="{ width: boardWidth + 'px', height: boardHeight + 'px' }" @tap="tapCell"/>
    </view>
  </scroll-view>
</template>
<script>
import { markRaw } from 'vue';
import { drawPattern } from '../lib/render.js';
import { windowInfo } from '../lib/device.js';
export default {
  props: { pattern: Object, mode: { type: String, default: 'beads' }, heightLimit: { type: Number, default: 280 }, controlledWidth: Number, interactive: { type: Boolean, default: true }, zoom: Boolean, highlighted: String, completedRows: { type: Array, default: () => [] } },
  emits: ['paint'],
  data() { return { boardWidth: 260, boardHeight: 260, columns: [], rows: [], canvas: null }; },
  watch: { pattern: { handler() { this.paint(); }, deep: true }, mode() { this.paint(); }, zoom() { this.paint(); }, controlledWidth() { this.paint(); }, heightLimit() { this.paint(); }, highlighted() { this.paint(); }, completedRows: { handler() { this.paint(); }, deep: true } },
  mounted() { uni.createSelectorQuery().in(this).select('#board').fields({ node: true, size: true }).exec(result => { if (result[0]?.node) { this.canvas = markRaw(result[0].node); this.paint(); } }); },
  methods: {
    paint() {
      if (!this.canvas || !this.pattern?.cells) return;
      const width = this.controlledWidth || Math.min(windowInfo().windowWidth - 104, this.heightLimit * this.pattern.width / this.pattern.height) * (this.zoom ? 2.5 : 1);
      this.boardWidth = Math.max(1, width); this.boardHeight = width * this.pattern.height / this.pattern.width;
      const ratio = windowInfo().pixelRatio || 2;
      const labels = length => Array.from(new Set([0, 4, 9, 14, 19, 24, 29, 39, 49, 59, length - 1])).filter(index => index < length).map(index => ({ label: index + 1, position: (index + 0.5) / length * 100 }));
      this.columns = labels(this.pattern.width); this.rows = labels(this.pattern.height);
      const pixelWidth = Math.ceil(Math.max(width * ratio, this.mode === 'codes' ? this.pattern.width * 24 : 0));
      this.canvas.width = pixelWidth; this.canvas.height = Math.ceil(pixelWidth * this.pattern.height / this.pattern.width);
      drawPattern(this.canvas.getContext('2d'), this.pattern, { cellSize: pixelWidth / this.pattern.width, mode: this.mode, highlighted: this.highlighted, completedRows: this.completedRows });
    },
    tapCell(event) {
      if (!this.pattern || !this.interactive) return;
      uni.createSelectorQuery().in(this).select('#board').boundingClientRect(rectangle => {
        if (!rectangle) return;
        const column = Math.floor((event.detail.x - rectangle.left) / rectangle.width * this.pattern.width);
        const row = Math.floor((event.detail.y - rectangle.top) / rectangle.height * this.pattern.height);
        if (column >= 0 && row >= 0 && column < this.pattern.width && row < this.pattern.height) this.$emit('paint', { index: row * this.pattern.width + column, row, column });
      }).exec();
    }
  }
};
</script>
<style scoped>
.board-scroll{width:100%}.board-frame{position:relative;margin:0 auto;padding:20px 12px 12px 20px}.columns{position:absolute;left:20px;right:12px;top:4px;height:12px}.columns .axis-label{position:absolute;font-size:9px;color:#8b9385;transform:translateX(-50%)}.rows{position:absolute;left:0;top:20px;bottom:12px;width:16px}.rows .axis-label{position:absolute;font-size:9px;color:#8b9385;transform:translateY(-50%)}
</style>
