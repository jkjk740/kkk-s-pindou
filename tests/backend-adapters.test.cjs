const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { env, work, databaseDouble, fixture } = require('./backend-helpers.cjs');

function repository(database) {
  return require('../uniCloud-alipay/cloudfunctions/bead-island/lib/repository.js').createRepository(database);
}

test('production WeChat adapter calls code2Session with HTTPS, encoded parameters and a bounded timeout', async () => {
  const { createWechatExchange } = require('../uniCloud-alipay/cloudfunctions/bead-island/lib/wechat.js');
  const calls = [];
  const exchange = createWechatExchange({
    async request(url, options) {
      calls.push({ url, options });
      return { status: 200, data: { openid: 'openid-real', session_key: 'private-session-key', unionid: 'private-union' } };
    }
  });
  assert.deepEqual(await exchange('a+b/&?', { appId: env.WECHAT_APPID, appSecret: 'secret+/?&' }), { openid: 'openid-real' });
  const endpoint = new URL(calls[0].url);
  assert.equal(endpoint.origin, 'https://api.weixin.qq.com');
  assert.equal(endpoint.pathname, '/sns/jscode2session');
  assert.equal(endpoint.searchParams.get('appid'), env.WECHAT_APPID);
  assert.equal(endpoint.searchParams.get('secret'), 'secret+/?&');
  assert.equal(endpoint.searchParams.get('js_code'), 'a+b/&?');
  assert.equal(endpoint.searchParams.get('grant_type'), 'authorization_code');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.dataType, 'json');
  assert.equal(calls[0].options.timeout, 5000);
  assert.equal(calls[0].options.followRedirect, false);
});

test('WeChat adapter rejects API errors, invalid identities, non-200 HTTP and network failures without secrets', async () => {
  const { createWechatExchange } = require('../uniCloud-alipay/cloudfunctions/bead-island/lib/wechat.js');
  for (const response of [
    { status: 200, data: { errcode: 40029, errmsg: 'sensitive-wechat-message' } },
    { status: 200, data: { openid: 'openid-real', errcode: 40029 } },
    { status: 200, data: { session_key: 'sensitive-wechat-message' } },
    { status: 200, data: { openid: { sensitive: true } } },
    { status: 503, data: { openid: 'openid-real' } },
    { status: 200, data: '<sensitive-wechat-message>' }
  ]) {
    const exchange = createWechatExchange({ request: async () => response });
    await assert.rejects(exchange('code', { appId: env.WECHAT_APPID, appSecret: env.WECHAT_APP_SECRET }), error => {
      assert.doesNotMatch(error.message, /sensitive|session_key|test-only|openid/);
      return true;
    });
  }
  const exchange = createWechatExchange({ request: async () => { throw new Error('sensitive-network-secret'); } });
  await assert.rejects(exchange('code', { appId: env.WECHAT_APPID, appSecret: env.WECHAT_APP_SECRET }), error => {
    assert.doesNotMatch(error.message, /sensitive-network-secret/);
    return true;
  });
});

test('database creates use deterministic owner+client ID and atomic insert rather than unconditional upsert', async () => {
  const database = databaseDouble();
  const adapter = repository(database);
  const next = { owner: 'alice', clientId: 'cat-1', revision: 1, updatedAt: 100, deleted: false, pattern: work().pattern, completedRows: [] };
  const results = await Promise.all(Array.from({ length: 10 }, () => adapter.compareAndSwap('alice', 'cat-1', 0, next)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(database.records.size, 1);
  assert.equal([...database.records.keys()][0], database.databaseId('alice', 'cat-1'));
  assert.equal((await adapter.get('alice', 'cat-1')).revision, 1);
  assert.equal(await adapter.get('bob', 'cat-1'), null);
  assert.equal(await adapter.compareAndSwap('bob', 'cat-1', 0, { ...next, owner: 'bob' }), true);
  assert.equal(database.records.size, 2);
});

test('database CAS update includes database ID, owner, client ID and base revision in the same mutation', async () => {
  const database = databaseDouble();
  const adapter = repository(database);
  const initial = { owner: 'alice', clientId: 'cat-1', revision: 1, pattern: work().pattern, completedRows: [], deleted: false, updatedAt: 100 };
  await adapter.compareAndSwap('alice', 'cat-1', 0, initial);
  const results = await Promise.all(Array.from({ length: 10 }, (unusedValue, index) => adapter.compareAndSwap('alice', 'cat-1', 1, {
    ...initial, revision: 2, completedRows: [1], pattern: { ...initial.pattern, name: `winner-${index}` }, updatedAt: 200
  })));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await adapter.get('alice', 'cat-1')).pattern.name, 'winner-0');
  const update = database.operations.find(operation => operation.operation === 'update');
  assert.deepEqual(update.conditions, { _id: database.databaseId('alice', 'cat-1'), owner: 'alice', clientId: 'cat-1', revision: 1 });
  assert.equal(update.patch.pattern.operator, 'set');
  assert.equal(update.patch.completedRows.operator, 'set');
  assert.equal(await adapter.compareAndSwap('bob', 'cat-1', 1, { ...initial, owner: 'bob', revision: 2 }), false);
  assert.equal((await adapter.get('alice', 'cat-1')).revision, 2);
});

test('database pagination filters only authenticated owner, orders stable clientId, and keeps tombstones', async () => {
  const database = databaseDouble();
  const adapter = repository(database);
  for (const clientId of ['cat-3', 'cat-1', 'cat-2']) {
    await adapter.compareAndSwap('alice', clientId, 0, { owner: 'alice', clientId, revision: 1, deleted: clientId === 'cat-2', updatedAt: 100 });
  }
  await adapter.compareAndSwap('bob', 'cat-2', 0, { owner: 'bob', clientId: 'cat-2', revision: 1, deleted: false });
  const items = await adapter.list('alice', 'cat-1', 2);
  assert.deepEqual(items.map(item => item.clientId), ['cat-2', 'cat-3']);
  assert.equal(items[0].deleted, true);
  const read = database.operations.at(-1);
  assert.deepEqual(read.conditions, { owner: 'alice', clientId: { operator: 'gt', value: 'cat-1' } });
  assert.deepEqual(read.order, { field: 'clientId', direction: 'asc' });
  assert.equal(read.limit, 2);
});

test('database errors are not mistaken for conflicts or successful persistence', async () => {
  const database = databaseDouble();
  const adapter = repository(database);
  database.fail(new Error('database-secret'));
  await assert.rejects(adapter.compareAndSwap('alice', 'cat-1', 0, { owner: 'alice', clientId: 'cat-1', revision: 1 }));
  await assert.rejects(adapter.compareAndSwap('alice', 'cat-1', 1, { owner: 'alice', clientId: 'cat-1', revision: 2 }));
  const harness = fixture({ repository: adapter });
  const { token } = await harness.login();
  const result = await harness.request('works.save', { work: work(), baseRevision: 0 }, token);
  assert.equal(result.error.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /database-secret/);
});

test('production repository through the API preserves CAS and deletion idempotency under concurrent requests', async () => {
  const database = databaseDouble();
  const harness = fixture({ repository: repository(database) });
  const { token } = await harness.login();
  for (const baseRevision of [0, 1]) {
    const results = await Promise.all(Array.from({ length: 16 }, (unusedValue, index) => harness.request('works.save', {
      work: work('racing', { pattern: { ...work().pattern, name: `change-${index}` } }), baseRevision
    }, token)));
    assert.equal(results.filter(result => result.ok).length, 1);
    assert.ok(results.filter(result => !result.ok).every(result => result.error.code === 'CONFLICT'));
  }
  const deleted = await Promise.all(Array.from({ length: 12 }, () => harness.request('works.delete', { id: 'racing', baseRevision: 2 }, token)));
  assert.ok(deleted.every(result => result.ok && result.data.work.revision === 3 && result.data.work.deleted));
  assert.equal(database.records.size, 1);
  const bob = await harness.login('bob');
  assert.deepEqual((await harness.request('works.list', {}, bob.token)).data.items, []);
  const intrusion = await harness.request('works.save', { work: work('racing'), baseRevision: 3 }, bob.token);
  assert.equal(intrusion.error.code, 'CONFLICT');
  assert.equal(intrusion.error.details.work, null);
});

test('repository mutations fail closed when given a mismatched owner, client ID or revision', async () => {
  const database = databaseDouble();
  const adapter = repository(database);
  for (const next of [
    { owner: 'bob', clientId: 'cat-1', revision: 1 },
    { owner: 'alice', clientId: 'cat-2', revision: 1 },
    { owner: 'alice', clientId: 'cat-1', revision: 5 }
  ]) await assert.rejects(adapter.compareAndSwap('alice', 'cat-1', 0, next));
  assert.equal(database.operations.length, 0);
  assert.equal(database.records.size, 0);
});

test('deployable entrypoint wires real uniCloud dependencies, but missing config touches neither network nor database', async () => {
  const { createMain } = require('../uniCloud-alipay/cloudfunctions/bead-island/index.js');
  const database = databaseDouble();
  let requests = 0;
  let databaseCalls = 0;
  const cloud = {
    database() { databaseCalls += 1; return database; },
    httpclient: { async request() { requests += 1; return { status: 200, data: { openid: 'openid-live-adapter', session_key: 'secret' } }; } }
  };
  const main = createMain({ cloud, env, clock: () => 1700000000000 });
  const request = (action, payload, token) => ({
    httpMethod: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, payload })
  });
  const login = JSON.parse((await main(request('auth.login', { code: 'real-code' }))).body);
  assert.equal(login.ok, true);
  assert.equal(requests, 1);
  const saved = JSON.parse((await main(request('works.save', { work: work(), baseRevision: 0 }, login.data.token))).body);
  assert.equal(saved.ok, true);
  assert.equal(databaseCalls, 1);
  assert.equal(database.records.size, 1);
  const unconfigured = createMain({ cloud, env: {} });
  const failure = JSON.parse((await unconfigured(request('auth.login', { code: 'real-code' }))).body);
  assert.equal(failure.error.code, 'CLOUD_NOT_CONFIGURED');
  assert.equal(requests, 1);
  assert.equal(databaseCalls, 1);
});

test('function packaging is CommonJS, contains no secrets and schemas forbid every public client operation', () => {
  const root = path.join(__dirname, '../uniCloud-alipay');
  const packaging = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions/bead-island/package.json'), 'utf8'));
  assert.equal(packaging.type, 'commonjs');
  assert.equal(packaging.main, 'index.js');
  assert.equal(packaging.name, 'bead-island');
  assert.equal(packaging['cloudfunction-config'].path, undefined);
  assert.equal(packaging['cloudfunction-config'].runtime, 'Nodejs18');
  assert.doesNotMatch(JSON.stringify(packaging), /SESSION_SECRET|WECHAT_APP_SECRET/);
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'database/bead-works.schema.json'), 'utf8'));
  assert.deepEqual(schema.permission, { read: false, create: false, update: false, delete: false, count: false });
  for (const field of ['owner', 'clientId', 'revision', 'deleted']) assert.ok(schema.required.includes(field));
  const indexes = JSON.parse(fs.readFileSync(path.join(root, 'database/bead-works.index.json'), 'utf8'));
  assert.ok(Array.isArray(indexes));
  assert.ok(indexes.some(index => index.IndexName === 'owner_clientId' && index.MgoKeySchema.MgoIsUnique));
});
