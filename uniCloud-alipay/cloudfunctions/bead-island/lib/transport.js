'use strict';

const { ApiError, errorEnvelope } = require('./errors');
const { MAX_BODY_BYTES, isObject } = require('./validation');
const { createHttpHandler } = require('./http');

function createHandler(api) {
  const http = createHttpHandler(api);

  async function callFunction(event) {
    try {
      if (!isObject(event) || Object.keys(event).some(key => ['action', 'payload', 'token'].indexOf(key) === -1)) throw new ApiError('INVALID_REQUEST');
      let serialized;
      try { serialized = JSON.stringify(event); } catch (error) { throw new ApiError('INVALID_REQUEST'); }
      if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
      if (event.token !== undefined && (typeof event.token !== 'string' || event.token.length > 2048)) throw new ApiError('UNAUTHORIZED');
      const headers = event.token ? { authorization: 'Bearer ' + event.token } : {};
      return await api({ action: event.action, payload: event.payload }, headers);
    } catch (error) {
      return errorEnvelope(error);
    }
  }

  return async function handle(event, context) {
    const source = context && context.SOURCE;
    if (source === 'http') return http(event);
    if (!source && isObject(event) && ['httpMethod', 'headers', 'body', 'isBase64Encoded', 'queryStringParameters'].some(key =>
      Object.prototype.hasOwnProperty.call(event, key))) return http(event);
    return callFunction(event);
  };
}

module.exports = { createHandler };
