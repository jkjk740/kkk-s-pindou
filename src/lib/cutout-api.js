import { authorizedRequest, uploadCutout } from './cloud.js';
import { clientError } from './errors.js';
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
function id(value) { if (!validId(value)) throw clientError('INVALID_RESPONSE'); return value; }
function cutout(value) { if (!value || !validId(value.id) || !validId(value.sourceImageId) || !validId(value.inputImageId) || !validId(value.maskImageId) || !validId(value.resultImageId)) throw clientError('INVALID_RESPONSE'); return value; }
function task(value) { if (!value || !validId(value.id) || !['queued', 'processing', 'ready', 'failed'].includes(value.status) || value.status === 'ready' && !validId(value.maskImageId)) throw clientError('INVALID_RESPONSE'); return value; }
export function requestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => { const random = Math.floor(Math.random() * 16); return (character === 'x' ? random : (random & 3) | 8).toString(16); }); }
export const cutoutApi = {
  async capabilities() { const value = await authorizedRequest({ path: '/api/cutout/capabilities' }); if (typeof value.intelligent !== 'boolean') throw clientError('INVALID_RESPONSE'); return value; },
  async prepareInput(sourceId) { const value = await authorizedRequest({ path: '/api/images/' + id(sourceId) + '/cutout-input', timeout: 60000 }); if (!validId(value.imageId) || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 1024 || value.height > 1024) throw clientError('INVALID_RESPONSE'); return value; },
  async startTask(sourceId, request) { return task(await authorizedRequest({ path: '/api/images/' + id(sourceId) + '/cutout-tasks', method: 'POST', data: { requestId: id(request) }, timeout: 60000 })); },
  async getTask(taskId) { return task(await authorizedRequest({ path: '/api/cutout-tasks/' + id(taskId) })); },
  async getCutout(cutoutId) { return cutout(await authorizedRequest({ path: '/api/cutouts/' + id(cutoutId) })); },
  async confirmCutout(sourceId, data) { return cutout(await uploadCutout(id(sourceId), data)); }
};
export async function pollCutoutTask(taskId, { isCurrent, onStatus, deadlineMs = 90000 }) {
  const until = Date.now() + deadlineMs;
  while (isCurrent() && Date.now() < until) {
    const value = await cutoutApi.getTask(taskId);
    if (!isCurrent()) return null;
    onStatus?.(value.status);
    if (value.status === 'ready') return value;
    if (value.status === 'failed') throw clientError(value.errorCode || 'CUTOUT_FAILED');
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  if (isCurrent()) throw clientError('REQUEST_TIMEOUT', '识别还未完成，可稍后查看或手动修正');
  return null;
}
