const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../src/lib/storage.js');
const { createCloudClient } = require('../src/lib/cloud.js');
const pattern = { version: 1, paletteId: 'mard-221', name: '测试', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] };
function fixture(handler) {
  const stored = {};
  const platform = { getStorageSync: key => stored[key], setStorageSync: (key, value) => { stored[key] = structuredClone(value); }, login: options => options.success({ code: 'wx-code' }) };
  const repository = createRepository(platform);
  const client = createCloudClient({ platform, enabled: true, invoke: async data => ({ result: await handler(data) }) });
  return { client, repository, stored };
}
const success = data => ({ ok: true, data });
const session = { token: 'signed', expiresAt: Date.now() + 3600000, userId: 'user-1' };
test('uses wx login code, uploads compact pattern, then acknowledges and lists remote', async () => {
  const calls = [];
  const { client, repository } = fixture(data => {
    calls.push(data);
    if (data.action === 'auth.login') return success(session);
    if (data.action === 'works.save') return success({ work: { ...data.payload.work, revision: 1, updatedAt: 100, deleted: false } });
    return success({ items: [], cursor: null });
  });
  const local = repository.save({ pattern, completedRows: [] });
  const result = await client.syncWorks(repository);
  assert.equal(result.count, 1);
  assert.equal(repository.find(local.id).dirty, false);
  assert.deepEqual(calls[0].payload, { code: 'wx-code' });
  assert.equal(calls[1].token, 'signed');
  assert.deepEqual(Object.keys(calls[1].payload.work).sort(), ['completedRows', 'id', 'pattern']);
});
test('failed upload keeps local work dirty and stops remote merge', async () => {
  const { client, repository } = fixture(data => data.action === 'auth.login' ? success(session) : Promise.reject(new Error('offline')));
  const local = repository.save({ pattern, completedRows: [] });
  await assert.rejects(client.syncWorks(repository), /offline/);
  assert.equal(repository.find(local.id).dirty, true);
});
test('conflict preserves a local copy and uses cloud revision on original', async () => {
  let remote;
  const { client, repository } = fixture(data => {
    if (data.action === 'auth.login') return success(session);
    if (data.action === 'works.save') return { ok: false, error: { code: 'CONFLICT', message: '冲突', details: { work: remote } } };
    return success({ items: [remote], cursor: null });
  });
  const local = repository.save({ pattern, completedRows: [] });
  remote = { ...local, pattern: { ...pattern, name: '云端版本' }, revision: 2, dirty: undefined, updatedAt: 200 };
  const result = await client.syncWorks(repository);
  assert.equal(result.conflicts, 1);
  assert.equal(repository.list().length, 2);
  assert.equal(repository.find(local.id).revision, 2);
  assert.ok(repository.list().some(work => work.id !== local.id && work.dirty && work.pattern.name.includes('本机副本')));
});
test('malformed server responses fail instead of silently marking works synchronized', async () => {
  const { client, repository } = fixture(() => ({ ok: true }));
  repository.save({ pattern, completedRows: [] });
  await assert.rejects(client.syncWorks(repository), /响应/);
  assert.equal(repository.list()[0].dirty, true);
});
test('concurrent sync calls share one operation and do not duplicate writes', async () => {
  let uploads = 0;
  const { client, repository } = fixture(async data => {
    if (data.action === 'auth.login') return success(session);
    if (data.action === 'works.save') { uploads++; await new Promise(resolve => setTimeout(resolve, 5)); return success({ work: { ...data.payload.work, revision: 1, updatedAt: 200 } }); }
    return success({ items: [], cursor: null });
  });
  repository.save({ pattern, completedRows: [] });
  await Promise.all([client.syncWorks(repository), client.syncWorks(repository)]);
  assert.equal(uploads, 1);
});
