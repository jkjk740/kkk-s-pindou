import { login, getSession, uploadImage, isConfigured, updateProfile } from './cloud.js';
import { currentRoute, open, notify, showBusy } from './ui-controller.js';
import { errorMessage } from './errors.js';

export function toast(message, tone = 'success') { notify(currentRoute(), message, tone); }
export const confirm = options => open(currentRoute(), { ...options, kind: 'confirm' }).then(Boolean);
export const showActions = actions => open(currentRoute(), { kind: 'actions', actions });
export async function editAccountName(profile = getSession()?.profile) { const name = await open(currentRoute(), { kind: 'profile', displayName: profile?.displayName || '' }); if (!name) return; const close = showBusy('正在保存'); try { const profile = await updateProfile(name); getApp().globalData.communityChanged = true; return profile; } finally { close(); } }
export async function chooseImage() {
  const media = await new Promise((resolve, reject) => uni.chooseImage({ count: 1, sourceType: ['album', 'camera'], sizeType: ['original'], success: resolve, fail: error => reject(explainImageError(error)) }));
  const path = media.tempFilePaths[0];
  const info = await new Promise((resolve, reject) => uni.getImageInfo({ src: path, success: resolve, fail: reject }));
  return { path, width: info.width, height: info.height, name: '我的图片作品' };
}
export function explainImageError(error) {
  if (/api scope is not declared|privacy agreement/i.test(error?.errMsg || '')) return new Error('请先在微信后台的用户隐私保护指引中声明选图接口，再重新编译');
  return error;
}
export function showError(error) { if (error && /cancel|取消/i.test(error.errMsg || error.message || '')) return; toast(errorMessage(error), 'error'); }
export function selectTab() {}

export async function confirmAccount() {
  if (!isConfigured()) throw new Error('请先配置后端地址');
  if (getSession()) return;
  const route = currentRoute();
  if (!await open(route, { kind: 'login' })) throw new Error('取消登录');
  const close = showBusy('正在登录');
  let session;
  try { session = await login(); } finally { close(); }
  if (currentRoute() !== route) throw new Error('取消登录');
  if (session.profile?.needsName) await editAccountName(session.profile);
}
export async function selectPersonalImage({ onPhase = () => {}, onPicker = () => {}, isCurrent = () => true } = {}) {
  onPhase('正在登录');
  await confirmAccount('登录后原图将私有保存到你的账号，本机完成转图。示例图纸无需登录。');
  if (!isCurrent()) throw new Error('取消选图');
  onPhase('选择原图');
  onPicker(true);
  let image;
  try { image = await chooseImage(); } finally { onPicker(false); }
  if (!isCurrent()) throw new Error('取消上传');
  if (!image.path || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) throw new Error('这张图片没有打开成功，请重新选择');
  if (image.width * image.height > 20000000) throw new Error('图片不能超过 2000 万像素');
  onPhase('正在私有上传');
  const uploaded = await uploadImage(image.path);
  if (!isCurrent()) throw new Error('取消创作');
  return { ...image, sourceImageId: uploaded.id };
}
export function isCurrentPage(route) {
  const pages = getCurrentPages();
  return pages[pages.length - 1]?.route === route;
}
