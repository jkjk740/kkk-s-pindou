<template>
  <view class="screen"
    ><app-header title="图片转图纸" @height-change="headerHeight = $event" />
    <view v-if="!pattern" class="upload-content">
      <view class="upload-card" :style="{ height: uploadCardHeight + 'px' }">
        <image v-if="!backgroundFailed" class="upload-background" src="/static/editor-upload.jpg" mode="aspectFill" @error="backgroundFailed = true" />
        <view v-else class="upload-background-fallback"><view class="fallback-bead fallback-sage" /><view class="fallback-bead fallback-peach" /><view class="fallback-bead fallback-butter" /></view>
        <button hover-start-time="0" hover-stay-time="0" class="primary press upload-button" :class="{ pending: blocked }" hover-class="press-hover" :disabled="blocked" @tap="upload">
          <view v-if="blocked" class="upload-spinner" /><view v-else class="upload-icon"><view class="upload-arrow" /><view class="upload-tray" /></view>
          <text>{{ blocked ? (busy ? '正在生成图纸' : uploadPhase || '正在准备') : '上传图片' }}</text>
        </button>
      </view>
    </view>
    <view
      v-if="pattern"
      class="content action-content"
      ><view class="editor-heading"
        ><view
          ><view class="editor-title">{{ pattern.name }}</view
          ><view class="subtitle"
            >{{ physicalWidth }} ×
            {{ physicalHeight }} cm</view
          ></view
        ><button hover-start-time="0" hover-stay-time="0"
          class="image-button press"
          hover-class="press-hover"
          @tap="upload"
          :disabled="blocked"
        >
          换图
        </button></view
      ><view class="preview-card"
        ><view class="preview-toolbar"
          ><view class="segments"
            ><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0"
              v-for="(item, index) in views"
              :key="item.id"
              :class="['segment ', view === item.id ? 'selected' : '', '']"
              :data-value="item.id"
              @tap="changeView"
            >
              {{ item.label }}
            </button></view
          ><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="edit-button press" @tap="toggleEdit">
            {{ editing ? "完成" : "修色" }} ✎
          </button></view
        ><view class="preview-stage"
          ><image
            v-if="view === 'original' && originalPath"
            class="original"
            :src="originalPath"
            mode="aspectFit"
          /><bead-canvas
            v-else-if="!exportOpen && editorActive"
            :pattern="pattern"
            :mode="view"
            :height-limit="250"
            @paint="paint"
          /><view v-else class="paused-preview"><image v-if="exportPreviewPath" class="original" :src="exportPreviewPath" mode="aspectFit" /></view><view v-if="busy || uploading" class="loading">{{ uploading ? uploadPhase : '正在生成图纸…' }}</view></view
        ><view v-if="editing" class="edit-strip"
          ><text>点格子修色</text
          ><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" @tap="openBrush">
            <view class="bead" :style="{ background: editColor.hex }"
              ><view class="bead-hole" /></view
            >{{ editColor.code }}</button
          ><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" @tap="undoPaint">撤销</button></view
        ><view class="preview-meta"
          ><text
            >{{ pattern.width }} × {{ pattern.height }} 格 · {{ total }} 颗 ·
            {{ colors.length }} 色</text
          ><text>✓ MARD 色号</text></view
        ></view
      ><view class="settings"
        ><view class="setting-label"
          ><text>图纸大小</text><text>长边格数</text></view
        ><view class="options"
          ><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0"
            v-for="(item, index) in sizes"
            :key="item"
            :class="['chip ', size === item ? 'selected' : '', '']"
            :data-value="item"
            @tap="changeSize"
            :disabled="blocked"
          >
            {{ item }} 格
          </button></view
        ><view class="setting-label"
          ><text>最多颜色</text><text>少色易备料</text></view
        ><view class="options"
          ><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0"
            v-for="(item, index) in colorLimits"
            :key="item"
            :class="['chip ', maxColors === item ? 'selected' : '', '']"
            :data-value="item"
            @tap="changeColors"
            :disabled="blocked"
          >
            {{ item === 221 ? '全部' : item + ' 色' }}
          </button></view
        ><view class="settings-bottom"
          ><radio-group class="bead-sizes" @change="changeBeadSize"
            ><label
              ><radio
                :disabled="blocked"
                value="2.6"
                :checked="beadSize === 2.6"
                color="#355c48"
              />2.6 mm</label
            ><label
              ><radio :disabled="blocked" value="5" :checked="beadSize === 5" color="#355c48" />5
              mm</label
            ></radio-group
          ></view><view v-if="draft && draft.sourceImageId" class="cutout-actions"><button hover-start-time="0" hover-stay-time="0" class="cutout-button press" :disabled="blocked" hover-class="press-hover" @tap="openCutout"><view class="cutout-icon"><view class="cutout-icon-dot" /></view><text>{{ draft.cutoutId ? '调整选区' : '抠图去背景' }}</text><text class="cutout-arrow">›</text></button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-if="draft.cutoutId" class="text-action restore-original press" :disabled="blocked" @tap="restoreOriginal">恢复原图</button></view></view
      ><view class="used-colors"
        ><text>这次用到 {{ colors.length }} 色</text
        ><view class="color-dots"
          ><view
            v-for="(item, index) in colors.slice(0, 4)"
            :key="item.code"
            class="bead"
            :style="{ background: item.hex }"
            ><view class="bead-hole" /></view></view
        ><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action press" @tap="materials">看用量 ↗</button></view
      ><view class="footnote">颜色以实物为准</view></view
    ><view v-if="pattern" class="bottom-actions"
      ><button hover-start-time="0" hover-stay-time="0"
        class="secondary press"
        hover-class="press-hover"
        @tap="openExport"
        :disabled="blocked"
      >
        导出 ↓</button
      ><button hover-start-time="0" hover-stay-time="0"
        class="primary press"
        hover-class="press-hover"
        @tap="saveAndMake"
        :disabled="blocked"
      >
        保存并开始拼 →
      </button></view
    ><material-sheet
      :show="materialsOpen"
      :busy="blocked"
      :pattern="pattern"
      @close="closeMaterials"
      @export="openExport" /><app-sheet :show="brushOpen" title="选择色号" :busy="blocked" @close="closeBrush">
      <view class="search"><input placeholder="搜索色号" @input="searchBrush" :value="brushSearch" /></view>
      <scroll-view class="sheet-scroll" scroll-y><view class="brush-grid"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-for="item in brushColors" :key="item.code" class="brush-color press" :data-code="item.code" @tap="chooseBrush"><view class="bead" :style="{ background: item.hex }"><view class="bead-hole" /></view><text>{{ item.code }}</text></button></view></scroll-view>
    </app-sheet><export-sheet :show="exportOpen" :pattern="pattern" :preview-src="exportPreviewPath" :preview-loading="exportPreviewLoading" :busy="exportBusy" :phase="exportPhase" :progress="exportProgress" :selection="exportSelection" :retry-path="exportRetryPath" :error="exportError" :permission-denied="albumDenied" @close="closeExport" @direction="resetExportResult" @save="saveImageExport" @retry="retryImageExport" />
    <ui-host route="pages/editor/index" /></view>
</template>
<script>
import { createWorkingCanvas, releaseCanvasFile } from '../../lib/working-canvas.js';
import paletteData from "../../data/mard.json";
const palette = paletteData.colors;
import {
  gridDimensions,
  convertRgba,
  countColors,
  replaceCell,
  samplePixels,
  validatePattern,
} from "../../lib/pattern.js";
import { markRaw } from 'vue';
import { errorMessage } from '../../lib/errors.js';
import { dismiss } from '../../lib/ui-controller.js';
import { toast, selectPersonalImage, isCurrentPage, confirmAccount, confirm, showError } from "../../lib/ui.js";
import { downloadImage } from '../../lib/cloud.js';
import { encodeExport, savePngToAlbum, renderPatternPreview } from "../../lib/render.js";
import { createExportPlan } from '../../lib/export-plan.js';
import { createExportSession } from '../../lib/export-session.js';
import { createImageDraft } from '../../lib/draft.js';
import { navigationMetrics, windowInfo } from '../../lib/device.js';
import { GRID_SIZES, COLOR_LIMITS, MAX_PALETTE_COLORS } from '../../lib/conversion-limits.js';
import { cutoutApi, requestId } from '../../lib/cutout-api.js';
import { conversionFrame } from '../../lib/conversion-frame.js';

export default {
  data() {
    const metrics = navigationMetrics();
    const viewport = windowInfo();
    return {
      pattern: null,
      colors: [],
      total: 0,
      physicalWidth: "0",
      physicalHeight: "0",
      sizes: GRID_SIZES,
      colorLimits: COLOR_LIMITS,
      size: 32,
      maxColors: 12,
      beadSize: 2.6,
      removeBackground: false,
      view: "beads",
      views: [
        { id: "original", label: "原图" },
        { id: "beads", label: "像素" },
        { id: "codes", label: "色号" },
      ],
      editing: false,
      editColor: null,
      palette,
      brushSearch: "",
      brushColors: palette,
      brushOpen: false,
      materialsOpen: false,
      busy: false,
      uploading: false,
      pickerActive: false,
      uploadPhase: '',
      exportOpen: false,
      exportPreviewPath: '',
      exportPreviewLoading: false,
      exportBusy: false,
      exportPhase: '',
      exportProgress: '',
      exportSelection: { mirror: false, format: 'full' },
      exportError: '',
      exportRetryPath: '',
      albumDenied: false,
      originalPath: "",
      draft: null,
      backgroundFailed: false,
      editorActive: true,
      headerHeight: metrics.statusHeight + metrics.navHeight,
      viewportHeight: viewport.windowHeight,
      viewportWidth: viewport.windowWidth,
    };
  },
  onReady() {
    this.resizeUploadArea();
    uni.onWindowResize?.(this.resizeUploadArea);
    try { this.decodeCanvas = markRaw(createWorkingCanvas()); }
    catch (error) { showError(error); }
    this.loadDraft();
    this.consumeExportRequest();
  },
  onShow() {
    this.editorActive = true;
    uni.showTabBar({ animation: false });
    if (this.decodeCanvas && !this.uploading && !this.exportBusy) { this.loadDraft(); this.consumeCutoutResult(); this.consumeExportRequest(); }
  },
  onHide() {
    this.editorActive = false;
    dismiss('pages/editor/index');
    if (this.pickerActive) return;
    this.previewVersion = (this.previewVersion || 0) + 1;
    this.exportPreviewLoading = false;
    if (!this.exportBusy) this.exportOpen = false;
    releaseCanvasFile(this.exportPreviewPath);
    this.exportPreviewPath = '';
    this.uploadVersion = (this.uploadVersion || 0) + 1;
    this.uploading = false;
    this.requestVersion = (this.requestVersion || 0) + 1;
    this.setData({ busy: false });
  },
  onUnload() {
    dismiss('pages/editor/index');
    this.uploadVersion = (this.uploadVersion || 0) + 1;
    this.requestVersion = (this.requestVersion || 0) + 1;
    this.previewVersion = (this.previewVersion || 0) + 1;
    uni.offWindowResize?.(this.resizeUploadArea);
    releaseCanvasFile(this.exportPreviewPath);
    releaseCanvasFile(this.exportSession?.status().file);
  },
  computed: {
    blocked() { return this.busy || this.uploading || this.exportBusy; },
    uploadCardHeight() { return Math.max(180, this.viewportHeight - this.headerHeight - 48 * this.viewportWidth / 750); }
  },
  methods: {
    resizeUploadArea() {
      const viewport = windowInfo();
      this.viewportHeight = viewport.windowHeight;
      this.viewportWidth = viewport.windowWidth;
    },
    consumeExportRequest() {
      const app = getApp();
      if (!app.globalData.exportOnShow || !this.pattern || this.blocked) return;
      app.globalData.exportOnShow = false;
      this.$nextTick(() => { if (isCurrentPage('pages/editor/index')) this.openExport(); });
    },
    setData(updates) {
      Object.assign(this, updates);
    },
    loadDraft(draft = getApp().$vm.getDraft()) {
      this.requestVersion = (this.requestVersion || 0) + 1;
      this.setData({ busy: false });
      this.draft = draft;
      this.undo = [];
      if (!this.draft) {
        this.setData({ pattern: null, colors: [], total: 0, originalPath: '', editing: false, editColor: null, materialsOpen: false, brushOpen: false, exportOpen: false, exportPreviewPath: '', physicalWidth: '0', physicalHeight: '0' });
        return false;
      }
      this.setData({
        pattern: this.draft.pattern || null,
        size:
          this.draft.size ||
          (this.draft.pattern ? Math.max(this.draft.pattern.width, this.draft.pattern.height) : 32),
        maxColors: this.draft.maxColors || 12,
        beadSize: this.draft.pattern?.beadSize || this.draft.beadSize || 2.6,
        removeBackground: Boolean(this.draft.removeBackground),
        editing: Boolean(this.draft.editing),
        editColor:
          palette.find((color) => color.code === this.draft.editColor) ||
          (this.draft.pattern ? countColors(this.draft.pattern, palette)[0] : null) ||
          palette[0],
        view: "beads",
        originalPath:
          this.draft.sourcePath ||
          (this.draft.exampleKind
            ? `/static/example-${this.draft.exampleKind}.png`
            : ""),
      });
      if (this.draft.sourcePath && !this.draft.converted) return this.regenerate();
      if (!this.draft.pattern) return false;
      this.updatePattern(this.draft.pattern);
      return true;
    },
    updatePattern(pattern) {
      validatePattern(pattern, palette);
      this.draft.pattern = pattern;
      getApp().globalData.draft = this.draft;
      const colors = countColors(pattern, palette);
      this.setData({
        pattern,
        colors,
        total: colors.reduce((sum, color) => sum + color.count, 0),
        physicalWidth: ((pattern.width * pattern.beadSize) / 10).toFixed(1),
        physicalHeight: ((pattern.height * pattern.beadSize) / 10).toFixed(1),
      });
    },
    async sourcePixels(size, draft) {
      if (!draft.sourceImageId && !draft.sourcePath && !draft.cutoutId) {
        const example = getApp().globalData.examples.find(
          (item) => item.id === draft.exampleKind,
        );
        const lookup = {};
        palette.forEach((color) => {
          lookup[color.code] = color.hex;
        });
        const source = example || {
          width: draft.pattern.width,
          height: draft.pattern.height,
          cells: draft.pattern.cells.map((code) =>
            code ? lookup[code] : null,
          ),
        };
        const dimensions = gridDimensions(source.width, source.height, size);
        return samplePixels(source, dimensions.width, dimensions.height);
      }
      let imagePath;
      if (draft.cutoutId) {
        if (!draft.cutoutPath) { const cutout = await cutoutApi.getCutout(draft.cutoutId); if (cutout.sourceImageId !== draft.sourceImageId) throw new Error('原图与选区不匹配'); draft.cutoutPath = await downloadImage(cutout.resultImageId); }
        imagePath = draft.cutoutPath;
      } else if (draft.sourceImageId) {
        if (!draft.workingPath) { const input = await cutoutApi.prepareInput(draft.sourceImageId); draft.workingPath = await downloadImage(input.imageId); }
        imagePath = draft.workingPath;
      } else imagePath = draft.sourcePath;
      const info = await new Promise((resolve, reject) =>
        uni.getImageInfo({ src: imagePath, success: resolve, fail: reject }),
      );
      const canvas = this.decodeCanvas;
      if (!canvas) throw new Error('画布还未准备好');
      const image = canvas.createImage();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = imagePath;
      });
      const sourceScale = Math.min(1, 1024 / Math.max(info.width, info.height));
      canvas.width = Math.max(1, Math.round(info.width * sourceScale));
      canvas.height = Math.max(1, Math.round(info.height * sourceScale));
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const frame = conversionFrame({ width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data }, size);
      const originalWidth = canvas.width; const originalHeight = canvas.height;
      canvas.width = frame.width; canvas.height = frame.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, frame.left * info.width / originalWidth, frame.top * info.height / originalHeight, frame.cropWidth * info.width / originalWidth, frame.cropHeight * info.height / originalHeight, frame.padding, frame.padding, frame.innerWidth, frame.innerHeight);
      return {
        width: canvas.width,
        height: canvas.height,
        data: context.getImageData(0, 0, canvas.width, canvas.height).data,
      };
    },
    async regenerate() {
      if (!this.draft) return false;
      const version = (this.requestVersion || 0) + 1;
      this.requestVersion = version;
      this.setData({ busy: true });
      const draft = this.draft;
      const size = this.size;
      const options = {
        name: draft.pattern?.name || draft.name || '我的图片作品',
        maxColors: this.maxColors,
        beadSize: this.beadSize,
        removeBackground: this.removeBackground,
      };
      try {
        const pixels = await this.sourcePixels(size, draft);
        if (version !== this.requestVersion || this.draft !== draft) return false;
        const pattern = convertRgba(pixels, palette, options);
        draft.completedRows = [];
        draft.converted = true;
        draft.size = size;
        draft.maxColors = options.maxColors;
        draft.removeBackground = options.removeBackground;
        this.undo = [];
        this.updatePattern(pattern);
        return true;
      } catch (error) {
        if (version === this.requestVersion) { this.size = draft.size || this.size; this.maxColors = draft.maxColors || this.maxColors; showError(error); }
        return false;
      } finally {
        if (version === this.requestVersion) this.setData({ busy: false });
      }
    },
    async upload() {
      if (this.blocked) return;
      this.uploading = true;
      const version = (this.uploadVersion || 0) + 1;
      this.uploadVersion = version;
      const current = () => version === this.uploadVersion && isCurrentPage('pages/editor/index');
      try {
        const image = await selectPersonalImage({ isCurrent: current, onPicker: value => { this.pickerActive = value; }, onPhase: phase => { if (current()) this.uploadPhase = phase; } });
        if (!current()) return;
        const draft = createImageDraft(image);
        this.uploadPhase = '正在生成图纸';
        const converted = await this.loadDraft(draft);
        if (!converted && current() && this.draft === draft) this.loadDraft();
      } catch (error) {
        if (current()) showError(error);
      } finally {
        if (version === this.uploadVersion) this.uploading = false;
      }
    },
    changeSize(event) {
      if (this.blocked) return;
      this.setData({ size: Number(event.currentTarget.dataset.value) });
      this.regenerate();
    },
    changeColors(event) {
      if (this.blocked) return;
      this.setData({ maxColors: Number(event.currentTarget.dataset.value) });
      this.regenerate();
    },
    async changeView(event) {
      if (this.blocked) return;
      this.setData({ view: event.currentTarget.dataset.value });
      if (this.view !== 'original' || this.originalPath || !this.draft.sourceImageId) return;
      const draft = this.draft;
      try {
        await confirmAccount();
        const filePath = await downloadImage(draft.sourceImageId);
        if (this.draft === draft && isCurrentPage('pages/editor/index')) this.originalPath = filePath;
      } catch (error) { showError(error); }
    },
    changeBeadSize(event) {
      if (this.blocked) return;
      const beadSize = Number(event.detail.value);
      this.setData({ beadSize });
      this.updatePattern(Object.assign({}, this.draft.pattern, { beadSize }));
    },
    async openCutout() {
      if (this.blocked || !this.draft?.sourceImageId) return;
      try {
        await confirmAccount();
        if (!isCurrentPage('pages/editor/index')) return;
        const token = requestId(); this.cutoutToken = token; this.cutoutDraft = this.draft; this.cutoutPattern = JSON.stringify(this.draft.pattern);
        getApp().globalData.cutoutSession = { token, draftId: this.draft.id || null, sourceImageId: this.draft.sourceImageId, cutoutId: this.draft.cutoutId || null };
        getApp().globalData.cutoutResult = null;
        uni.navigateTo({ url: '/pages/cutout/index?token=' + token });
      } catch (error) { showError(error); }
    },
    async consumeCutoutResult() {
      const app = getApp(); const result = app.globalData.cutoutResult;
      if (!result || result.token !== this.cutoutToken || this.blocked) return;
      if (this.draft !== this.cutoutDraft || this.draft.sourceImageId !== result.sourceImageId || JSON.stringify(this.draft.pattern) !== this.cutoutPattern) { app.globalData.cutoutResult = null; return; }
      const candidate = { ...this.draft, cutoutId: result.cutoutId, cutoutPath: null };
      if (await this.commitSource(candidate)) app.globalData.cutoutResult = null;
    },
    async restoreOriginal() {
      if (this.blocked || !this.draft?.cutoutId) return;
      const draft = this.draft;
      if (!await confirm({ title: '恢复原图？', content: '将重新生成图纸，跟拼进度与修色会重置。', confirmText: '恢复' }) || this.draft !== draft || !isCurrentPage('pages/editor/index')) return;
      await this.commitSource({ ...this.draft, cutoutId: null, cutoutPath: null });
    },
    async commitSource(candidate) {
      const previous = this.draft; const version = this.requestVersion = (this.requestVersion || 0) + 1; this.busy = true;
      try {
        const pixels = await this.sourcePixels(this.size, candidate);
        const pattern = convertRgba(pixels, palette, { name: previous.pattern.name, maxColors: this.maxColors, beadSize: this.beadSize });
        if (version !== this.requestVersion || this.draft !== previous || !isCurrentPage('pages/editor/index')) return false;
        candidate.pattern = pattern; candidate.completedRows = []; candidate.converted = true; candidate.removeBackground = false; candidate.size = this.size; candidate.maxColors = this.maxColors;
        this.draft = candidate; this.undo = []; this.updatePattern(pattern); return true;
      } catch (error) { if (version === this.requestVersion) showError(error); return false; }
      finally { if (version === this.requestVersion) this.busy = false; }
    },
    toggleEdit() {
      if (this.blocked) return;
      this.draft.editing = !this.editing;
      this.setData({ editing: this.draft.editing, view: "beads" });
    },
    paint(event) {
      if (
        !this.editing ||
        this.blocked ||
        this.draft.pattern.cells[event.index] === this.editColor.code
      )
        return;
      const nextCodes = new Set(this.draft.pattern.cells.map((code, index) => index === event.index ? this.editColor.code : code).filter(Boolean));
      if (nextCodes.size > MAX_PALETTE_COLORS) { toast('请选择已有颜色修色'); return; }
      this.undo.push({
        index: event.index,
        code: this.draft.pattern.cells[event.index],
        completedRows: this.draft.completedRows.slice(),
      });
      this.draft.completedRows = this.draft.completedRows.filter(
        (row) => row !== event.row,
      );
      this.updatePattern(
        replaceCell(
          this.draft.pattern,
          event.index,
          this.editColor.code,
          palette,
        ),
      );
    },
    undoPaint() {
      if (this.blocked) return;
      const previous = this.undo.pop();
      if (!previous) return;
      const cells = this.draft.pattern.cells.slice();
      cells[previous.index] = previous.code;
      this.draft.completedRows = previous.completedRows;
      this.updatePattern(Object.assign({}, this.draft.pattern, { cells }));
    },
    openBrush() {
      if (this.blocked) return;
      this.setData({ brushOpen: true, brushSearch: "", brushColors: palette });
    },
    searchBrush(event) {
      const value = event.detail.value.trim().toUpperCase();
      this.setData({
        brushSearch: value,
        brushColors: palette.filter((color) => color.code.includes(value)),
      });
    },
    chooseBrush(event) {
      const color = palette.find(
        (item) => item.code === event.currentTarget.dataset.code,
      );
      this.draft.editColor = color.code;
      this.setData({ editColor: color, brushOpen: false });
    },
    closeBrush() {
      this.setData({ brushOpen: false });
    },
    materials() {
      if (this.blocked) return;
      this.setData({ materialsOpen: true });
    },
    closeMaterials() {
      this.setData({ materialsOpen: false });
    },
    openExport() {
      if (this.blocked || !this.pattern) return;
      this.materialsOpen = false;
      this.exportOpen = true;
      if (!this.exportSession || this.exportSession.status().complete || this.exportFingerprint !== JSON.stringify(this.pattern)) this.resetExportResult();
      this.prepareExportPreview();
    },
    closeExport() {
      if (this.exportBusy) return;
      this.exportOpen = false;
      this.previewVersion = (this.previewVersion || 0) + 1;
      this.exportPreviewLoading = false;
      releaseCanvasFile(this.exportPreviewPath);
      this.exportPreviewPath = '';
    },
    async prepareExportPreview() {
      const version = (this.previewVersion || 0) + 1;
      this.previewVersion = version;
      releaseCanvasFile(this.exportPreviewPath);
      this.exportPreviewPath = '';
      this.exportPreviewLoading = true;
      const snapshot = JSON.parse(JSON.stringify(this.pattern));
      try {
        const canvas = await this.nativeExportCanvas('preview-canvas');
        const filePath = await renderPatternPreview(canvas, snapshot, { scope: this });
        if (version === this.previewVersion && this.exportOpen) this.exportPreviewPath = filePath;
        else releaseCanvasFile(filePath);
      } catch {
        if (version === this.previewVersion) this.exportPreviewPath = '';
      } finally {
        if (version === this.previewVersion) this.exportPreviewLoading = false;
      }
    },
    resetExportResult(selection) { if (!this.exportBusy) { releaseCanvasFile(this.exportSession?.status().file); this.exportSession = null; this.exportFingerprint = ''; this.exportSelection = selection || { mirror: false, format: 'full' }; this.exportRetryPath = ''; this.exportError = ''; this.albumDenied = false; this.exportProgress = ''; } },
    nativeExportCanvas(id = 'export-canvas') {
      try { return Promise.resolve(markRaw(createWorkingCanvas())); }
      catch (error) { return Promise.reject(error); }
    },
    async saveImageExport({ mirror, format = 'full' }) {
      if (this.blocked) return;
      if (this.exportSession && !this.exportSession.status().complete && this.exportFingerprint === JSON.stringify(this.pattern) && mirror === this.exportSelection.mirror && format === this.exportSelection.format) return this.retryImageExport();
      const snapshot = JSON.parse(JSON.stringify(this.draft.pattern));
      this.resetExportResult({ mirror, format });
      this.exportBusy = true;
      this.exportPhase = 'drawing';
      try {
        const canvas = await this.nativeExportCanvas();
        this.exportFingerprint = JSON.stringify(snapshot);
        this.exportSession = markRaw(createExportSession({ pages: createExportPlan(snapshot, palette, { mirror, format }), renderPage: page => encodeExport(canvas, page.pattern, { mirror: page.mirror, cellsMirrored: page.cellsMirrored, block: page.block, cellSize: page.block ? 40 : undefined, scope: this, onPhase: phase => { this.exportPhase = phase; } }), savePage: async path => { await savePngToAlbum(path, { openSettings: this.albumDenied }); this.albumDenied = false; }, releaseFile: releaseCanvasFile, onProgress: progress => { this.exportPhase = progress.phase; this.exportProgress = `第 ${progress.page} / ${progress.total} 张`; } }));
        await this.exportSession.run();
        this.exportOpen = false;
        toast('图纸和材料清单已保存到相册');
      } catch (error) {
        this.exportError = errorMessage(error, '导出未完成，请重试');
        this.exportRetryPath = error.retryPath || (this.exportSession ? 'pending' : '');
        this.albumDenied = error.code === 'ALBUM_PERMISSION';
      } finally { this.exportBusy = false; this.exportPhase = ''; }
    },
    async retryImageExport() {
      if (this.blocked || !this.exportSession) return;
      this.exportBusy = true;
      this.exportPhase = 'saving';
      try {
        await this.exportSession.retry();
        this.exportOpen = false;
        this.exportRetryPath = '';
        toast('高清图纸已保存到相册');
      } catch (error) {
        this.exportError = errorMessage(error, '保存未完成，请重试');
        this.exportRetryPath = error.retryPath || 'pending'; this.albumDenied = error.code === 'ALBUM_PERMISSION' || this.albumDenied;
      } finally { this.exportBusy = false; this.exportPhase = ''; }
    },
    saveAndMake() {
      if (this.blocked) return;
      if (!this.total) {
        toast("图纸还没有豆子，先选择图片或修色");
        return;
      }
      try {
        const saved = getApp().globalData.repository.save(this.draft);
        this.draft = getApp().$vm.setDraft(saved);
        uni.navigateTo({ url: "/pages/making/index" });
      } catch (error) {
        showError(error);
      }
    },
    noop() {},
  },
  onShareAppMessage() {
    return { title: "豆屿 · 把喜欢，一颗颗拼出来", path: "/pages/home/index" };
  },
};
</script>
<style scoped>
.upload-content{padding:24rpx 32rpx}.upload-card{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:32rpx;background:#edeade}.upload-background,.upload-background-fallback{position:absolute;inset:0;width:100%;height:100%}.upload-background-fallback{background-color:#f2eee2;background-image:radial-gradient(#dcdacb 1px,transparent 1px);background-size:20px 20px}.fallback-bead{position:absolute;width:54rpx;height:54rpx;border-radius:50%;border:16rpx solid}.fallback-sage{top:72rpx;left:48rpx;border-color:#a6b59a}.fallback-peach{bottom:100rpx;right:44rpx;border-color:#efbc96}.fallback-butter{top:180rpx;right:48rpx;border-color:#e8d792}.upload-button{position:relative;z-index:1;min-width:350rpx;min-height:100rpx;border-radius:100rpx;gap:20rpx;font-size:30rpx;box-shadow:0 6rpx 24rpx #29372e12}.upload-button.pending{background:#355c48;color:#fffefa;opacity:.9}.upload-icon{position:relative;width:40rpx;height:44rpx;flex-shrink:0}.upload-arrow{position:absolute;top:2rpx;left:19rpx;width:3rpx;height:30rpx;border-radius:3rpx;background:currentColor}.upload-arrow::before{content:"";position:absolute;left:-7rpx;top:1rpx;width:14rpx;height:14rpx;border-left:3rpx solid currentColor;border-top:3rpx solid currentColor;transform:rotate(45deg)}.upload-tray{position:absolute;bottom:0;left:2rpx;right:2rpx;height:17rpx;border:3rpx solid currentColor;border-top:0;border-radius:0 0 7rpx 7rpx}.upload-spinner{width:32rpx;height:32rpx;flex-shrink:0;border:3rpx solid #fffefa55;border-top-color:#fffefa;border-radius:50%;animation:upload-spin .7s linear infinite}.paused-preview{height:286px;display:flex;align-items:center;justify-content:center}@keyframes upload-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.upload-spinner{animation:none}}
.bottom-actions{bottom:var(--window-bottom, 0px);padding-bottom:24rpx}
.cutout-actions{display:flex;align-items:center;gap:16rpx;margin:0 0 24rpx}.cutout-button{display:flex;align-items:center;justify-content:center;gap:14rpx;flex:1;min-height:90rpx;padding:0 24rpx;border:2rpx solid #d6dfcc;border-radius:22rpx;background:#eaf0e3;color:#355c48;font-size:26rpx;font-weight:500}.cutout-icon{position:relative;width:30rpx;height:30rpx;flex-shrink:0;border:2rpx dashed currentColor;border-radius:8rpx}.cutout-icon-dot{position:absolute;left:7rpx;top:7rpx;width:12rpx;height:12rpx;border-radius:50%;background:currentColor;opacity:.5}.cutout-arrow{margin-left:auto;font-size:34rpx;font-weight:400}.restore-original{font-size:23rpx;padding:0 12rpx;flex-shrink:0}
.modal-mask{bottom:var(--window-bottom, 0px)}
.action-content{padding-bottom:190rpx}
.editor-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28rpx;
}
.editor-title {
  font-size: 40rpx;
  font-weight: 600;
}
.image-button {
  background: #fffefa;
  border: 2rpx solid #e9e9e0;
  border-radius: 20rpx;
  font-size: 22rpx;
  min-width: 88rpx;
  min-height: 88rpx;
  padding: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.preview-card {
  background: #fffefa;
  border: 2rpx solid #e9e9e0;
  border-radius: 36rpx;
  overflow: hidden;
}
.preview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 24rpx;
}
.segments {
  display: flex;
  background: #f1f2eb;
  border-radius: 18rpx;
  padding: 6rpx;
}
.segment {
  font-size: 22rpx;
  color: #7b8478;
  min-width: 88rpx;
  min-height: 88rpx;
  padding: 20rpx 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
}
.segment.selected {
  background: #fffefa;
  color: #355c48;
}
.edit-button {
  min-height: 88rpx;
  font-size: 22rpx;
  color: #355c48;
  padding: 16rpx;
}
.preview-stage {
  min-height: 270px;
  position: relative;
}
.original {
  height: 260px;
  width: 100%;
}
.loading {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(248, 247, 242, 0.83);
  font-size: 26rpx;
  color: #355c48;
}
.preview-meta {
  padding: 20rpx 24rpx;
  display: flex;
  justify-content: space-between;
  border-top: 2rpx solid #e9e9e0;
  font-size: 20rpx;
  color: #7b8478;
}
.preview-meta text:last-child {
  color: #355c48;
}
.settings {
  margin-top: 28rpx;
}
.setting-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 25rpx;
  margin: 24rpx 0 18rpx;
}
.setting-label text:last-child {
  color: #7b8478;
  font-size: 20rpx;
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.options .chip {
  flex: 0 0 calc((100% - 42rpx) / 4);
  min-width: 0;
  min-height: 84rpx;
  padding: 14rpx 8rpx;
  white-space: nowrap;
  font-size: 24rpx;
}
.settings-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 0;
}
.bead-sizes {
  display: flex;
  gap: 8rpx;
  font-size: 20rpx;
  color: #355c48;
}
.bead-sizes label {
  display: flex;
  align-items: center;
  min-height: 88rpx;
}
.bead-sizes radio {
  transform: scale(0.63);
  margin-left: -12rpx;
  margin-right: -10rpx;
}
.background-switch {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 20rpx;
  color: #7b8478;
}
.background-switch switch {
  transform: scale(0.72);
  margin-right: -14rpx;
}
.used-colors {
  display: flex;
  align-items: center;
  border-top: 2rpx solid #e9e9e0;
  gap: 12rpx;
  font-size: 21rpx;
  padding: 12rpx 0;
}
.color-dots {
  display: flex;
  gap: 10rpx;
  margin-left: auto;
}
.color-dots .bead {
  width: 40rpx;
  height: 40rpx;
  border-radius: 11rpx;
}
.footnote {
  text-align: center;
  color: #969f8a;
  font-size: 19rpx;
  margin-top: 16rpx;
}
.edit-strip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f1f3e9;
  padding: 12rpx 24rpx;
  font-size: 21rpx;
  color: #7b8478;
}
.edit-strip button {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-height: 88rpx;
  color: #355c48;
}
.brush-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.brush-color {
  width: calc((100% - 64rpx) / 5);
  background: #fffefa;
  border: 2rpx solid #e9e9e0;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 12rpx;
  padding: 18rpx 4rpx;
  font-size: 20rpx;
  min-height: 120rpx;
}
</style>
