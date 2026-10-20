const test = require('node:test');
const assert = require('node:assert/strict');
const { editorFixture } = require('./client-editor-helper.cjs');
const pattern = { version: 1, paletteId: 'mard-221', name: 'A', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] };
function work(name, completedRows = []) { return { id: name, pattern: { ...pattern, name }, completedRows, size: 24 }; }
test('a delayed conversion cannot replace another work after switching draft', async () => {
  const { page, app } = editorFixture(work('A'));
  let resolvePixels;
  page.sourcePixels = () => new Promise(resolve => { resolvePixels = resolve; });
  const converting = page.regenerate();
  app.globalData.draft = work('B', [0]);
  page.loadDraft();
  resolvePixels({ width: 1, height: 1, data: [0, 0, 0, 255] });
  await converting;
  assert.equal(page.pattern.name, 'B');
  assert.deepEqual(Array.from(page.pattern.cells), ['H1']);
  assert.deepEqual(Array.from(page.draft.completedRows), [0]);
  assert.equal(page.busy, false);
});
test('hiding editor invalidates in-flight conversion without blocking later edits', async () => {
  const { page, definition } = editorFixture(work('A'));
  let resolvePixels;
  page.sourcePixels = () => new Promise(resolve => { resolvePixels = resolve; });
  const converting = page.regenerate();
  definition.onHide.call(page);
  resolvePixels({ width: 1, height: 1, data: [0, 0, 0, 255] });
  await converting;
  assert.deepEqual(Array.from(page.pattern.cells), ['H1']);
  assert.equal(page.busy, false);
});
test('undo restores both color and completed rows; repainting same color changes nothing', () => {
  const { page } = editorFixture(work('A', [0]));
  page.editing = true;
  page.editColor = { code: 'H1' };
  page.paint({ index: 0, row: 0 });
  assert.deepEqual(Array.from(page.draft.completedRows), [0]);
  assert.equal(page.undo.length, 0);
  page.editColor = { code: 'H2' };
  page.paint({ index: 0, row: 0 });
  assert.deepEqual(Array.from(page.draft.completedRows), []);
  page.undoPaint();
  assert.deepEqual(Array.from(page.draft.completedRows), [0]);
  assert.deepEqual(Array.from(page.pattern.cells), ['H1']);
});
