<template>
  <view>
    <app-dialog :show="modal?.kind === 'confirm'" :title="modal?.title" :content="modal?.content" :confirm-text="modal?.confirmText" :cancel-text="modal?.cancelText" :destructive="modal?.destructive" @answer="reply" />
    <app-sheet :show="!!modal && ['login','profile','actions'].includes(modal.kind)" :title="sheetTitle" @close="reply(null)">
      <view v-if="modal?.kind === 'login'" class="login-content"><view class="login-mark">▦</view><text class="muted">保存作品，下次继续。</text><text class="login-private">照片仅自己可见</text><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" @tap="reply(true)">微信登录</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action cancel-action press" @tap="reply(null)">先逛逛</button></view>
      <view v-if="modal?.kind === 'profile'" class="profile-content"><input class="form-input name-input" type="nickname" :value="name" :maxlength="48" placeholder="你的账号名称" @input="name = $event.detail.value" /><text class="muted">发布作品时自动使用这个名称</text><button hover-start-time="0" hover-stay-time="0" class="primary press" hover-class="press-hover" @tap="saveName">保存名称</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action cancel-action press" @tap="reply(null)">暂时跳过</button></view>
      <view v-if="modal?.kind === 'actions'"><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" v-for="action in modal.actions" :key="action.id" class="action-row press" :class="{ destructive: action.destructive }" @tap="reply(action.id)">{{ action.label }}</button><button hover-class="press-hover" hover-start-time="0" hover-stay-time="0" class="text-action cancel-action press" @tap="reply(null)">取消</button></view>
    </app-sheet>
    <view v-if="modal?.kind === 'loading'" class="busy-mask" @touchmove.stop.prevent="noop"><view class="busy-card"><view class="busy-spinner" /><text>{{ modal.message }}</text></view></view>
    <app-toast :message="notification?.message" :tone="notification?.tone" />
  </view>
</template>
<script>
import { markRaw } from 'vue';
import AppSheet from './app-sheet.vue';
import AppDialog from './app-dialog.vue';
import AppToast from './app-toast.vue';
import { subscribe, answer, dismiss, notify } from '../lib/ui-controller.js';
export default {
  components: { AppSheet, AppDialog, AppToast }, props: { route: { type: String, required: true } },
  data() { return { modal: null, notification: null, name: '' }; },
  computed: { sheetTitle() { return { login: '登录豆屿', profile: '设置名称', actions: '作品操作' }[this.modal?.kind] || ''; } },
  mounted() { this.unsubscribe = subscribe(this.route, value => { if (value.modal !== this.modal) this.name = value.modal?.displayName || ''; this.modal = value.modal ? markRaw(value.modal) : null; this.notification = value.toast; }); },
  beforeUnmount() { dismiss(this.route); this.unsubscribe?.(); },
  methods: {
    reply(value) { answer(this.route, value); },
    saveName() { const name = this.name.trim(); if (!name || Array.from(name).length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) return notify(this.route, '名称需为 1–24 个字', 'error'); this.reply(name); },
    noop() {}
  }
};
</script>
<style scoped>
.login-content,.profile-content{padding-top:20rpx}.login-content{text-align:center}.login-mark{font-size:64rpx;color:#355c48}.login-private{display:block;color:#858e7c;font-size:23rpx;margin:20rpx 0 36rpx}.cancel-action{justify-content:center;width:100%;margin-top:12rpx}.name-input{background:#f4f4ec;margin:12rpx 0 20rpx}.profile-content .primary{margin-top:28rpx}.action-row{display:block;width:100%;min-height:100rpx;text-align:left;padding:28rpx 12rpx;border-bottom:2rpx solid #eef0e7}.destructive{color:#a16a50}.busy-mask{position:fixed;inset:0;z-index:320;background:#29372e24;display:flex;justify-content:center;align-items:center}.busy-card{background:#fffefa;border-radius:28rpx;padding:36rpx 48rpx;display:flex;align-items:center;gap:24rpx;font-size:26rpx}.busy-spinner{width:36rpx;height:36rpx;border:4rpx solid #dce4d4;border-top-color:#355c48;border-radius:50%;animation:spin .65s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
</style>
