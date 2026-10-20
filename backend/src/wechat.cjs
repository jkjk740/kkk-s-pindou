'use strict';

const { ApiError } = require('./errors.cjs');
async function exchange(code, config) {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.search = new URLSearchParams({ appid: config.appId, secret: config.appSecret, js_code: code, grant_type: 'authorization_code' }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) throw new ApiError('SERVICE_UNAVAILABLE');
    const text = await response.text();
    if (text.length > 8192) throw new ApiError('AUTH_FAILED');
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError(error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE');
  }
}
module.exports = { exchange };
