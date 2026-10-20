<template>
  <view class="screen"><app-header title="发布作品" back /><view class="content action-content">
    <view v-if="work" class="publish-preview"><bead-canvas :pattern="work.pattern" mode="beads" :height-limit="250" :interactive="false" /><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action press" :disabled="busy" @tap="chooseWork">更换图纸</button></view>
    <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-else class="pick-work secondary press" :disabled="busy" @tap="chooseWork">从我的作品选择</button>
    <text class="field-label">作品名称</text><input class="form-input" :disabled="busy" :value="title" :maxlength="50" :adjust-position="true" placeholder="给图纸取个名字" @input="title = $event.detail.value" /><text class="private-note">只分享图纸，不公开原图</text>
  </view><view class="bottom-actions"><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" :disabled="busy || !work" @tap="submit">{{ busy ? '正在发布' : '发布作品' }}</button></view><ui-host route="pages/community/publish" /></view>
</template>
<script>
import { confirmAccount, confirm, showActions, showError, toast } from '../../lib/ui.js';
import { dismiss, currentRoute } from '../../lib/ui-controller.js';
import { ensureWorkSaved } from '../../lib/auto-save.js';
import { community } from '../../lib/community.js';
export default {
  data() { return { work: null, title: '', busy: false }; },
  onLoad(options) { this.select(options.workId); },
  onHide() { dismiss('pages/community/publish'); },
  onUnload() { dismiss('pages/community/publish'); },
  methods: {
    select(id) { const work = getApp().globalData.repository.find(id); if (work && !work.originPublicId) { this.work = work; this.title = work.pattern.name; } },
    async chooseWork() {
      if (this.busy) return;
      try {
        const works = getApp().globalData.repository.list().filter(work => !work.originPublicId);
        if (!works.length) { toast('先保存一份自己的图纸'); return; }
        const id = await showActions(works.map(work => ({ id: work.id, label: work.pattern.name })));
        if (id && currentRoute() === 'pages/community/publish') this.select(id);
      } catch (error) { showError(error); }
    },
    async submit() {
      if (this.busy || !this.work) return;
      const title = this.title.trim();
      if (!title || Array.from(title).length > 50) return toast('作品名称需为 1–50 个字', 'error');
      this.busy = true;
      try {
        await confirmAccount();
        const { work, revision } = await ensureWorkSaved(this.work.id, this.work);
        if (currentRoute() !== 'pages/community/publish') return;
        const input = { sourceClientId: work.id, sourceRevision: revision, title };
        let result;
        try { result = await community.publish(input); }
        catch (error) {
          if (error.code !== 'ALREADY_PUBLISHED' || !error.details?.id) throw error;
          if (!await confirm({ title: '更新已发布的图纸？', content: '替换图纸内容，保留下载数量。', confirmText: '更新' })) return;
          result = await community.update(error.details.id, input);
        }
        if (currentRoute() !== 'pages/community/publish') return;
        getApp().globalData.communityChanged = true;
        getApp().globalData.autoSave.schedule();
        uni.redirectTo({ url: '/pages/community/detail?id=' + result.id, fail: showError });
      } catch (error) { if (currentRoute() === 'pages/community/publish') showError(error); }
      finally { this.busy = false; }
    }
  }
};
</script>
<style scoped>
.publish-preview{padding:24rpx;background:#fffefa;border:2rpx solid #e8eadf;border-radius:28rpx;overflow:hidden}.publish-preview .text-action{justify-content:center}.pick-work{width:100%;min-height:280rpx}.field-label{display:block;font-size:28rpx;font-weight:600;margin:36rpx 0 18rpx}.private-note{display:block;margin-top:28rpx;color:#7b8478;font-size:24rpx}
</style>
