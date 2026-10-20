const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const patternLibrary = require('../src/lib/pattern.js');
const paletteData = require('../src/data/mard.json');
function fixture() {
  const previous = { id: 'saved', sourceImageId: 'original', cutoutId: null, size: 32, maxColors: 12, completedRows: [0], pattern: { version: 1, paletteId: 'mard-221', name: '旧作品', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] } };
  const app = { globalData: { draft: previous }, $vm: { getDraft: () => app.globalData.draft } };
  const source = fs.readFileSync(require.resolve('../src/pages/editor/index.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace('export default', 'module.exports =');
  let current = true;
  const context = { module: { exports: {} }, paletteData, ...patternLibrary, ...require('../src/lib/conversion-limits.js'), getApp: () => app, markRaw: value => value, navigationMetrics: () => ({ statusHeight: 20, navHeight: 44 }), windowInfo: () => ({ windowWidth: 375, windowHeight: 667 }), isCurrentPage: () => current, showError() {} };
  vm.runInNewContext(source, context);
  const definition = context.module.exports; const page = Object.assign(definition.data(), definition.methods); page.loadDraft();
  return { page, app, previous, hide() { current = false; page.requestVersion++; } };
}
test('failed candidate conversion preserves exact old pattern, cutout and progress', async () => {
  const { page, app, previous } = fixture();
  page.sourcePixels = async () => { throw new Error('offline'); };
  assert.equal(await page.commitSource({ ...previous, cutoutId: 'new' }), false);
  assert.equal(app.globalData.draft, previous); assert.deepEqual(previous.completedRows, [0]); assert.equal(previous.cutoutId, null);
});
test('late candidate after hiding cannot commit and successful candidate resets progress', async () => {
  const first = fixture(); let release;
  first.page.sourcePixels = () => new Promise(resolve => { release = resolve; });
  const pending = first.page.commitSource({ ...first.previous, cutoutId: 'late' }); first.hide(); release({ width: 1, height: 1, data: [255, 255, 255, 255] });
  assert.equal(await pending, false); assert.equal(first.app.globalData.draft, first.previous);
  const second = fixture(); second.page.sourcePixels = async () => ({ width: 1, height: 1, data: [255, 255, 255, 255] });
  assert.equal(await second.page.commitSource({ ...second.previous, cutoutId: 'confirmed' }), true);
  assert.equal(second.app.globalData.draft.cutoutId, 'confirmed'); assert.equal(second.app.globalData.draft.completedRows.length, 0);
});
