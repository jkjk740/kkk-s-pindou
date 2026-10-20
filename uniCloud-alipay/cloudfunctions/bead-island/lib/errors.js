'use strict';

const messages = {
  CLOUD_NOT_CONFIGURED: '云端同步尚未开启，请先配置云服务。',
  INVALID_REQUEST: '请求参数无效。',
  METHOD_NOT_ALLOWED: '仅支持 POST 请求。',
  UNSUPPORTED_MEDIA_TYPE: '请使用 UTF-8 JSON 请求。',
  PAYLOAD_TOO_LARGE: '请求内容过大。',
  UNAUTHORIZED: '登录已失效，请重新登录。',
  AUTH_FAILED: '微信登录失败，请重新获取登录凭证。',
  SERVICE_UNAVAILABLE: '云服务暂时不可用，请稍后重试。',
  CONFLICT: '作品版本冲突，请先保留本机副本再同步。',
  INTERNAL_ERROR: '云端处理失败，请稍后重试。'
};

class ApiError extends Error {
  constructor(code, details) {
    super(messages[code] || messages.INTERNAL_ERROR);
    this.code = Object.prototype.hasOwnProperty.call(messages, code) ? code : 'INTERNAL_ERROR';
    this.details = details;
  }
}

function errorEnvelope(error) {
  const known = error instanceof ApiError;
  const code = known ? error.code : 'INTERNAL_ERROR';
  const result = { ok: false, error: { code, message: messages[code] } };
  if (known && code === 'CONFLICT' && error.details) result.error.details = error.details;
  return result;
}

module.exports = { ApiError, errorEnvelope };
