<template>
  <view class="screen">
    <app-header title="我的作品" />
    <view class="works-content">
      <button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="account-row press" @tap="account"><view class="avatar">豆</view><text class="account-name">{{ displayName || '登录豆屿' }}</text><text class="account-arrow">›</text></button>
      <view class="works-toolbar"><view class="work-tabs"><button class="press" hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-for="item in filters" :key="item.id" :class="{ selected: filter === item.id }" @tap="filter = item.id">{{ item.label }}</button></view><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="new-work press" aria-label="创建图纸" @tap="createWork">＋</button></view>
      <view v-if="loadError" class="empty"><text>{{ loadError }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="secondary press" @tap="refreshWorks">重试</button></view>
      <view v-else-if="visibleWorks.length" class="works-grid">
        <view v-for="work in visibleWorks" :key="work.id" class="work-card">
          <button hover-start-time="0" hover-stay-time="0" class="work-open press" hover-class="press-hover" @tap="openWork(work.id)">
            <view class="work-art"><bead-canvas :pattern="work.pattern" :controlled-width="previewWidth" :height-limit="previewWidth" :interactive="false" /></view>
            <text class="work-name">{{ work.pattern.name }}</text>
            <text class="work-meta">{{ work.pattern.width }} × {{ work.pattern.height }} · {{ work.colorCount }} 色</text>
          </button>
          <view class="work-progress"><text>{{ work.progress === 100 ? '已完成' : work.progress + '%' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="work-more press" :disabled="!!deletingId" :aria-label="work.pattern.name + '的更多操作'" @tap="more(work.id)">···</button></view>
          <view class="progress-track"><view :style="{ width: work.progress + '%' }" /></view>
        </view>
      </view>
      <view v-else class="empty works-empty"><image class="empty-cat" src="/static/example-cat.png" mode="aspectFit" /><text>{{ filter === 'all' ? '还没有作品' : filter === 'done' ? '还没有完成的作品' : '没有正在拼的作品' }}</text><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="primary press" @tap="createWork">图片转图纸</button></view>
    </view>
    <ui-host route="pages/works/index" />
  </view>
</template>
<script>
import { countColors } from '../../lib/pattern.js';
import { windowInfo } from '../../lib/device.js';
import { getSession, getProfile } from '../../lib/cloud.js';
import { toast, showError, confirm, showActions, confirmAccount, editAccountName, isCurrentPage } from '../../lib/ui.js';
import { dismiss } from '../../lib/ui-controller.js';
import { errorMessage } from '../../lib/errors.js';

function completedCount(work) {
  return new Set((work.completedRows || []).filter(row => Number.isInteger(row) && row >= 0 && row < work.pattern.height)).size;
}
export default {
  data() { return { works: [], filter: 'all', filters: [{ id: 'all', label: '全部' }, { id: 'active', label: '在拼' }, { id: 'done', label: '已完成' }], displayName: '', loadError: '', deletingId: '', previewWidth: Math.max(60, (windowInfo().windowWidth - windowInfo().windowWidth * 100 / 750) / 2 - 32) }; },
  computed: {
    visibleWorks() { return this.works.filter(work => this.filter === 'all' || (this.filter === 'done' ? work.progress === 100 : work.progress < 100)); }
  },
  onLoad() { this.releaseWorks = getApp().globalData.repository.subscribe(() => this.refreshWorks()); },
  onShow() {
    uni.showTabBar({ animation: false });
    this.refreshWorks();
    this.displayName = getSession()?.profile?.displayName || '';
    getApp().globalData.autoSave.schedule();
    if (getSession()) getProfile().then(profile => { if (isCurrentPage('pages/works/index')) this.displayName = profile.displayName; }).catch(() => {});
  },
  onHide() { dismiss('pages/works/index'); },
  onUnload() { this.releaseWorks?.(); dismiss('pages/works/index'); },
  methods: {
    refreshWorks() {
      try {
        const app = getApp();
        this.works = app.globalData.repository.list().map(work => ({ ...work, colorCount: countColors(work.pattern, app.globalData.palette).length, progress: Math.round(completedCount(work) / work.pattern.height * 100) }));
        this.loadError = '';
      } catch (error) { this.loadError = errorMessage(error, '作品暂时无法读取，请重试'); }
    },
    async account() {
      try {
        if (!getSession()) await confirmAccount();
        else await editAccountName();
        this.displayName = getSession()?.profile?.displayName || '';
      } catch (error) { if (isCurrentPage('pages/works/index')) showError(error); }
    },
    openWork(id, inspect = false) {
      try {
        getApp().$vm.openWork(id);
        getApp().globalData.detailOnShow = inspect;
        uni.navigateTo({ url: '/pages/making/index', fail: showError });
      } catch (error) { showError(error); }
    },
    editWork(id, exporting = false) {
      try {
        getApp().$vm.openWork(id);
        getApp().globalData.exportOnShow = exporting;
        uni.switchTab({ url: '/pages/editor/index', fail: showError });
      } catch (error) { showError(error); }
    },
    async more(id) {
      if (this.deletingId) return;
      const work = getApp().globalData.repository.find(id);
      if (!work) return this.refreshWorks();
      const actions = [{ id: 'inspect', label: '查看图纸' }, { id: 'edit', label: '修色' }, { id: 'export', label: '导出图片' }];
      if (!work.originPublicId) actions.push({ id: 'publish', label: work.publishedId ? '更新发布' : '发布作品' });
      if (work.publishedId) actions.push({ id: 'published', label: '查看已发布图纸' });
      actions.push({ id: 'delete', label: '删除作品', destructive: true });
      const action = await showActions(actions);
      if (!action || !isCurrentPage('pages/works/index')) return;
      if (action === 'inspect') this.openWork(id, true);
      if (action === 'edit') this.editWork(id);
      if (action === 'export') this.editWork(id, true);
      if (action === 'delete') await this.deleteWork(id);
      if (action === 'published') uni.navigateTo({ url: '/pages/community/detail?id=' + work.publishedId, fail: showError });
      if (action === 'publish') {
        try { await confirmAccount(); if (isCurrentPage('pages/works/index')) uni.navigateTo({ url: '/pages/community/publish?workId=' + encodeURIComponent(id), fail: showError }); }
        catch (error) { if (isCurrentPage('pages/works/index')) showError(error); }
      }
    },
    async deleteWork(id) {
      if (this.deletingId) return;
      this.deletingId = id;
      try {
        const repository = getApp().globalData.repository;
        const work = repository.find(id);
        if (!work) return;
        const content = work.publishedId ? '图纸与跟拼进度将移除。已发布图纸仍保留，可在详情中下架。' : '图纸与跟拼进度将一起移除。';
        if (!await confirm({ title: '删除作品？', content, confirmText: '删除', cancelText: '保留', destructive: true })) return;
        if (!isCurrentPage('pages/works/index')) return;
        repository.remove(id);
        toast('已删除');
      } catch (error) { showError(error); }
      finally { this.deletingId = ''; }
    },
    createWork() { uni.switchTab({ url: '/pages/editor/index', fail: showError }); }
  },
  onShareAppMessage() { return { title: '豆屿 · 图纸广场', path: '/pages/home/index' }; }
};
</script>
<style scoped>
.works-content{padding:20rpx 40rpx 48rpx}.account-row{display:flex;align-items:center;gap:20rpx;min-height:100rpx;width:100%;text-align:left}.avatar{display:flex;align-items:center;justify-content:center;width:72rpx;height:72rpx;border-radius:24rpx;background:#e6ebdd;color:#355c48;font-size:30rpx;font-weight:600}.account-name{flex:1;font-size:30rpx;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.account-arrow{color:#7b8478;font-size:36rpx}.works-toolbar{display:flex;align-items:center;justify-content:space-between;margin:20rpx 0}.work-tabs{display:flex;gap:8rpx}.work-tabs button{display:flex;align-items:center;justify-content:center;min-width:112rpx;min-height:88rpx;padding:20rpx 14rpx;color:#7b8478;font-size:25rpx}.work-tabs .selected{color:#355c48;font-weight:600}.new-work{display:flex;align-items:center;justify-content:center;width:88rpx;height:88rpx;flex-shrink:0;border-radius:22rpx;color:#355c48;background:#e6ebdd;font-size:36rpx}.works-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20rpx;align-items:start}.work-card{min-width:0;overflow:hidden;background:#fffefa;border:2rpx solid #e9e9e0;border-radius:28rpx;padding-bottom:24rpx}.work-open{width:100%;text-align:left}.work-art{background:#eeecdf;overflow:hidden}.work-name{display:block;margin:20rpx 20rpx 0;font-size:26rpx;font-weight:600;line-height:1.5;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.work-meta{display:block;margin:8rpx 20rpx 0;color:#7b8478;font-size:21rpx}.work-progress{display:flex;align-items:center;justify-content:space-between;padding:0 12rpx 0 20rpx;font-size:22rpx;color:#355c48;font-variant-numeric:tabular-nums}.work-more{display:flex;align-items:center;justify-content:center;min-width:88rpx;min-height:88rpx;font-size:36rpx;line-height:1}.progress-track{height:8rpx;margin:0 20rpx;background:#ecede5;border-radius:10rpx;overflow:hidden}.progress-track view{height:100%;background:#829e70}.works-empty{padding:90rpx 20rpx}.empty-cat{width:200rpx;height:200rpx;margin-bottom:24rpx}.empty .primary,.empty .secondary{margin:30rpx auto 0;min-width:280rpx}
</style>
