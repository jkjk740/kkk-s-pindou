const test = require('node:test');
const assert = require('node:assert/strict');
const { createRepository } = require('../src/lib/storage.js');
test('saved works do not depend on temporary source image files after restart', () => {
  const stored = new Map();
  const repository = createRepository({ getStorageSync: key => stored.get(key), setStorageSync: (key, value) => { stored.set(key, value); } });
  const saved = repository.save({ sourcePath: 'wxfile://tmp/photo.png', exampleKind: 'cat', pattern: { name: '修色的小猫', height: 1, cells: ['H1'] }, completedRows: [] });
  assert.equal(repository.find(saved.id).sourcePath, undefined);
  assert.equal(repository.find(saved.id).exampleKind, undefined);
  assert.deepEqual(repository.find(saved.id).pattern.cells, ['H1']);
});
