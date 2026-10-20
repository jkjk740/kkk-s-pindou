'use strict';

const { ApiError, errorEnvelope } = require('./errors');
const { MAX_BODY_BYTES, isObject } = require('./validation');

function invalid() {
  throw new ApiError('INVALID_REQUEST');
}

function normalizeHeaders(input) {
  if (!isObject(input) || Object.keys(input).length > 64) invalid();
  const headers = Object.create(null);
  let size = 0;
  for (const name of Object.keys(input)) {
    const value = input[name];
    const key = name.toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(key) || typeof value !== 'string' ||
      /[\u0000-\u001f\u007f]/.test(value) || Object.prototype.hasOwnProperty.call(headers, key)) invalid();
    size += Buffer.byteLength(name + value, 'utf8');
    if (size > 16384) invalid();
    headers[key] = value;
  }
  return headers;
}

function parseEvent(event) {
  if (!isObject(event) || event.httpMethod !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED');
  const headers = normalizeHeaders(event.headers);
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(headers['content-type'] || '') ||
    (headers['content-encoding'] && headers['content-encoding'].toLowerCase() !== 'identity')) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  if (event.queryStringParameters != null && (!isObject(event.queryStringParameters) || Object.keys(event.queryStringParameters).length > 0)) invalid();
  if (typeof event.body !== 'string') invalid();
  const flag = event.isBase64Encoded;
  if (flag !== undefined && flag !== true && flag !== false && flag !== 'true' && flag !== 'false') invalid();
  const encoded = flag === true || flag === 'true';
  const wireLimit = encoded ? Math.ceil(MAX_BODY_BYTES / 3) * 4 : MAX_BODY_BYTES;
  if (Buffer.byteLength(event.body, 'utf8') > wireLimit) throw new ApiError('PAYLOAD_TOO_LARGE');
  let buffer;
  if (encoded) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(event.body)) invalid();
    buffer = Buffer.from(event.body, 'base64');
    if (buffer.toString('base64') !== event.body) invalid();
  } else {
    buffer = Buffer.from(event.body, 'utf8');
  }
  if (buffer.length > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
  if (headers['content-length'] !== undefined) {
    if (!/^\d{1,10}$/.test(headers['content-length'])) invalid();
    const declared = Number(headers['content-length']);
    if (declared > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
    if (declared !== buffer.length) invalid();
  }
  const body = buffer.toString('utf8');
  if (!Buffer.from(body, 'utf8').equals(buffer)) invalid();
  let request;
  try { request = JSON.parse(body); } catch (error) { invalid(); }
  return { request, headers };
}

function response(envelope) {
  const statuses = {
    INVALID_REQUEST: 400, METHOD_NOT_ALLOWED: 405, UNSUPPORTED_MEDIA_TYPE: 415, PAYLOAD_TOO_LARGE: 413,
    UNAUTHORIZED: 401, AUTH_FAILED: 401, CONFLICT: 409, CLOUD_NOT_CONFIGURED: 503,
    SERVICE_UNAVAILABLE: 503, INTERNAL_ERROR: 500
  };
  return {
    mpserverlessComposedResponse: true, isBase64Encoded: false,
    statusCode: envelope.ok ? 200 : (statuses[envelope.error.code] || 500),
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(envelope)
  };
}

function createHttpHandler(api) {
  return async function handle(event) {
    try {
      const parsed = parseEvent(event);
      return response(await api(parsed.request, parsed.headers));
    } catch (error) {
      return response(errorEnvelope(error));
    }
  };
}

module.exports = { createHttpHandler };
