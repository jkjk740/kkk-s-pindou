import { community } from './community.js';
const KEY = 'bead-public-download-pending-v1';
let running = null;
function pending() {
  try {
    const value = uni.getStorageSync(KEY);
    return Array.isArray(value) ? value.filter(item => item.intent?.expiresAt > Date.now()).slice(-20) : [];
  } catch { return []; }
}
function persist(records) { try { uni.setStorageSync(KEY, records.slice(-20)); } catch {} }
export const communityDownloads = {
  begin(id) { return community.downloadIntent(id); },
  async complete(publicId, intent) {
    const records = pending();
    if (!records.some(item => item.intent.id === intent.id)) records.push({ publicId, intent });
    persist(records);
    try {
      const result = await community.confirmDownload(publicId, intent);
      persist(pending().filter(item => item.intent.id !== intent.id));
      uni.$emit('bead-public-download', result);
      return Number.isSafeInteger(result.downloadCount) && result.downloadCount >= 0 ? result.downloadCount : null;
    } catch (error) {
      if (['DOWNLOAD_EXPIRED', 'PUBLIC_NOT_FOUND', 'INVALID_REQUEST'].includes(error.code)) persist(pending().filter(item => item.intent.id !== intent.id));
      return null;
    }
  },
  retryPending() {
    if (!running) running = (async () => { for (const item of pending()) await this.complete(item.publicId, item.intent); })().finally(() => { running = null; });
    return running;
  }
};
