const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkStore } = require('../src/lib/work-store.js');
test('legacy records survive index write failure and migrate without deleting the legacy key', () => {
  const records = [{ id: 'old', pattern: { cells: ['M1'] } }];
  const memory = new Map([['bead-island-works-v1', records]]);
  let rejectIndex = true;
  const platform = { getStorageSync: key => memory.get(key), setStorageSync(key, value) { if (key === 'bead-island-works-index-v2' && rejectIndex) throw new Error('full'); memory.set(key, value); }, removeStorageSync: key => memory.delete(key) };
  const store = createWorkStore(platform);
  assert.throws(() => store.writeAll([{ ...records[0], cutoutId: 'cutout' }]));
  assert.deepEqual(store.readAll(), records);
  rejectIndex = false;
  store.writeAll([{ ...records[0], cutoutId: 'cutout' }]);
  assert.equal(createWorkStore(platform).readAll()[0].cutoutId, 'cutout');
  assert.deepEqual(memory.get('bead-island-works-v1'), records);
});
