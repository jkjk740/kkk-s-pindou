'use strict';

const { createApi } = require('./lib/api');
const { createHandler } = require('./lib/transport');
const { createRepository } = require('./lib/repository');
const { createWechatExchange } = require('./lib/wechat');

function createMain(options) {
  let adapter;
  function repository() {
    if (!adapter) adapter = createRepository(options.cloud.database());
    return adapter;
  }
  const api = createApi({
    env: options.env,
    clock: options.clock,
    exchange: (code, config) => createWechatExchange(options.cloud.httpclient)(code, config),
    repository: {
      get: (owner, clientId) => repository().get(owner, clientId),
      list: (owner, after, limit) => repository().list(owner, after, limit),
      compareAndSwap: (owner, clientId, baseRevision, next) => repository().compareAndSwap(owner, clientId, baseRevision, next)
    }
  });
  return createHandler(api);
}

exports.createMain = createMain;
exports.main = async function main(event, context) {
  return createMain({ cloud: typeof uniCloud === 'undefined' ? null : uniCloud, env: process.env })(event, context);
};
