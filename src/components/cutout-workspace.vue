<template>
  <view class="workspace" @touchstart.stop.prevent="start" @touchmove.stop.prevent="move" @touchend.stop.prevent="end" @touchcancel.stop.prevent="cancelGesture">
    <image v-for="path in previewFrames" :key="path" class="workspace-preview" :src="path" mode="scaleToFill" :style="{ opacity: path === previewState.active ? 1 : 0 }" :draggable="false" @load="previewLoaded(path)" @error="canvasFailed" />
    <view v-if="!ready || !previewState.active" class="workspace-placeholder"><view v-if="!failure" class="workspace-spinner" /><text>{{ failure || '正在打开原图' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="failure" class="secondary press" @tap.stop="initialize">重试</button></view>
  </view>
</template>
<script>
import { markRaw } from 'vue';
import { createMaskEditor } from '../lib/cutout-mask.js';
import { fitImage, toImagePoint, zoomImage, clampImagePose } from '../lib/cutout-geometry.js';
import { maskRgba, maskOutline, drawCutout } from '../lib/cutout-renderer.js';
import { observeBlocking } from '../lib/ui-controller.js';
import { createWorkingCanvas, writeCanvasPng, releaseCanvasFile } from '../lib/working-canvas.js';
import { createPreviewQueue } from '../lib/cutout-preview.js';
export default {
  options: { virtualHost: true },
  props: { inputPath: String, maskPath: String, width: Number, height: Number, tool: String, brushSize: Number, compare: Boolean, active: Boolean, disabled: Boolean },
  emits: ['change', 'history', 'pose', 'ready', 'error', 'applying'],
  data() { return { ready: false, failure: '', applying: false, overlayBlocked: false, previewState: { active: '', pending: '' } }; },
  computed: { previewFrames() { return [this.previewState.active, this.previewState.pending].filter(Boolean); } },
  mounted() { this.releaseOverlay = observeBlocking(blocked => { this.overlayBlocked = blocked; if (blocked) { this.cancelGesture(); this.pause(); } else { this.draw(); this.animate(); } }); uni.onWindowResize?.(this.resizeViewport); this.$nextTick(this.initialize); },
  beforeUnmount() { this.release(); },
  watch: { inputPath() { this.$nextTick(this.initialize); }, compare() { this.draw(); }, active(value) { if (value) { this.$nextTick(this.resizeViewport); this.animate(); } else { this.cancelGesture(); this.pause(); } }, disabled(value) { if (value) this.cancelGesture(); }, tool() { this.cancelGesture(); this.$nextTick(this.resizeViewport); } },
  methods: {
    async initialize() {
      const version = this.version = (this.version || 0) + 1;
      this.pause(); this.previewQueue?.dispose(); this.previewState = { active: '', pending: '' }; this.ready = false; this.failure = ''; this.$emit('ready', false);
      if (!this.inputPath) return;
      try {
        if (!await this.syncCanvasLayout(version)) return;
        this.source = markRaw(createWorkingCanvas(this.width, this.height)); this.composite = markRaw(createWorkingCanvas(this.width, this.height)); this.maskCanvas = markRaw(createWorkingCanvas(this.width, this.height));
        const image = this.source.createImage();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = this.inputPath; });
        if (version !== this.version) return;
        const context = this.source.getContext('2d'); context.drawImage(image, 0, 0, this.width, this.height);
        this.original = markRaw(context.getImageData(0, 0, this.width, this.height));
        this.editor = markRaw(createMaskEditor({ width: this.width, height: this.height }));
        this.geometry = fitImage({ width: this.width, height: this.height }, this.rect); this.pose = { scale: 1, x: 0, y: 0 }; this.lassoPoints = []; this.pointer = null;
        if (this.maskPath) await this.applyMask(this.maskPath, false);
        if (version !== this.version) return;
        this.previewQueue = markRaw(createPreviewQueue({ render: () => writeCanvasPng(this.canvas), publish: state => { if (version === this.version) this.previewState = state; }, release: releaseCanvasFile, settle: () => this.$nextTick(), onError: error => { if (version === this.version) this.canvasFailed(error); } }));
        this.ready = true; this.dirty = true; this.changed(false); this.draw(); if (this.ready) this.animate();
      } catch (error) { if (version === this.version) this.canvasFailed(error); }
    },
    canvasFailed(error) { this.pause(); this.previewQueue?.dispose(); this.ready = false; this.failure = error?.message || '画布暂时无法打开，请重试'; this.$emit('ready', false); this.$emit('error', new Error(this.failure)); },
    async previewLoaded(path) { await this.previewQueue?.loaded(path); if (this.ready && this.previewState.active) this.$emit('ready', true); },
    async syncCanvasLayout(version) {
      const layoutVersion = this.layoutVersion = (this.layoutVersion || 0) + 1;
      await this.$nextTick();
      const rectangle = await new Promise(resolve => uni.createSelectorQuery().in(this).select('.workspace').boundingClientRect(resolve).exec());
      if (version !== this.version || layoutVersion !== this.layoutVersion) return false;
      if (!rectangle?.width || !rectangle.height) throw new Error('画布尺寸暂不可用，请重试');
      this.rect = rectangle; this.pixelRatio = 1;
      const canvasWidth = Math.round(rectangle.width * this.pixelRatio); const canvasHeight = Math.round(rectangle.height * this.pixelRatio);
      if (!this.canvas || this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) this.canvas = markRaw(createWorkingCanvas(canvasWidth, canvasHeight));
      this.geometry = fitImage({ width: this.width, height: this.height }, rectangle);
      return true;
    },
    async resizeViewport() {
      if (!this.ready || !this.canvas) return;
      const version = this.version;
      try {
        if (!await this.syncCanvasLayout(version) || !this.ready) return;
        this.pose = clampImagePose(this.pose, this.geometry); this.draw();
      } catch (error) { if (version === this.version) this.canvasFailed(error); }
    },
    pause() { clearInterval(this.animation); clearTimeout(this.renderTimer); this.animation = null; this.renderTimer = null; },
    animate() { this.pause(); if (!this.ready || !this.active || this.overlayBlocked) return; this.animation = setInterval(() => { if (!this.gesture && !this.compare && !this.applying && this.outline?.length) { this.phase = ((this.phase || 0) + 1) % 8; this.draw(); } }, 160); },
    release() { this.version = (this.version || 0) + 1; this.applyVersion = (this.applyVersion || 0) + 1; this.releaseOverlay?.(); uni.offWindowResize?.(this.resizeViewport); this.pause(); this.previewQueue?.dispose(); this.editor = null; this.original = null; this.canvas = null; this.source = null; this.composite = null; this.maskCanvas = null; },
    async applyMask(path, notify = true) {
      if (!this.editor || !this.maskCanvas) throw new Error('画布还未准备好');
      if (this.applying) throw new Error('正在应用选区');
      this.cancelGesture();
      const revision = this.editor.status().revision;
      const version = this.version; const applyVersion = this.applyVersion = (this.applyVersion || 0) + 1;
      this.applying = true; this.$emit('applying', true);
      try {
      const image = this.maskCanvas.createImage();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = path; });
      if (version !== this.version || applyVersion !== this.applyVersion || this.editor.status().revision !== revision || notify && (!this.active || this.disabled)) return false;
      if (image.width !== this.width || image.height !== this.height) throw new Error('选区尺寸不匹配');
      const context = this.maskCanvas.getContext('2d'); context.clearRect(0, 0, this.width, this.height); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, this.width, this.height).data; const values = new Uint8Array(this.width * this.height);
      for (let index = 0; index < values.length; index++) { const offset = index * 4; if (data[offset] !== data[offset + 1] || data[offset] !== data[offset + 2] || data[offset + 3] !== 255) throw new Error('选区无效'); values[index] = data[offset]; }
      if (notify) this.editor.apply(values); else this.editor = markRaw(createMaskEditor({ width: this.width, height: this.height, values }));
      this.dirty = true; this.changed(notify); this.draw(); return true;
      } finally { if (applyVersion === this.applyVersion) { this.applying = false; this.$emit('applying', false); } }
    },
    changed(notify = true) { this.dirty = true; this.$emit('history', this.editor.status()); if (notify) this.$emit('change'); },
    draw() {
      if (!this.active || this.overlayBlocked || !this.canvas || !this.original || !this.editor || !this.geometry) return;
      try {
      if (this.dirty) {
        const context = this.composite.getContext('2d'); const output = context.createImageData(this.width, this.height); output.data.set(maskRgba(this.original.data, this.editor.values())); context.putImageData(output, 0, 0);
        this.outline = maskOutline(this.editor.values(), this.width, this.height); this.dirty = false;
      }
      const context = this.canvas.getContext('2d'); context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
      drawCutout(context, this.compare ? this.source : this.composite, this.geometry, this.pose, { outline: this.compare ? [] : this.outline, phase: this.phase || 0, lasso: this.lassoPoints, pointer: this.pointer, brushRadius: ['keep', 'erase'].includes(this.tool) ? this.radius() : 0, original: Boolean(this.pointer) });
      this.previewQueue?.request();
      } catch (error) { this.canvasFailed(error); }
    },
    scheduleDraw() { if (!this.renderTimer) this.renderTimer = setTimeout(() => { this.renderTimer = null; this.draw(); }, 32); },
    points(event) { return Array.from(event.touches || []).map(touch => ({ x: touch.clientX !== undefined ? touch.clientX - this.rect.left : touch.x, y: touch.clientY !== undefined ? touch.clientY - this.rect.top : touch.y })); },
    radius() { return (this.brushSize || 24) / (2 * this.geometry.ratio * this.pose.scale); },
    beginPinch(points) { this.editor.endStroke(); this.lassoPoints = []; const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }; this.gesture = { kind: 'pinch', center, distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)), pose: { ...this.pose } }; this.pointer = null; },
    start(event) {
      if (!this.ready || !this.previewState.active || this.compare || this.disabled || this.applying || this.overlayBlocked) return;
      const points = this.points(event);
      if (points.length >= 2) { this.beginPinch(points); return; }
      if (!points.length) return;
      const point = points[0]; this.gesture = { kind: this.tool === 'move' ? 'move' : this.tool, start: point, pose: { ...this.pose } };
      const imagePoint = toImagePoint(point, this.pose, this.geometry);
      if (this.tool === 'lasso') this.lassoPoints = [imagePoint];
      if (['keep', 'erase'].includes(this.tool)) { this.editor.beginStroke(); this.editor.paint([imagePoint], this.radius(), this.tool === 'keep'); this.pointer = imagePoint; this.dirty = true; }
      this.draw();
    },
    move(event) {
      if (!this.ready || !this.gesture || this.disabled || this.applying || this.overlayBlocked) return;
      const points = this.points(event); if (!points.length) return;
      if (points.length >= 2) {
        if (this.gesture.kind !== 'pinch') { this.changed(); this.beginPinch(points); }
        const gesture = this.gesture; const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
        const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        const zoomed = zoomImage(gesture.pose, gesture.pose.scale * distance / gesture.distance, gesture.center, this.geometry);
        this.pose = clampImagePose({ ...zoomed, x: zoomed.x + center.x - gesture.center.x, y: zoomed.y + center.y - gesture.center.y }, this.geometry); this.$emit('pose', this.pose.scale);
      } else if (this.gesture.kind === 'move') { this.pose = clampImagePose({ ...this.gesture.pose, x: this.gesture.pose.x + points[0].x - this.gesture.start.x, y: this.gesture.pose.y + points[0].y - this.gesture.start.y }, this.geometry); }
      else if (this.gesture.kind !== 'pinch') {
        const point = toImagePoint(points[0], this.pose, this.geometry);
        if (this.gesture.kind === 'lasso') { const last = this.lassoPoints[this.lassoPoints.length - 1]; if (Math.hypot(point.x - last.x, point.y - last.y) > 1) this.lassoPoints.push(point); }
        if (['keep', 'erase'].includes(this.gesture.kind)) { this.editor.paint([point], this.radius(), this.gesture.kind === 'keep'); this.pointer = point; this.dirty = true; }
      }
      this.scheduleDraw();
    },
    end(event) {
      if (!this.gesture) return;
      if (this.gesture.kind === 'lasso') this.editor.lasso(this.lassoPoints);
      this.editor.endStroke(); this.changed(['lasso', 'keep', 'erase'].includes(this.gesture.kind)); this.gesture = null; this.lassoPoints = []; this.pointer = null; this.draw();
      if (event?.touches?.length >= 2) this.beginPinch(this.points(event));
    },
    cancelGesture() { if (this.editor) { const before = this.editor.status().revision; this.editor.endStroke(); if (this.editor.status().revision !== before) this.changed(); } this.gesture = null; this.pointer = null; this.lassoPoints = []; this.draw(); },
    undo() { if (!this.applying && !this.disabled && this.editor?.undo()) { this.changed(); this.draw(); } },
    redo() { if (!this.applying && !this.disabled && this.editor?.redo()) { this.changed(); this.draw(); } },
    zoom(delta) { if (!this.ready) return; this.pose = zoomImage(this.pose, this.pose.scale + delta, { x: this.rect.width / 2, y: this.rect.height / 2 }, this.geometry); this.$emit('pose', this.pose.scale); this.draw(); },
    reset() { if (!this.ready) return; this.pose = { scale: 1, x: 0, y: 0 }; this.$emit('pose', 1); this.draw(); },
    async exportMask() {
      if (!this.ready || this.applying || !this.editor.status().visible) throw new Error('请先保留需要的主体');
      this.end(); const context = this.maskCanvas.getContext('2d'); const image = context.createImageData(this.width, this.height); const values = this.editor.values();
      for (let index = 0; index < values.length; index++) { image.data[index * 4] = values[index]; image.data[index * 4 + 1] = values[index]; image.data[index * 4 + 2] = values[index]; image.data[index * 4 + 3] = 255; }
      context.putImageData(image, 0, 0);
      return writeCanvasPng(this.maskCanvas);
    }
  }
};
</script>
<style scoped>
.workspace{position:relative;width:100%;height:100%;overflow:hidden;border-radius:24rpx;background:#eeefe7;touch-action:none}.workspace-preview{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}.workspace-placeholder{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:28rpx;color:#778370;font-size:26rpx;background:#f0f1e9}.workspace-spinner{width:38rpx;height:38rpx;border:3rpx solid #c6d1b7;border-top-color:#355c48;border-radius:50%;animation:cutout-spin .7s linear infinite}@keyframes cutout-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.workspace-spinner{animation:none}}
</style>
