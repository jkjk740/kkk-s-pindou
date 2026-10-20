const test = require('node:test');
const assert = require('node:assert/strict');
const { env, work, databaseDouble } = require('./backend-helpers.cjs');

function createMain(options = {}) {
  const { createMain: factory } = require('../uniCloud-alipay/cloudfunctions/bead-island/index.js');
  const database = databaseDouble();
  return factory({
    env, clock: () => 1700000000000,
    cloud: {
      database: () => database,
      httpclient: { request: async () => ({ status: 200, data: { openid: 'openid-callfunction', session_key: 'private-key' } }) }
    },
    ...options
  });
}

test('callFunction event login returns a direct envelope, followed by top-level-token save/list/delete', async () => {
  const main = createMain();
  const login = await main({ action: 'auth.login', payload: { code: 'wechat-code' } }, { SOURCE: 'client', APPID: '__UNI__ACD00BD' });
  assert.equal(login.ok, true);
  assert.equal(login.mpserverlessComposedResponse, undefined);
  assert.deepEqual(Object.keys(login.data).sort(), ['expiresAt', 'token', 'userId']);
  const token = login.data.token;
  const saved = await main({ action: 'works.save', payload: { work: work(), baseRevision: 0 }, token }, { SOURCE: 'client' });
  assert.equal(saved.ok, true);
  assert.equal(saved.data.work.revision, 1);
  const listed = await main({ action: 'works.list', payload: {}, token });
  assert.deepEqual(listed.data.items, [saved.data.work]);
  const deleted = await main({ action: 'works.delete', payload: { id: 'cat-1', baseRevision: 1 }, token });
  assert.equal(deleted.data.work.deleted, true);
  assert.equal(deleted.data.work.revision, 2);
  assert.doesNotMatch(JSON.stringify({ login, saved, deleted }), /private-key|session_key|openid|clientId|owner/);
});

test('callFunction top-level tokens use the same tampering and expiry validation as HTTP', async () => {
  let now = 1700000000000;
  const main = createMain({ clock: () => now });
  const login = await main({ action: 'auth.login', payload: { code: 'wechat-code' } });
  assert.equal(login.ok, true);
  for (const token of [undefined, null, {}, '', `${login.data.token}.tampered`]) {
    const result = await main({ action: 'works.list', payload: {}, token }, { SOURCE: 'client' });
    assert.equal(result.error.code, 'UNAUTHORIZED');
    assert.equal(result.mpserverlessComposedResponse, undefined);
  }
  now = login.data.expiresAt;
  assert.equal((await main({ action: 'works.list', payload: {}, token: login.data.token })).error.code, 'UNAUTHORIZED');
});

test('callFunction source/context metadata does not bypass authentication or specify an owner', async () => {
  const main = createMain();
  for (const SOURCE of ['client', 'function', 'server', 'timing']) {
    const result = await main({ action: 'works.list', payload: {} }, {
      SOURCE, OWNER: 'alice', APPID: '__UNI__ACD00BD', SPACEINFO: { spaceId: 'env-00jy6xjkcc6q', provider: 'alipay' }
    });
    assert.equal(result.error.code, 'UNAUTHORIZED');
  }
  const login = await main({ action: 'auth.login', payload: { code: 'wechat-code' } });
  const result = await main({ action: 'works.list', payload: { owner: 'alice' }, token: login.data.token });
  assert.equal(result.error.code, 'INVALID_REQUEST');
});

test('callFunction rejects extra event fields, malformed params and payloads above the shared bound', async () => {
  const main = createMain();
  for (const event of [null, [], {}, { action: 'works.list' }, { action: 'auth.login', payload: [] },
    { action: 'works.list', payload: {}, owner: 'alice' }, { action: 'works.list', payload: {}, headers: { authorization: 'Bearer alternate' } }]) {
    const result = await main(event, { SOURCE: 'client' });
    assert.equal(result.error.code, 'INVALID_REQUEST');
    assert.equal(result.mpserverlessComposedResponse, undefined);
  }
  const oversized = await main({ action: 'auth.login', payload: { code: '字'.repeat(24000) } }, { SOURCE: 'client' });
  assert.equal(oversized.error.code, 'PAYLOAD_TOO_LARGE');
});

test('HTTP and callFunction adapters share one business envelope, but retain their transport formats', async () => {
  const main = createMain();
  const direct = await main({ action: 'auth.login', payload: { code: 'wechat-code' } }, { SOURCE: 'client' });
  const http = await main({
    httpMethod: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'auth.login', payload: { code: 'wechat-code' } })
  }, { SOURCE: 'http' });
  assert.equal(direct.ok, true);
  assert.equal(http.mpserverlessComposedResponse, true);
  assert.deepEqual(JSON.parse(http.body), direct);
  const malformedHttp = await main({ action: 'auth.login', payload: { code: 'wechat-code' } }, { SOURCE: 'http' });
  assert.equal(malformedHttp.statusCode, 405);
  assert.equal(JSON.parse(malformedHttp.body).error.code, 'METHOD_NOT_ALLOWED');
});

test('missing cloud secrets fail closed for callFunction without exchange, database calls or mock success', async () => {
  const main = createMain({
    env: {},
    cloud: {
      database() { throw new Error('must-not-access-db'); },
      httpclient: { request() { throw new Error('must-not-exchange'); } }
    }
  });
  const result = await main({ action: 'auth.login', payload: { code: 'wechat-code' } });
  assert.equal(result.error.code, 'CLOUD_NOT_CONFIGURED');
  assert.match(result.error.message, /云端同步尚未开启/);
  assert.doesNotMatch(JSON.stringify(result), /must-not|stack/);
});

test('deployed exports.main reads environment variables and uses the runtime uniCloud API', async () => {
  const { main } = require('../uniCloud-alipay/cloudfunctions/bead-island/index.js');
  const previousEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const previousCloud = global.uniCloud;
  const database = databaseDouble();
  let exchanges = 0;
  try {
    Object.assign(process.env, env);
    global.uniCloud = {
      database: () => database,
      httpclient: { async request() { exchanges += 1; return { status: 200, data: { openid: 'runtime-user', session_key: 'hidden' } }; } }
    };
    const login = await main({ action: 'auth.login', payload: { code: 'runtime-code' } }, { SOURCE: 'client' });
    assert.equal(login.ok, true);
    assert.equal(exchanges, 1);
    const saved = await main({ action: 'works.save', payload: { work: work(), baseRevision: 0 }, token: login.data.token }, { SOURCE: 'client' });
    assert.equal(saved.ok, true);
    assert.equal(database.records.size, 1);
    delete process.env.SESSION_SECRET;
    const unconfigured = await main({ action: 'auth.login', payload: { code: 'runtime-code' } });
    assert.equal(unconfigured.error.code, 'CLOUD_NOT_CONFIGURED');
    assert.equal(exchanges, 1);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousCloud === undefined) delete global.uniCloud;
    else global.uniCloud = previousCloud;
  }
});
