'use strict';

const { ApiError } = require('./errors');

function createWechatExchange(httpclient) {
  return async function exchange(code, config) {
    const url = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + encodeURIComponent(config.appId) +
      '&secret=' + encodeURIComponent(config.appSecret) + '&js_code=' + encodeURIComponent(code) + '&grant_type=authorization_code';
    let response;
    try {
      response = await httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 5000, followRedirect: false });
    } catch (error) {
      throw new ApiError('SERVICE_UNAVAILABLE');
    }
    if (!response || response.status !== 200) throw new ApiError('SERVICE_UNAVAILABLE');
    const data = response.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || (data.errcode !== undefined && data.errcode !== 0) ||
      typeof data.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.openid)) throw new ApiError('AUTH_FAILED');
    return { openid: data.openid };
  };
}

module.exports = { createWechatExchange };
