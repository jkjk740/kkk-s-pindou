'use strict';

const messages = {
  CUTOUT_UNAVAILABLE: '智能抠图未开通，请使用圈选或画笔。',
  CUTOUT_FAILED: '智能识别未完成，请使用手动工具或稍后重试。',
  CUTOUT_INTERRUPTED: '识别已中断，请手动修正或重新发起。',
  CUTOUT_BUSY: '识别正在排队，请稍后再试。',
  CUTOUT_LIMIT: '今天的智能识别次数已用完，手动工具仍可用。',
  MASK_INVALID: '选区无效，请保留主体后再确认。',
  CUTOUT_NOT_FOUND: '抠图记录不存在。',
  BACKEND_NOT_CONFIGURED: '后端尚未配置微信登录，请填写微信 AppSecret。',
  INVALID_REQUEST: '请求参数无效。',
  PAYLOAD_TOO_LARGE: '请求内容过大。',
  UNAUTHORIZED: '登录已失效，请重新登录。',
  AUTH_FAILED: '微信登录失败，请重新获取登录凭证。',
  SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试。',
  CONFLICT: '作品版本冲突，请保留本机副本后同步。',
  IMAGE_NOT_FOUND: '图片不存在或不属于当前账号。',
  IMAGE_INVALID: '请选择有效的单张 JPEG、PNG 或 WebP 图片。',
  IMAGE_TOO_LARGE: '图片不能超过 10 MiB 或 2000 万像素。',
  QUOTA_EXCEEDED: '当前账号的原图空间已达到 100 MiB。',
  RATE_LIMITED: '操作过于频繁，请稍后再试。',
  PUBLIC_NOT_FOUND: '这份图纸已下架或不存在。',
  ALREADY_PUBLISHED: '这份作品已发布，请确认后更新。',
  PUBLIC_SOURCE_INVALID: '请选择自己创作且已保存的图纸。',
  DOWNLOAD_EXPIRED: '下载凭据已过期，请重新导出。',
  INTERNAL_ERROR: '后端处理失败，请稍后重试。'
};
const statuses = { BACKEND_NOT_CONFIGURED: 503, INVALID_REQUEST: 400, PAYLOAD_TOO_LARGE: 413, UNAUTHORIZED: 401, AUTH_FAILED: 401, SERVICE_UNAVAILABLE: 503, CONFLICT: 409, IMAGE_NOT_FOUND: 404, IMAGE_INVALID: 415, IMAGE_TOO_LARGE: 413, QUOTA_EXCEEDED: 409, RATE_LIMITED: 429 };

class ApiError extends Error {
  constructor(code, details) {
    super(messages[code] || messages.INTERNAL_ERROR);
    this.code = Object.hasOwn(messages, code) ? code : 'INTERNAL_ERROR';
    this.details = details;
  }
}
function errorEnvelope(error) {
  const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
  const result = { ok: false, error: { code, message: messages[code] } };
  if ((code === 'CONFLICT' || code === 'ALREADY_PUBLISHED') && error.details) result.error.details = error.details;
  return result;
}
function statusFor(code) { return { CUTOUT_UNAVAILABLE: 503, CUTOUT_BUSY: 429, CUTOUT_LIMIT: 429, MASK_INVALID: 400, CUTOUT_NOT_FOUND: 404, CUTOUT_FAILED: 502, CUTOUT_INTERRUPTED: 409, PUBLIC_NOT_FOUND: 404, ALREADY_PUBLISHED: 409, PUBLIC_SOURCE_INVALID: 400, DOWNLOAD_EXPIRED: 410 }[code] || statuses[code] || 500; }
module.exports = { ApiError, errorEnvelope, statusFor };
