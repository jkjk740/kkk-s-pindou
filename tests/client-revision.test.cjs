const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../src/lib/storage.js');
test('saving an open stale page never rolls back confirmed cloud revision', () => {
  let stored;
  const repository = createRepository({ getStorageSync: () => stored, setStorageSync: (_, value) => { stored = value; } });
  const draft = repository.save({ pattern: { height: 2, cells: ['H1'] }, completedRows: [] });
  repository.acknowledge(draft, { ...draft, revision: 3, updatedAt: 100 });
  const edited = repository.save({ ...draft, completedRows: [0] });
  assert.equal(edited.revision, 3);
  assert.equal(edited.dirty, true);
});
test('stale draft after a different remote update saves a local copy instead of borrowing remote revision', () => {
  let stored;
  const repository = createRepository({ getStorageSync: () => stored, setStorageSync: (_, value) => { stored = value; } });
  const local = repository.save({ pattern: { name: '旧图', height: 1, cells: ['H1'] }, completedRows: [] });
  repository.acknowledge(local, { ...local, revision: 1 });
  const draft = repository.find(local.id);
  repository.mergeRemote([{ ...draft, pattern: { ...draft.pattern, cells: ['H2'] }, revision: 2, dirty: false }]);
  const saved = repository.save(draft);
  assert.notEqual(saved.id, local.id);
  assert.equal(saved.revision, 0);
  assert.equal(saved.dirty, true);
  assert.deepEqual(repository.find(local.id).pattern.cells, ['H2']);
  assert.deepEqual(saved.pattern.cells, ['H1']);
  assert.match(saved.pattern.name, /本机副本/);
});
