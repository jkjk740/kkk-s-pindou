const test = require('node:test');
const assert = require('node:assert/strict');
const { applyRowProgress } = require('../src/lib/progress.js');
const work = { id: 'work-one', pattern: { height: 4 }, completedRows: [0, 2] };
test('toggles selected row without mutating work and finds next unfinished row', () => {
  assert.deepEqual(applyRowProgress(work, 1), { completedRows: [0, 1, 2], nextRow: 3 });
  assert.deepEqual(applyRowProgress(work, 2), { completedRows: [0], nextRow: 1 });
  assert.deepEqual(work.completedRows, [0, 2]);
});
test('all finished is explicit and invalid rows are refused', () => {
  assert.equal(applyRowProgress({ ...work, completedRows: [0, 1, 2] }, 3).nextRow, null);
  assert.throws(() => applyRowProgress(work, 4));
  assert.throws(() => applyRowProgress(work, -1));
});
