'use strict';

const crypto = require('crypto');
const { ApiError } = require('./errors');
const APP_ID = 'wx0ebba69092706cc6';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readConfig(env) {
  const appId = env.WECHAT_APPID;
  const appSecret = env.WECHAT_APP_SECRET;
  const sessionSecret = env.SESSION_SECRET;
  const secretValid = value => typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= 1024 && !/[\s\u0000-\u001f\u007f]/.test(value) && !/^(<|YOUR_|REPLACE)/i.test(value);
  if (appId !== APP_ID || !secretValid(appSecret) || !secretValid(sessionSecret) || Buffer.byteLength(sessionSecret, 'utf8') < 32) {
    throw new ApiError('CLOUD_NOT_CONFIGURED');
  }
  return { appId, appSecret, sessionSecret };
}

function encode(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new ApiError('UNAUTHORIZED');
  const buffer = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (encode(buffer) !== value) throw new ApiError('UNAUTHORIZED');
  return buffer;
}

function signature(content, secret) {
  return crypto.createHmac('sha256', secret).update(content).digest();
}

function userId(appId, openid) {
  return 'u_' + crypto.createHash('sha256').update(JSON.stringify([appId, openid])).digest('hex');
}

function issueSession(identity, config, now) {
  const expiresAt = now + SESSION_TTL_MS;
  const claims = encode(JSON.stringify({ v: 1, sub: identity, aud: config.appId, iat: now, exp: expiresAt }));
  const content = 'v1.' + claims;
  return { token: content + '.' + encode(signature(content, config.sessionSecret)), expiresAt, userId: identity };
}

function verifySession(authorization, config, now) {
  try {
    if (typeof authorization !== 'string' || authorization.length > 2055) throw new Error();
    const match = /^Bearer ([A-Za-z0-9._-]+)$/i.exec(authorization);
    if (!match || match[1].length > 2048) throw new Error();
    const parts = match[1].split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || parts[2].length !== 43) throw new Error();
    const supplied = decode(parts[2]);
    const expected = signature(parts[0] + '.' + parts[1], config.sessionSecret);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw new Error();
    const payloadBuffer = decode(parts[1]);
    const payloadText = payloadBuffer.toString('utf8');
    if (!Buffer.from(payloadText, 'utf8').equals(payloadBuffer)) throw new Error();
    const claims = JSON.parse(payloadText);
    if (!claims || typeof claims !== 'object' || Array.isArray(claims) || claims.v !== 1 || claims.aud !== config.appId ||
      typeof claims.sub !== 'string' || !/^u_[a-f0-9]{64}$/.test(claims.sub) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat < 0 || claims.iat > now || claims.exp <= now || claims.exp <= claims.iat ||
      claims.exp - claims.iat > SESSION_TTL_MS) throw new Error();
    return claims.sub;
  } catch (error) {
    throw new ApiError('UNAUTHORIZED');
  }
}

module.exports = { readConfig, issueSession, verifySession, userId };
