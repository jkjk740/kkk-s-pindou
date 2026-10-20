<template>
  <view class="pattern-viewer">
    <view id="viewport" class="viewport" :style="{ height: heightLimit + 'px' }">
      <canvas id="viewer-canvas" type="2d" class="viewer-canvas" :style="{ height: heightLimit + 'px' }" @touchstart.stop="touchStart" @touchmove.stop.prevent="touchMove" @touchend.stop="touchEnd" @touchcancel.stop="touchCancel" />
      <view v-if="canvasError" class="canvas-fallback"><text>图纸暂时无法显示</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action press" @tap="prepareCanvas">重新加载</button></view>
    </view>
    <view class="viewer-tools">
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="zoom-button press" :class="{ 'zoom-disabled': !interactionActive || currentPose.scale <= 1 }" :disabled="!interactionActive || currentPose.scale <= 1" aria-label="缩小图纸" @tap="zoom(-0.5)">−</button>
      <text class="zoom-value">{{ Math.round(currentPose.scale * 100) }}%</text>
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="zoom-button press" :class="{ 'zoom-disabled': !interactionActive || currentPose.scale >= 6 }" :disabled="!interactionActive || currentPose.scale >= 6" aria-label="放大图纸" @tap="zoom(0.5)">＋</button>
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="fit-button press" :disabled="!interactionActive" @tap="reset">复位</button>
    </view>
    <text class="viewer-hint">双指缩放 · 单指拖动{{ selectingRows ? ' · 轻点选择行' : inspectable ? ' · 轻点查看详情' : '' }}</text>
  </view>
</template>
<script>
import { markRaw } from 'vue';
import { normalizePose, samePose, fitBoard, constrainPose, boardOrigin, zoomViewport, hitCell } from '../lib/viewport.js';
import { drawViewport } from '../lib/viewport-renderer.js';
import { drawPattern } from '../lib/render.js';
import { windowInfo } from '../lib/device.js';
import { observeBlocking } from '../lib/ui-controller.js';

function midpoint(points) { return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }; }
function distance(points) { return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); }

export default {
  props: {
    pattern: Object, highlighted: String, completedRows: { type: Array, default: () => [] }, selectingRows: Boolean, active: { type: Boolean, default: true }, inspectable: { type: Boolean, default: true },
    heightLimit: { type: Number, default: 320 }, pose: { type: Object, default: () => ({ x: 0, y: 0, scale: 1 }) }
  },
  emits: ['update:pose', 'select-row', 'inspect'],
  data() { return { overlayBlocked: false, canvasError: false, viewportWidth: Math.max(80, windowInfo().windowWidth - 82), currentPose: normalizePose(this.pose), gesture: null }; },
  computed: {
    interactionActive() { return this.active && !this.overlayBlocked; },
    board() { return fitBoard(this.pattern, this.viewportWidth, this.heightLimit); }
  },
  watch: {
    pose: { deep: true, handler(value) { if (!samePose(normalizePose(value), this.currentPose)) this.applyPose(value); } },
    active(value) { if (!value) this.touchCancel(); },
    pattern: { deep: true, handler() { this.requestPaint(); } },
    highlighted() { this.requestPaint(); },
    completedRows: { deep: true, handler() { this.requestPaint(); } },
    heightLimit() { this.$nextTick(this.prepareCanvas); }
  },
  mounted() {
    this.viewerDisposed = false;
    this.releaseOverlay = observeBlocking(blocked => { this.overlayBlocked = blocked; if (blocked) this.touchCancel(); });
    uni.onWindowResize?.(this.prepareCanvas);
    this.$nextTick(this.prepareCanvas);
  },
  beforeUnmount() {
    this.viewerDisposed = true;
    this.releaseOverlay?.();
    uni.offWindowResize?.(this.prepareCanvas);
    if (this.paintFrame != null) {
      if (this.canvas?.cancelAnimationFrame) this.canvas.cancelAnimationFrame(this.paintFrame);
      else clearTimeout(this.paintFrame);
    }
    this.canvas = null;
    this.context = null;
  },
  methods: {
    prepareCanvas() {
      if (this.viewerDisposed) return;
      const query = uni.createSelectorQuery().in(this);
      query.select('#viewport').boundingClientRect();
      query.select('#viewer-canvas').fields({ node: true, size: true });
      query.exec(results => {
        if (this.viewerDisposed) return;
        const rectangle = results?.[0];
        const canvas = results?.[1]?.node;
        if (!rectangle?.width || !canvas) { this.canvasError = true; return; }
        this.canvasError = false;
        this.viewportRectangle = rectangle;
        this.viewportWidth = rectangle.width;
        this.canvas = markRaw(canvas);
        this.pixelRatio = Math.min(3, windowInfo().pixelRatio || 1);
        const width = Math.ceil(rectangle.width * this.pixelRatio);
        const height = Math.ceil(this.heightLimit * this.pixelRatio);
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        this.context = markRaw(canvas.getContext('2d'));
        this.currentPose = constrainPose(this.currentPose, this.board);
        this.requestPaint();
      });
    },
    requestPaint() {
      if (this.viewerDisposed || !this.canvas || this.paintFrame != null) return;
      const paint = () => { this.paintFrame = null; this.paint(); };
      this.paintFrame = this.canvas.requestAnimationFrame ? this.canvas.requestAnimationFrame(paint) : setTimeout(paint, 16);
    },
    paint() {
      if (this.viewerDisposed || !this.context || !this.pattern?.cells) return;
      try {
        drawViewport(this.context, this.pattern, this.currentPose, this.board, this.pixelRatio, drawPattern, { highlighted: this.highlighted, completedRows: this.completedRows });
        this.canvasError = false;
      } catch { this.canvasError = true; }
    },
    applyPose(value) { this.currentPose = constrainPose(value, this.board); this.requestPaint(); },
    setPose(value) {
      const next = constrainPose(value, this.board);
      if (samePose(next, this.currentPose)) return;
      this.currentPose = next;
      this.requestPaint();
      this.$emit('update:pose', { ...next });
    },
    zoom(delta) {
      if (!this.interactionActive) return;
      this.touchCancel();
      this.setPose(zoomViewport(this.currentPose, this.currentPose.scale + delta, { x: this.viewportWidth / 2, y: this.heightLimit / 2 }, this.board));
    },
    reset() { if (this.interactionActive) { this.touchCancel(); this.setPose({ x: 0, y: 0, scale: 1 }); } },
    pointOf(touch) {
      if (Number.isFinite(touch.x) && Number.isFinite(touch.y)) return { x: touch.x, y: touch.y };
      const rectangle = this.viewportRectangle || { left: 0, top: 0 };
      return { x: (touch.clientX ?? touch.pageX) - rectangle.left, y: (touch.clientY ?? touch.pageY) - rectangle.top };
    },
    beginGesture(touches, cancelled = false) {
      const points = Array.from(touches).slice(0, 2).map(touch => this.pointOf(touch));
      this.gesture = points.length ? { points, pose: { ...this.currentPose }, cancelled: cancelled || points.length > 1, startedAt: Date.now() } : null;
    },
    touchStart(event) {
      if (!this.interactionActive) return;
      this.beginGesture(event.touches || [], Boolean(this.gesture));
    },
    touchMove(event) {
      if (!this.interactionActive || !this.gesture) return;
      const points = Array.from(event.touches || []).slice(0, 2).map(touch => this.pointOf(touch));
      const gesture = this.gesture;
      if (!points.length) return;
      if (points.length !== gesture.points.length) { this.beginGesture(event.touches, true); return; }
      if (points.length === 2) {
        const initialDistance = distance(gesture.points);
        if (initialDistance < 1) return;
        const anchor = midpoint(gesture.points);
        const currentAnchor = midpoint(points);
        const next = zoomViewport(gesture.pose, gesture.pose.scale * distance(points) / initialDistance, anchor, this.board, { x: currentAnchor.x - anchor.x, y: currentAnchor.y - anchor.y });
        this.gesture.cancelled = true;
        this.setPose(next);
      } else {
        const horizontal = points[0].x - gesture.points[0].x;
        const vertical = points[0].y - gesture.points[0].y;
        if (Math.hypot(horizontal, vertical) > 6) this.gesture.cancelled = true;
        if (this.gesture.cancelled) this.setPose({ ...gesture.pose, x: gesture.pose.x + horizontal, y: gesture.pose.y + vertical });
      }
    },
    touchCancel() { this.gesture = null; },
    touchEnd(event) {
      const gesture = this.gesture;
      if (event.touches?.length) { this.beginGesture(event.touches, true); return; }
      this.gesture = null;
      const touch = event.changedTouches?.[0];
      if (!this.interactionActive || !gesture || !touch || gesture.cancelled || Date.now() - gesture.startedAt > 600) return;
      const point = this.pointOf(touch);
      if (Math.hypot(point.x - gesture.points[0].x, point.y - gesture.points[0].y) > 6) return;
      if (!this.selectingRows) { if (this.inspectable) this.$emit('inspect'); return; }
      const cell = hitCell(point, boardOrigin(this.currentPose, this.board), { x: 0, y: 0, width: this.board.width, height: this.board.height }, this.pattern);
      if (cell && point.x >= this.board.padding && point.x <= this.viewportWidth - this.board.padding && point.y >= this.board.padding && point.y <= this.heightLimit - this.board.padding) this.$emit('select-row', cell);
    }
  }
};
</script>
<style scoped>
.viewport{position:relative;width:100%;overflow:hidden;background:#fffefa}.viewer-canvas{display:block;width:100%}.canvas-fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20rpx;background:#fffefa;color:#7b8478;font-size:24rpx}.viewer-tools{display:flex;align-items:center;justify-content:center;gap:12rpx;padding:12rpx 20rpx 0;border-top:2rpx solid #eeeee5}.zoom-button,.fit-button{min-width:88rpx;min-height:88rpx;display:flex;align-items:center;justify-content:center;border-radius:16rpx;color:#355c48;background:#f1f3eb}.zoom-button{font-size:36rpx}.fit-button{font-size:23rpx;padding:12rpx 24rpx}.zoom-value{min-width:100rpx;text-align:center;font-size:23rpx;color:#64765b;font-variant-numeric:tabular-nums}.zoom-disabled{opacity:.35}.viewer-hint{display:block;padding:12rpx 16rpx 22rpx;text-align:center;font-size:21rpx;color:#7b8478}
</style>
