<template>
  <app-sheet :show="show" title="导出图纸" :busy="busy" @close="close">
    <view class="direction-options">
      <button hover-start-time="0" hover-stay-time="0" v-for="option in options" :key="option.label" class="direction-option press" :class="{ selected: mirror === option.mirror }" :disabled="busy" :aria-label="option.label" hover-class="press-hover" @tap="select(option.mirror)">
        <view class="direction-heading"><text>{{ option.label }}</text><view class="direction-check" :class="{ checked: mirror === option.mirror }"><text v-if="mirror === option.mirror">✓</text></view></view>
        <view class="direction-preview">
          <image v-if="previewSrc && !previewFailed" class="direction-image" :class="{ mirrored: option.mirror }" :src="previewSrc" mode="aspectFit" @error="previewFailed = true" />
          <view v-else class="preview-placeholder"><view v-if="previewLoading" class="preview-spinner" /><view v-else class="preview-grid" /><text>{{ previewLoading ? '正在生成预览' : '预览暂不可用' }}</text></view>
        </view>
      </button>
    </view>
    <view class="format-options">
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="format-option press" :class="{ selected: format === 'full' }" :aria-pressed="format === 'full'" :disabled="busy" @tap="selectFormat('full')"><view class="format-check" v-if="format === 'full'">✓</view><text class="format-title">整张图纸</text><text class="format-description">一张高清 PNG</text></button>
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="format-option press" :class="{ selected: format === 'tiles' }" :aria-pressed="format === 'tiles'" :disabled="busy" @tap="selectFormat('tiles')"><view class="format-check" v-if="format === 'tiles'">✓</view><text class="format-title">高清分块</text><text class="format-description">{{ tileCount }} 张 · 逐块拼</text></button>
    </view>
    <text class="export-note">高清 PNG · 色号 / 坐标 / 用量</text>
    <text v-if="busy && progress" class="export-note">{{ progress }}</text>
    <view v-if="error" class="export-error"><text>{{ error }}</text></view>
    <button hover-start-time="0" hover-stay-time="0" v-if="retryPath && !busy" class="secondary export-retry press" hover-class="press-hover" @tap="$emit('retry')">{{ permissionDenied ? '开启相册权限并重试' : '重试保存' }}</button>
    <button hover-start-time="0" hover-stay-time="0" class="primary press export-save" :class="{ inactive: busy || !pattern }" :disabled="busy || !pattern" hover-class="press-hover" @tap="save"><view v-if="busy" class="save-spinner" /><text>{{ busy ? phaseText : retryPath ? '继续保存' : '保存到相册' }}</text></button>
    <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action export-cancel press" :disabled="busy" @tap="close">取消</button>
  </app-sheet>
</template>
<script>
export default {
  props: { show: Boolean, pattern: Object, previewSrc: String, previewLoading: Boolean, busy: Boolean, phase: String, progress: String, selection: Object, retryPath: String, error: String, permissionDenied: Boolean },
  emits: ['close', 'save', 'retry', 'direction'],
  data() { return { mirror: false, format: 'full', previewFailed: false, options: [{ label: '正面', mirror: false }, { label: '左右镜像', mirror: true }] }; },
  computed: { tileCount() { return this.pattern ? Math.ceil(this.pattern.width / 64) * Math.ceil(this.pattern.height / 64) : 1; }, phaseText() { return { drawing: '正在绘制图纸', encoding: '正在生成高清图片', saving: '正在保存到相册' }[this.phase] || '正在准备'; } },
  watch: {
    show(value) { if (value) { this.mirror = this.selection?.mirror || false; this.format = this.selection?.format || 'full'; this.previewFailed = false; } },
    previewSrc() { this.previewFailed = false; }
  },
  methods: {
    close() { if (!this.busy) this.$emit('close'); },
    select(value) { if (this.busy || this.mirror === value) return; this.mirror = value; this.$emit('direction', { mirror: this.mirror, format: this.format }); },
    selectFormat(value) { if (this.busy || this.format === value) return; this.format = value; this.$emit('direction', { mirror: this.mirror, format: this.format }); },
    save() { if (!this.busy && this.pattern) this.$emit('save', { mirror: this.mirror, format: this.format }); }
  }
};
</script>
<style scoped>
.format-options{display:flex;gap:16rpx;margin-top:20rpx}.format-option{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-width:0;min-height:132rpx;padding:24rpx 12rpx;gap:8rpx;border-radius:24rpx;background:#faf9f4;color:#596451;border:2rpx solid #dedfd5;text-align:center}.format-option.selected{background:#edf1e7;border-color:#355c48;color:#355c48}.format-title{display:block;font-size:26rpx;line-height:1.4;font-weight:500;white-space:nowrap}.format-description{display:block;font-size:21rpx;line-height:1.4;color:#7b8478;white-space:nowrap}.format-option.selected .format-description{color:#65785c}.format-check{position:absolute;top:12rpx;right:12rpx;display:flex;align-items:center;justify-content:center;width:28rpx;height:28rpx;border-radius:50%;background:#355c48;color:#fffefa;font-size:20rpx;line-height:1}
.direction-options{display:flex;gap:16rpx;margin:24rpx 0}.direction-option{flex:1;min-width:0;overflow:hidden;padding:20rpx 16rpx 16rpx;border:2rpx solid #dedfd5;border-radius:24rpx;background:#faf9f4;text-align:left;font-size:28rpx}.direction-option.selected{background:#edf1e7;border-color:#355c48;color:#355c48}.direction-heading{display:flex;align-items:center;justify-content:space-between;gap:8rpx;padding:0 4rpx;font-weight:500}.direction-check{display:flex;align-items:center;justify-content:center;width:36rpx;height:36rpx;flex-shrink:0;border-radius:50%;font-size:25rpx}.direction-check.checked{background:#355c48;color:#fffefa}.direction-preview{height:260rpx;margin-top:16rpx;overflow:hidden;border-radius:12rpx;background:#f4f3eb}.direction-image{display:block;width:100%;height:100%}.direction-image.mirrored{transform:scaleX(-1)}.preview-placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18rpx;color:#8a9381;font-size:21rpx}.preview-grid{width:58rpx;height:58rpx;border:2rpx solid #adbca3;background-image:linear-gradient(#bdc9b4 1px,transparent 1px),linear-gradient(90deg,#bdc9b4 1px,transparent 1px);background-size:9rpx 9rpx}.export-note{display:block;text-align:center;color:#7b8478;font-size:23rpx;margin:26rpx 0}.export-error{font-size:24rpx;color:#a16a50;line-height:1.6;padding:20rpx 24rpx;margin:16rpx 0;background:#f8eee6;border-radius:16rpx}.export-save{width:100%;margin-top:20rpx;gap:16rpx}.export-save.inactive{background:#355c48;color:#fffefa;opacity:.7}.export-retry{width:100%;margin-top:16rpx}.export-cancel{justify-content:center;width:100%;margin-top:8rpx}.save-spinner,.preview-spinner{width:30rpx;height:30rpx;flex-shrink:0;border:3rpx solid #fffefa55;border-top-color:#fffefa;border-radius:50%;animation:export-spin .7s linear infinite}.preview-spinner{border-color:#ccd7c2;border-top-color:#355c48}@keyframes export-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.save-spinner,.preview-spinner{animation:none}}
</style>
