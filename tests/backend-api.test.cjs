const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { env, pattern, work, fixture } = require('./backend-helpers.cjs');

function assertError(result, code) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
  assert.equal(typeof result.error.message, 'string');
}

test('login exchanges a real code dependency, returns an opaque stable user and no private fields', async () => {
  const harness = fixture();
  const login = await harness.login();
  assert.deepEqual(Object.keys(login).sort(), ['expiresAt', 'token', 'userId']);
  assert.equal(login.expiresAt, 1700000000000 + 7 * 24 * 60 * 60 * 1000);
  assert.match(login.userId, /^u_[a-f0-9]{64}$/);
  assert.equal(harness.exchanges.length, 1);
  assert.equal(harness.exchanges[0].code, 'alice');
  assert.equal(harness.exchanges[0].config.appId, env.WECHAT_APPID);
  assert.equal(harness.exchanges[0].config.appSecret, env.WECHAT_APP_SECRET);
  assert.equal((await harness.login()).userId, login.userId);
  assert.doesNotMatch(JSON.stringify(login), /openid|session_key|must-never-escape|test-only/);
  assertError(await harness.request('works.list', {}, null), 'UNAUTHORIZED');
  assert.equal((await harness.request('works.list', {}, login.token)).ok, true);
});

test('missing, incorrect or placeholder configuration never manufactures login success', async () => {
  for (const configuration of [
    {}, { ...env, WECHAT_APPID: undefined }, { ...env, WECHAT_APPID: 'wx-other-app' },
    { ...env, WECHAT_APP_SECRET: '' }, { ...env, WECHAT_APP_SECRET: '<WECHAT_APP_SECRET>' },
    { ...env, SESSION_SECRET: '' }, { ...env, SESSION_SECRET: 'short' },
    { ...env, SESSION_SECRET: '<GENERATE_RANDOM_SECRET_AT_LEAST_32_BYTES>' }
  ]) {
    const harness = fixture({ env: configuration });
    const result = await harness.request('auth.login', { code: 'alice' });
    assertError(result, 'CLOUD_NOT_CONFIGURED');
    assert.match(result.error.message, /云端同步尚未开启/);
    assert.equal(harness.exchanges.length, 0);
  }
});

test('external failures and malformed login identities are sanitized', async () => {
  for (const exchange of [
    async () => { throw new Error('secret-internal-stack'); },
    async () => ({ session_key: 'secret-internal-stack' }),
    async () => ({ openid: { attack: true } }),
    async () => ({ openid: 'openid-alice', errcode: 40029 })
  ]) {
    const result = await fixture({ exchange }).request('auth.login', { code: 'alice' });
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /secret-internal-stack|session_key|stack|errcode|attack/);
  }
});

test('tokens reject altered claims, altered signatures, malformed encoding and expiry at the millisecond', async context => {
  const harness = fixture();
  const login = await harness.login();
  const parts = login.token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  payload.sub = (await harness.login('bob')).userId;
  const forged = [parts[0], Buffer.from(JSON.stringify(payload)).toString('base64url'), parts[2]].join('.');
  const alteredSignature = parts[2][0] === 'A' ? 'B' : 'A';
  for (const token of [forged, `${parts[0]}.${parts[1]}.${alteredSignature}${parts[2].slice(1)}`,
    '', 'bad', `${login.token}.extra`, `${parts[0]}.${parts[1]}.AA`, `v2.${parts[1]}.${parts[2]}`,
    `${parts[0]}.${parts[1]}=.${parts[2]}`, 'x'.repeat(3000)]) {
    assertError(await harness.request('works.list', {}, token), 'UNAUTHORIZED');
  }
  const timingSafe = context.mock.method(crypto, 'timingSafeEqual');
  assert.equal((await harness.request('works.list', {}, login.token)).ok, true);
  assert.ok(timingSafe.mock.calls.length > 0);
  for (const call of timingSafe.mock.calls) assert.equal(call.arguments[0].length, call.arguments[1].length);
  harness.advance(7 * 24 * 60 * 60 * 1000 - 1);
  assert.equal((await harness.request('works.list', {}, login.token)).ok, true);
  harness.advance(1);
  assertError(await harness.request('works.list', {}, login.token), 'UNAUTHORIZED');
});

test('tokens issued in the future and tokens signed by a rotated secret fail', async () => {
  const harness = fixture();
  const login = await harness.login();
  harness.advance(-1);
  assertError(await harness.request('works.list', {}, login.token), 'UNAUTHORIZED');
  const rotated = fixture({ env: { ...env, SESSION_SECRET: `${env.SESSION_SECRET}-rotated` } });
  assertError(await rotated.request('works.list', {}, login.token), 'UNAUTHORIZED');
});

test('even correctly signed tokens must have valid version, audience, identity and bounded expiry claims', async () => {
  const harness = fixture();
  const login = await harness.login();
  const claims = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString('utf8'));
  for (const changes of [
    { v: 2 }, { aud: 'another-app' }, { sub: 'openid-alice' }, { iat: '1700000000000' },
    { iat: 1700000000001 }, { iat: -1 }, { exp: 1700000000000 },
    { exp: claims.exp + 1 }, { exp: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    const content = 'v1.' + Buffer.from(JSON.stringify({ ...claims, ...changes })).toString('base64url');
    const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(content).digest('base64url');
    assertError(await harness.request('works.list', {}, `${content}.${signature}`), 'UNAUTHORIZED');
  }
});

test('save returns the exact public work, preserves creation time and increments revision', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  const first = await harness.request('works.save', { work: work(), baseRevision: 0 }, token);
  assert.equal(first.ok, true);
  assert.deepEqual(first.data.work, {
    ...work(), createdAt: 1700000000000, updatedAt: 1700000000000, revision: 1, deleted: false
  });
  harness.advance(1000);
  const changed = work('cat-1', { completedRows: [0, 1], pattern: pattern({ name: '修改' }) });
  const second = await harness.request('works.save', { work: changed, baseRevision: 1 }, token);
  assert.deepEqual(second.data.work, {
    ...changed, createdAt: first.data.work.createdAt, updatedAt: 1700000001000, revision: 2, deleted: false
  });
  assert.doesNotMatch(JSON.stringify(second), /owner|clientId|_id|openid|session_key/);
});

test('all pattern dimensions, flat cell codes, sizes, titles and progress bounds are checked', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  const invalidPatterns = [
    pattern({ version: 2 }), pattern({ paletteId: 'other' }), pattern({ width: 0 }),
    pattern({ width: 65 }), pattern({ height: 65 }), pattern({ width: 1.5 }),
    pattern({ height: '2' }), pattern({ beadSize: 3 }), pattern({ beadSize: '5' }),
    pattern({ cells: ['H1'] }), pattern({ cells: [['H1'], null, 'B1', 'H1'] }),
    pattern({ cells: ['H999', null, 'B1', 'H1'] }), pattern({ cells: ['h1', null, 'B1', 'H1'] }),
    pattern({ cells: [{ code: 'H1' }, null, 'B1', 'H1'] }),
    pattern({ name: '' }), pattern({ name: ' ' }), pattern({ name: '字'.repeat(61) }),
    pattern({ name: 'a\nb' }), pattern({ originalImage: 'private' }), pattern({ owner: 'attacker' })
  ];
  for (const invalid of invalidPatterns) {
    assertError(await harness.request('works.save', { work: work('invalid', { pattern: invalid }), baseRevision: 0 }, token), 'INVALID_REQUEST');
  }
  for (const completedRows of [-1, 1, null, [2], [-1], [0.5], ['0'], [0, 0], [0, 1, 2]]) {
    assertError(await harness.request('works.save', { work: work('invalid', { completedRows }), baseRevision: 0 }, token), 'INVALID_REQUEST');
  }
  assert.equal(harness.repository.records.size, 0);
  for (const beadSize of [2.6, 5]) {
    const valid = work(`large-${beadSize}`, { pattern: pattern({ width: 64, height: 64, beadSize, cells: Array(4096).fill(null) }), completedRows: [0, 63] });
    assert.equal((await harness.request('works.save', { work: valid, baseRevision: 0 }, token)).ok, true);
  }
});

test('bundled allowlist matches all 221 root colors and excludes nonexistent codes', async () => {
  const root = path.join(__dirname, '..');
  const source = JSON.parse(fs.readFileSync(path.join(root, 'data/mard.json'), 'utf8')).colors.map(color => color.code);
  const bundled = require('../uniCloud-alipay/cloudfunctions/bead-island/lib/mard-codes.json');
  assert.deepEqual(bundled, source);
  const harness = fixture();
  const { token } = await harness.login();
  const allColors = pattern({ width: 13, height: 17, cells: source });
  assert.equal((await harness.request('works.save', { work: work('all-colors', { pattern: allColors }), baseRevision: 0 }, token)).ok, true);
});

test('request fields, IDs, revisions, login code and pagination parameters are strictly bounded', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  for (const code of ['', ' ', 123, 'a'.repeat(257), 'a\nb']) assertError(await harness.request('auth.login', { code }), 'INVALID_REQUEST');
  for (const request of [null, [], {}, { action: 'works.list' }, { action: 'works.list', payload: [] },
    { action: 'works.list', payload: {}, owner: 'bob' }, { action: '__proto__', payload: {} }]) {
    assertError(await harness.api(request, { authorization: `Bearer ${token}` }), 'INVALID_REQUEST');
  }
  for (const id of ['', '../bob', 'a'.repeat(129), { $ne: null }, '空格 id']) {
    assertError(await harness.request('works.save', { work: work(id), baseRevision: 0 }, token), 'INVALID_REQUEST');
  }
  for (const baseRevision of [-1, 0.5, '0', null, Number.MAX_SAFE_INTEGER]) {
    assertError(await harness.request('works.save', { work: work(), baseRevision }, token), 'INVALID_REQUEST');
    assertError(await harness.request('works.delete', { id: 'cat-1', baseRevision }, token), 'INVALID_REQUEST');
  }
  for (const payload of [{ limit: 0 }, { limit: 21 }, { limit: '2' }, { limit: 1.5 }, { cursor: 1 },
    { cursor: '../bob' }, { cursor: 'a'.repeat(129) }, { owner: 'bob' }]) {
    assertError(await harness.request('works.list', payload, token), 'INVALID_REQUEST');
  }
  for (const payload of [{ work: { ...work(), owner: 'bob' }, baseRevision: 0 },
    { work: work(), baseRevision: 0, owner: 'bob' }]) {
    assertError(await harness.request('works.save', payload, token), 'INVALID_REQUEST');
  }
});

test('same client ID remains isolated per owner for listing, mutation and deletion', async () => {
  const harness = fixture();
  const alice = await harness.login('alice');
  const bob = await harness.login('bob');
  await harness.request('works.save', { work: work(), baseRevision: 0 }, alice.token);
  assert.deepEqual((await harness.request('works.list', {}, bob.token)).data.items, []);
  assertError(await harness.request('works.save', { work: work(), baseRevision: 1 }, bob.token), 'CONFLICT');
  assertError(await harness.request('works.delete', { id: 'cat-1', baseRevision: 1 }, bob.token), 'CONFLICT');
  const bobWork = work('cat-1', { pattern: pattern({ name: '鲍勃' }) });
  assert.equal((await harness.request('works.save', { work: bobWork, baseRevision: 0 }, bob.token)).ok, true);
  await harness.request('works.delete', { id: 'cat-1', baseRevision: 1 }, bob.token);
  const aliceItems = (await harness.request('works.list', {}, alice.token)).data.items;
  assert.equal(aliceItems[0].pattern.name, '小猫');
  assert.equal(aliceItems[0].revision, 1);
  assert.equal(aliceItems[0].deleted, false);
});

test('simultaneous creates and updates have exactly one CAS winner, and conflicts preserve the winner', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  for (const baseRevision of [0, 1]) {
    const results = await Promise.all(Array.from({ length: 12 }, (unusedValue, index) => harness.request('works.save', {
      work: work('racing', { pattern: pattern({ name: `请求${index}` }) }), baseRevision
    }, token)));
    const successes = results.filter(result => result.ok);
    assert.equal(successes.length, 1);
    assert.equal(successes[0].data.work.revision, baseRevision + 1);
    for (const failed of results.filter(result => !result.ok)) {
      assertError(failed, 'CONFLICT');
      assert.deepEqual(failed.error.details.work, successes[0].data.work);
    }
    const items = (await harness.request('works.list', {}, token)).data.items;
    assert.deepEqual(items, [successes[0].data.work]);
  }
});

test('delete returns a durable tombstone, retries are idempotent, stale saves cannot resurrect it', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  await harness.request('works.save', { work: work(), baseRevision: 0 }, token);
  const deleted = await harness.request('works.delete', { id: 'cat-1', baseRevision: 1 }, token);
  assert.equal(deleted.data.work.deleted, true);
  assert.equal(deleted.data.work.revision, 2);
  for (const baseRevision of [1, 2]) {
    harness.advance(500);
    assert.deepEqual((await harness.request('works.delete', { id: 'cat-1', baseRevision }, token)).data.work, deleted.data.work);
  }
  assertError(await harness.request('works.delete', { id: 'cat-1', baseRevision: 0 }, token), 'CONFLICT');
  assertError(await harness.request('works.save', { work: work(), baseRevision: 1 }, token), 'CONFLICT');
  assert.deepEqual((await harness.request('works.list', {}, token)).data.items, [deleted.data.work]);
  const restored = await harness.request('works.save', { work: work(), baseRevision: 2 }, token);
  assert.equal(restored.data.work.revision, 3);
  assert.equal(restored.data.work.deleted, false);
});

test('delete of an unsynced ID creates a tombstone and concurrent identical deletes succeed once', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  const results = await Promise.all(Array.from({ length: 8 }, () => harness.request('works.delete', { id: 'unsynced', baseRevision: 0 }, token)));
  for (const result of results) {
    assert.equal(result.ok, true);
    assert.equal(result.data.work.deleted, true);
    assert.equal(result.data.work.revision, 1);
    assert.deepEqual(result.data.work, results[0].data.work);
  }
  assertError(await harness.request('works.save', { work: work('unsynced'), baseRevision: 0 }, token), 'CONFLICT');
});

test('a simultaneous save and delete cannot both consume the same revision', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  await harness.request('works.save', { work: work(), baseRevision: 0 }, token);
  const results = await Promise.all([
    harness.request('works.save', { work: work('cat-1', { completedRows: [1] }), baseRevision: 1 }, token),
    harness.request('works.delete', { id: 'cat-1', baseRevision: 1 }, token)
  ]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assertError(results.find(result => !result.ok), 'CONFLICT');
  assert.equal((await harness.request('works.list', {}, token)).data.items[0].revision, 2);
});

test('stable-ID pagination includes tombstones, caps pages at 20 and does not depend on timestamps', async () => {
  const harness = fixture();
  const { token } = await harness.login();
  for (let index = 24; index >= 0; index -= 1) {
    await harness.request('works.save', { work: work(`work-${String(index).padStart(2, '0')}`), baseRevision: 0 }, token);
  }
  const first = (await harness.request('works.list', {}, token)).data;
  assert.equal(first.items.length, 20);
  assert.equal(first.cursor, 'work-19');
  harness.advance(10000);
  await harness.request('works.delete', { id: 'work-22', baseRevision: 1 }, token);
  await harness.request('works.save', { work: work('work-01'), baseRevision: 1 }, token);
  const second = (await harness.request('works.list', { cursor: first.cursor, limit: 20 }, token)).data;
  assert.equal(second.items.length, 5);
  assert.equal(second.cursor, null);
  assert.equal(second.items.find(item => item.id === 'work-22').deleted, true);
  assert.deepEqual([...first.items, ...second.items].map(item => item.id), Array.from({ length: 25 }, (unusedValue, index) => `work-${String(index).padStart(2, '0')}`));
  assert.deepEqual((await harness.request('works.list', { cursor: 'zz-last', limit: 1 }, token)).data, { items: [], cursor: null });
  assert.equal((await harness.request('works.list', { cursor: null, limit: 1 }, token)).data.items.length, 1);
});

test('repository errors and hidden document properties do not leak into API replies', async () => {
  const harness = fixture();
  const login = await harness.login();
  await harness.request('works.save', { work: work(), baseRevision: 0 }, login.token);
  const record = [...harness.repository.records.values()][0];
  Object.assign(record, { _id: 'hidden-db-id', session_key: 'private-key', originalImage: 'private-photo' });
  const result = await harness.request('works.list', {}, login.token);
  assert.doesNotMatch(JSON.stringify(result), /hidden-db-id|private-key|private-photo|owner|clientId/);
  harness.repository.list = async () => { throw new Error(`database password ${env.SESSION_SECRET}`); };
  const failure = await harness.request('works.list', {}, login.token);
  assertError(failure, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(failure), /password|test-only|stack/);
});

test('a misbehaving repository cannot expose another owner through listing or conflict details', async () => {
  const harness = fixture();
  const alice = await harness.login('alice');
  const bob = await harness.login('bob');
  await harness.request('works.save', { work: work(), baseRevision: 0 }, bob.token);
  const otherUser = [...harness.repository.records.values()][0];
  harness.repository.list = async () => [otherUser];
  const listed = await harness.request('works.list', {}, alice.token);
  assertError(listed, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(listed), /小猫|openid|pattern|clientId/);
  harness.repository.get = async () => otherUser;
  const changed = await harness.request('works.save', { work: work(), baseRevision: 1 }, alice.token);
  assertError(changed, 'INTERNAL_ERROR');
  assert.equal(changed.error.details, undefined);
});
