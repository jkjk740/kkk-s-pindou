const test = require('node:test');
const assert = require('node:assert/strict');
const { listInput, cursorFor } = require('../backend/src/community-validation.cjs');
const { createCommunityRepository } = require('../backend/src/community-repository.cjs');

test('community pages default to ten and reject oversized limits', () => {
  assert.equal(listInput({}).limit, 10);
  assert.equal(listInput({ limit: '10' }).limit, 10);
  for (const limit of ['11', '20', '0', '100']) assert.throws(() => listInput({ limit }));
});

test('the repository returns ten rows with a cursor only when more rows exist', async () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({ id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'), published_at: 1000 - index, download_count: 0 }));
  const requests = [];
  const pool = { async query(sql, values) { requests.push({ sql, values }); return [rows]; } };
  const result = await createCommunityRepository(pool).list(listInput({}));
  assert.equal(result.rows.length, 10);
  assert.equal(requests[0].values.at(-1), 11);
  assert.match(requests[0].sql, /p.download_count DESC, p.published_at DESC, p.id DESC/);
  assert.equal(listInput({ cursor: result.cursor }).after.id, rows[9].id);
  rows.pop();
  assert.equal((await createCommunityRepository(pool).list(listInput({}))).cursor, null);
});

test('cursor scopes isolate search and sort changes', () => {
  const input = listInput({ query: '小猫', sort: 'latest' });
  const cursor = cursorFor({ id: '00000000-0000-4000-8000-000000000001', published_at: 1000, download_count: 0 }, input);
  assert.equal(listInput({ query: '小猫', sort: 'latest', cursor }).limit, 10);
  assert.throws(() => listInput({ query: '小兔', sort: 'latest', cursor }));
  assert.throws(() => listInput({ query: '小猫', sort: 'hot', cursor }));
});
