import config from '../config.js';
import { httpRequest } from './http.js';
import { authorizedRequest, getSession } from './cloud.js';
import paletteData from '../data/mard.json';
import { validatePattern, countColors } from './pattern.js';
import { clientError } from './errors.js';
import { MAX_GRID_EDGE, MAX_GRID_CELLS, MAX_PALETTE_COLORS } from './conversion-limits.js';

function normalizeItem(value, detail = false) {
  if (!value || !/^[a-f0-9-]{36}$/.test(value.id || '') || !Number.isInteger(value.width) || value.width < 1 || value.width > MAX_GRID_EDGE || !Number.isInteger(value.height) || value.height < 1 || value.height > MAX_GRID_EDGE || typeof value.title !== 'string' || !value.title.trim()) throw clientError('INVALID_RESPONSE');
  const title = Array.from(value.title.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim()).slice(0, 50).join('');
  if (!title) throw clientError('INVALID_RESPONSE');
  const name = typeof value.author?.name === 'string' ? Array.from(value.author.name.trim()).slice(0, 24).join('') : '';
  const number = (input, maximum) => Number.isSafeInteger(input) && input >= 0 && input <= maximum ? input : 0;
  const imagePath = '/api/community/' + value.id + '/thumbnail';
  const thumbnail = typeof value.thumbnailUrl === 'string' && (value.thumbnailUrl === imagePath || new RegExp('^' + imagePath + '\\?v=\\d+$').test(value.thumbnailUrl)) ? value.thumbnailUrl : '';
  const result = { id: value.id, title, author: { name: name || '豆友' }, width: value.width, height: value.height, colorCount: number(value.colorCount, MAX_PALETTE_COLORS), beadCount: number(value.beadCount, MAX_GRID_CELLS), thumbnailUrl: thumbnail, downloadCount: number(value.downloadCount, Number.MAX_SAFE_INTEGER), publishedAt: number(value.publishedAt, Number.MAX_SAFE_INTEGER) };
  if (detail) {
    try { validatePattern(value.pattern, paletteData.colors); } catch { throw clientError('INVALID_RESPONSE'); }
    if (value.pattern.width !== result.width || value.pattern.height !== result.height) throw clientError('INVALID_RESPONSE');
    result.pattern = { ...value.pattern, name: title, cells: value.pattern.cells.slice() };
    result.canManage = value.canManage === true;
    result.colorCount = countColors(result.pattern, paletteData.colors).length;
    result.beadCount = result.pattern.cells.filter(Boolean).length;
  }
  return result;
}

export function normalizeCommunityList(value) {
  if (!Array.isArray(value?.items) || value.items.length > 10 || value.cursor !== null && (typeof value.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,700}$/.test(value.cursor))) throw clientError('INVALID_RESPONSE');
  const items = [];
  for (const item of value.items) {
    try { items.push(normalizeItem(item)); } catch {}
  }
  if (value.items.length && !items.length) throw clientError('INVALID_RESPONSE');
  return { items, cursor: value.cursor };
}

function path(id) { if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('图纸不存在'); return '/api/community/' + id; }
export const community = {
  async list(data) { return normalizeCommunityList(await httpRequest({ path: '/api/community', data: { ...data, limit: 10 } })); },
  async get(id) { return normalizeItem(await httpRequest({ path: path(id), token: getSession()?.token }), true); },
  async publish(data) { return normalizeItem(await authorizedRequest({ path: '/api/community', method: 'POST', data }), true); },
  async update(id, data) { return normalizeItem(await authorizedRequest({ path: path(id), method: 'PUT', data }), true); },
  withdraw(id) { return authorizedRequest({ path: path(id), method: 'DELETE' }); },
  async downloadIntent(id) {
    const result = await httpRequest({ path: path(id) + '/download-intents', method: 'POST' });
    if (!/^[a-f0-9-]{36}$/.test(result.id || '') || !/^[A-Za-z0-9_-]{43}$/.test(result.token || '') || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now()) throw clientError('INVALID_RESPONSE');
    return { id: result.id, token: result.token, expiresAt: result.expiresAt };
  },
  async confirmDownload(id, intent) {
    const result = await httpRequest({ path: path(id) + '/downloads', method: 'POST', data: { id: intent.id, token: intent.token } });
    if (result.id !== id || !Number.isSafeInteger(result.downloadCount) || result.downloadCount < 0) throw clientError('INVALID_RESPONSE');
    return { id, downloadCount: result.downloadCount };
  }
};
export function thumbnailUrl(item) { return item?.thumbnailUrl && config.apiBaseUrl ? config.apiBaseUrl + item.thumbnailUrl : ''; }
