import config from '../config.js';
import { clientError } from './errors.js';

export function httpRequest({ path, method = 'GET', data, token, platform, timeout = 15000, baseUrl = config.apiBaseUrl }) {
  if (!baseUrl) return Promise.reject(new Error('请先配置后端地址'));
  const request = options => platform ? platform.request(options) : uni.request(options);
  return new Promise((resolve, reject) => request({
    url: baseUrl + path, method, data, timeout,
    header: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    success(response) {
      const body = response.data;
      const status = response.statusCode;
      if (status === 401) return reject(clientError('UNAUTHORIZED'));
      if (body?.ok === false && typeof body.error?.code === 'string' && /^(CUTOUT_|MASK_)/.test(body.error.code)) return reject(clientError(body.error.code));
      if (status === 429) return reject(clientError('RATE_LIMITED'));
      if (status >= 500) return reject(clientError('SERVICE_UNAVAILABLE'));
      if (!body || typeof body.ok !== 'boolean' || body.ok && (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))) return reject(clientError('INVALID_RESPONSE'));
      if (!body.ok) { const error = clientError(body.error?.code, body.error?.message); error.details = body.error?.details; return reject(error); }
      if (status && (status < 200 || status >= 300)) return reject(clientError('INVALID_RESPONSE'));
      resolve(body.data);
    },
    fail(error) { reject(clientError(/timeout/i.test(error?.errMsg || '') ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR')); }
  }));
}
