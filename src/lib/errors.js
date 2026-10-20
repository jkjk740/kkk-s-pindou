const messages = {
  CUTOUT_UNAVAILABLE: '智能抠图未开通，先用圈选或画笔',
  CUTOUT_FAILED: '识别未完成，可用手动工具修正',
  CUTOUT_INTERRUPTED: '识别已中断，请重新发起或手动修正',
  CUTOUT_BUSY: '正在排队，请稍后再试',
  CUTOUT_LIMIT: '今天的智能识别次数已用完',
  MASK_INVALID: '请保留需要的主体后再确认',
  CUTOUT_NOT_FOUND: '抠图记录暂时无法打开',
  NETWORK_ERROR: '网络连接不畅，请稍后重试',
  REQUEST_TIMEOUT: '连接超时，请重试',
  INVALID_RESPONSE: '内容暂时无法加载，请重试',
  SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试',
  NOT_FOUND: '服务正在更新，请稍后重试',
  UNAUTHORIZED: '登录已失效，请重新登录',
  AUTH_FAILED: '微信登录未完成，请重试',
  RATE_LIMITED: '操作有点快，请稍后再试',
  PUBLIC_NOT_FOUND: '这份图纸已下架或不存在',
  DOWNLOAD_EXPIRED: '请重新下载这份图纸',
  IMAGE_NOT_FOUND: '原图暂时无法打开，请重试'
};

export function clientError(code, message) {
  const error = new Error(message || messages[code] || '这一步没能完成，请再试试');
  error.code = code;
  return error;
}

export function errorMessage(error, fallback = '这一步没能完成，请再试试') {
  if (messages[error?.code]) return messages[error.code];
  const message = error?.message || '';
  if (/[\u4e00-\u9fff]/.test(message) && message.length <= 120 && !/TypeError|ReferenceError|SQL|SELECT|INSERT|http[s]?:\/\/|\bat\s/i.test(message)) return message;
  if (/timeout/i.test(error?.errMsg || message)) return messages.REQUEST_TIMEOUT;
  return fallback;
}
