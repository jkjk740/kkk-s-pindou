import config from '../config.js';
import { httpRequest } from './http.js';
import paletteData from '../data/mard.json';
import { validatePattern } from './pattern.js';

function failure(message, code, details) {
  const error = new Error(message); error.code = code; error.details = details; return error;
}
function assertWork(work, expectedId) {
  if (!work || typeof work.id !== 'string' || (expectedId && work.id !== expectedId) || !Number.isSafeInteger(work.revision) || work.revision < 1 || (!work.deleted && !Array.isArray(work.pattern?.cells)) || !Array.isArray(work.completedRows)) throw failure('后端作品响应不完整，请重试', 'INVALID_RESPONSE');
  if (work.pattern) {
    try { validatePattern(work.pattern, paletteData.colors); } catch { throw failure('图纸响应不完整，请重试', 'INVALID_RESPONSE'); }
    if (new Set(work.completedRows).size !== work.completedRows.length || work.completedRows.some(row => !Number.isInteger(row) || row < 0 || row >= work.pattern.height)) throw failure('作品进度响应不完整，请重试', 'INVALID_RESPONSE');
  } else if (!work.deleted || work.completedRows.length) throw failure('后端作品响应不完整，请重试', 'INVALID_RESPONSE');
  return work;
}
function bodyData(body) {
  if (!body || typeof body.ok !== 'boolean') throw failure('后端响应无效，请重试', 'INVALID_RESPONSE');
  if (!body.ok) throw failure(body.error?.message || '后端操作失败', body.error?.code, body.error?.details);
  if (!body.data || typeof body.data !== 'object') throw failure('后端响应不完整，请重试', 'INVALID_RESPONSE');
  return body.data;
}
function networkError() { return failure('无法连接本地后端，请确认已启动服务并配置正确地址', 'NETWORK_ERROR'); }

export function createCloudClient({ platform, invoke, enabled, scope = 'local-backend', baseUrl = scope }) {
  const sessionKey = 'bead-island-http-session-v1:' + encodeURIComponent(scope);
  const ownerKey = 'bead-island-http-owner-v1:' + encodeURIComponent(scope);
  let running = null;
  let loggingIn = null;
  function configured() { if (!enabled) throw failure('请先配置 Node.js 后端地址，本机作品仍保留', 'BACKEND_NOT_CONFIGURED'); }
  function getSession() {
    try {
      const cached = platform.getStorageSync(sessionKey);
      const localOwner = platform.getStorageSync('bead-island-owner-v1');
      const scopedOwner = platform.getStorageSync(ownerKey);
      return typeof cached?.token === 'string' && cached.expiresAt > Date.now() + 60000 && (!localOwner || localOwner === cached.userId) && (!scopedOwner || scopedOwner === cached.userId) ? cached : null;
    } catch { return null; }
  }
  async function raw(action, payload, token) {
    const result = await invoke({ action, payload }, token);
    return bodyData(result?.result);
  }
  async function authenticate(force) {
    configured();
    const cached = getSession();
    if (!force && cached) return cached;
    const result = await new Promise((resolve, reject) => platform.login({ provider: 'weixin', success: resolve, fail: reject }));
    if (!result.code) throw failure('微信登录未完成，请重试', 'LOGIN_FAILED');
    const session = await raw('auth.login', { code: result.code });
    if (typeof session.token !== 'string' || !/^u_[a-f0-9]{64}$/.test(session.userId) || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) throw failure('登录响应不完整，请重试', 'INVALID_RESPONSE');
    const owner = platform.getStorageSync(ownerKey);
    const localOwner = platform.getStorageSync('bead-island-owner-v1');
    if ((owner && owner !== session.userId) || (localOwner && localOwner !== session.userId)) throw failure('微信账号已变更，请先导出本机作品后再清理应用数据，避免混合两个账号的作品', 'ACCOUNT_CHANGED');
    platform.setStorageSync(ownerKey, session.userId);
    platform.setStorageSync('bead-island-owner-v1', session.userId);
    platform.setStorageSync(sessionKey, session);
    platform.$emit?.('bead-account-ready');
    return session;
  }
  function login(force = false) {
    if (!loggingIn) loggingIn = authenticate(force).finally(() => { loggingIn = null; });
    return loggingIn;
  }
  async function authorized(operation) {
    const session = await login();
    try { return await operation(session.token); }
    catch (error) {
      if (error.code !== 'UNAUTHORIZED') throw error;
      platform.removeStorageSync(sessionKey);
      const renewed = await login(true);
      return operation(renewed.token);
    }
  }
  const request = (action, payload) => authorized(token => raw(action, payload, token));
  async function synchronize(repository) {
    configured();
    await login();
    repository.prepareBackend?.(scope);
    let count = 0; let conflicts = 0;
    for (const snapshot of repository.all().filter(work => work.dirty)) {
      try {
        const payload = snapshot.deleted ? { id: snapshot.id, baseRevision: snapshot.revision || 0 } : { work: { id: snapshot.id, pattern: snapshot.pattern, completedRows: snapshot.completedRows, sourceImageId: snapshot.sourceImageId || null, cutoutId: snapshot.cutoutId || null, originPublicId: snapshot.originPublicId || null }, baseRevision: snapshot.revision || 0 };
        let response;
        try { response = await request(snapshot.deleted ? 'works.delete' : 'works.save', payload); }
        catch (error) {
          if (error.code !== 'CONFLICT' || !error.details || error.details.work !== null || payload.baseRevision === 0) throw error;
          response = await request(snapshot.deleted ? 'works.delete' : 'works.save', { ...payload, baseRevision: 0 });
        }
        repository.acknowledge(snapshot, { ...assertWork(response.work, snapshot.id), syncBackendScope: scope }); count++;
      } catch (error) {
        if (error.code !== 'CONFLICT' || !error.details?.work) throw error;
        repository.forkConflict(snapshot.id, { ...assertWork(error.details.work, snapshot.id), syncBackendScope: scope }); conflicts++;
      }
    }
    let cursor = null; const seen = new Set();
    do {
      const response = await request('works.list', { limit: 20, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(response.items) || (response.cursor !== null && typeof response.cursor !== 'string')) throw failure('后端列表响应不完整，请重试', 'INVALID_RESPONSE');
      repository.mergeRemote(response.items.map(work => ({ ...assertWork(work), syncBackendScope: scope })));
      cursor = response.cursor;
      if (cursor && seen.has(cursor)) throw failure('后端分页响应异常，请重试', 'INVALID_RESPONSE');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return { count, conflicts };
  }
  return {
    login, getSession,
    authorizedRequest(options) { return authorized(token => httpRequest({ ...options, token, platform, baseUrl })); },
    async getProfile() { const profile = await authorized(token => httpRequest({ path: '/api/profile', token, platform, baseUrl })); const session = getSession(); if (session) platform.setStorageSync(sessionKey, { ...session, profile }); return profile; },
    async updateProfile(displayName) { const profile = await authorized(token => httpRequest({ path: '/api/profile', method: 'PATCH', data: { displayName }, token, platform, baseUrl })); const session = getSession(); if (session) platform.setStorageSync(sessionKey, { ...session, profile }); return profile; },
    syncWorks(repository) { if (!running) running = synchronize(repository).finally(() => { running = null; }); return running; },
    uploadCutout(sourceId, data) {
      return authorized(token => new Promise((resolve, reject) => platform.uploadFile({ url: baseUrl + '/api/images/' + sourceId + '/cutouts', filePath: data.filePath, name: 'mask', formData: { inputImageId: data.inputImageId, requestId: data.requestId }, header: { Authorization: 'Bearer ' + token }, timeout: 60000, success(result) { try { resolve(bodyData(typeof result.data === 'string' ? JSON.parse(result.data) : result.data)); } catch (error) { reject(error); } }, fail: () => reject(networkError()) })));
    },
    uploadImage(filePath) {
      return authorized(token => new Promise((resolve, reject) => platform.uploadFile({
        url: baseUrl + '/api/images', filePath, name: 'file', header: { Authorization: 'Bearer ' + token }, timeout: 120000,
        success(result) {
          try {
            const data = bodyData(typeof result.data === 'string' ? JSON.parse(result.data) : result.data);
            if (!data.image?.id) throw failure('图片上传响应不完整，请重试', 'INVALID_RESPONSE');
            resolve(data.image);
          } catch (error) { reject(error instanceof SyntaxError ? failure('图片上传响应无效', 'INVALID_RESPONSE') : error); }
        }, fail: () => reject(networkError())
      })));
    },
    downloadImage(imageId) {
      if (!/^[a-f0-9-]{36}$/.test(imageId)) return Promise.reject(failure('没有关联原图', 'IMAGE_NOT_FOUND'));
      return authorized(token => new Promise((resolve, reject) => platform.downloadFile({
        url: baseUrl + '/api/images/' + imageId + '/content', header: { Authorization: 'Bearer ' + token }, timeout: 60000,
        success(result) {
          if (result.statusCode === 401) return reject(failure('登录已失效', 'UNAUTHORIZED'));
          if (result.statusCode !== 200 || !result.tempFilePath) return reject(failure('原图暂时无法读取，请稍后重试', 'IMAGE_NOT_FOUND'));
          resolve(result.tempFilePath);
        }, fail: () => reject(networkError())
      })));
    }
  };
}

let client;
export function isConfigured() { return Boolean(config.apiBaseUrl); }
function currentClient() {
  if (!client) client = createCloudClient({
    platform: uni, enabled: isConfigured(), scope: config.apiBaseUrl || 'not-configured', baseUrl: config.apiBaseUrl,
    invoke: (data, token) => new Promise((resolve, reject) => uni.request({
      url: config.apiBaseUrl + '/api/sync', method: 'POST', data, timeout: 15000,
      header: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      success: response => resolve({ result: response.data }), fail: () => reject(networkError())
    }))
  });
  return client;
}
export const login = () => currentClient().login();
export const getSession = () => currentClient().getSession();
export const uploadImage = filePath => currentClient().uploadImage(filePath);
export const downloadImage = imageId => currentClient().downloadImage(imageId);
export const syncWorks = repository => currentClient().syncWorks(repository);

export const authorizedRequest = options => currentClient().authorizedRequest(options);
export const getProfile = () => currentClient().getProfile();
export const updateProfile = name => currentClient().updateProfile(name);
export const uploadCutout = (sourceId, data) => currentClient().uploadCutout(sourceId, data);
