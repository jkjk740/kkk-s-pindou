const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const paletteData = require('../src/data/mard.json');
const patternLibrary = require('../src/lib/pattern.js');

function component(file, dependencies) {
  const source = fs.readFileSync(require.resolve(file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export default', 'module.exports =');
  const context = { module: { exports: {} }, paletteData, releaseCanvasFile() {}, ...dependencies };
  vm.runInNewContext(source, context);
  return context.module.exports;
}

function editor(draft, dependencies = {}) {
  const app = { globalData: { draft }, $vm: { getDraft: () => app.globalData.draft, setDraft(value) { app.globalData.draft = value; return value; } } };
  const definition = component('../src/pages/editor/index.vue', {
    ...patternLibrary, getApp: () => app,
    ...require('../src/lib/conversion-limits.js'),
    navigationMetrics: () => ({ statusHeight: 20, navHeight: 44 }),
    windowInfo: () => ({ windowHeight: 667, windowWidth: 375 }),
    createImageDraft: require('../src/lib/draft.js').createImageDraft,
    isCurrentPage: () => true, toast() {}, showError() {}, dismiss() {}, ...dependencies
  });
  const page = Object.assign(definition.data(), definition.methods);
  for (const [name, getter] of Object.entries(definition.computed)) Object.defineProperty(page, name, { get: () => getter.call(page) });
  return { page, app, definition };
}

test('new app startup and getDraft do not manufacture a default example', () => {
  let examples = 0;
  const definition = component('../src/App.vue', {
    examples: [], createRepository: () => ({}), createAutoSave: () => ({ schedule() {} }),
    syncWorks() {}, getSession() {}, communityDownloads: { retryPending() {} },
    uni: { $on() {}, onNetworkStatusChange() {} }
  });
  const app = { ...definition.methods, globalData: { draft: null }, useExample() { examples++; } };
  definition.onLaunch.call(app);
  assert.equal(app.getDraft(), null);
  assert.equal(examples, 0);
});

test('empty editor draft displays no pattern or export actions', () => {
  const { page } = editor(null);
  page.loadDraft();
  assert.equal(page.pattern, null);
  assert.equal(page.draft, null);
  assert.equal(page.total, 0);
  assert.equal(page.exportOpen, false);
});

test('uploaded photo draft has no placeholder cat and preserves source metadata', () => {
  const { createImageDraft } = require('../src/lib/draft.js');
  const draft = createImageDraft({ path: 'wxfile://photo.jpg', sourceImageId: 'image-id', name: '旅行照片' });
  assert.equal(draft.pattern, null);
  assert.equal(draft.sourcePath, 'wxfile://photo.jpg');
  assert.equal(draft.sourceImageId, 'image-id');
  assert.equal(draft.name, '旅行照片');
  assert.equal(draft.exampleKind, undefined);
  assert.equal(draft.converted, false);
  assert.equal(draft.size, 64);
  assert.equal(draft.maxColors, 32);
  assert.equal(draft.cutoutId, null);
});

test('editor export tap invokes the opener rather than a reserved export expression', () => {
  const template = fs.readFileSync(require.resolve('../src/pages/editor/index.vue'), 'utf8').split('<script>')[0];
  assert.match(template, /@tap="openExport"/);
  assert.match(template, /@export="openExport"/);
  assert.doesNotMatch(template, /@(?:tap|export)="export"/);
  const pattern = { version: 1, paletteId: 'mard-221', name: 'A', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] };
  const { page } = editor({ pattern, completedRows: [] });
  page.loadDraft();
  page.prepareExportPreview = () => {};
  page.materialsOpen = true;
  page.openExport();
  assert.equal(page.exportOpen, true);
  assert.equal(page.materialsOpen, false);
});

test('each export sheet opening defaults to front and only emits explicit selected direction', () => {
  const definition = component('../src/components/export-sheet.vue');
  const events = [];
  const sheet = Object.assign(definition.data(), definition.methods, { busy: false, pattern: { cells: ['H1'] }, $emit: (...values) => events.push(values) });
  sheet.select(true);
  sheet.save();
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), ['save', { mirror: true, format: 'full' }]);
  definition.watch.show.call(sheet, true);
  sheet.save();
  assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))), ['save', { mirror: false, format: 'full' }]);
  sheet.busy = true;
  const previous = events.length;
  sheet.select(true);
  sheet.save();
  assert.equal(events.length, previous);
});

test('cancelled image selection preserves the existing work and clears uploading state', async () => {
  const draft = { pattern: { version: 1, paletteId: 'mard-221', name: '已有图纸', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] }, completedRows: [] };
  const { page, app } = editor(draft, { selectPersonalImage: async () => { throw new Error('取消选图'); } });
  page.loadDraft();
  await page.upload();
  assert.equal(app.globalData.draft, draft);
  assert.equal(page.pattern.name, '已有图纸');
  assert.equal(page.uploading, false);
});

test('failed photo conversion restores the previous work without seeding an example', async () => {
  const draft = { pattern: { version: 1, paletteId: 'mard-221', name: '已有图纸', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] }, completedRows: [] };
  const { page, app } = editor(draft, { selectPersonalImage: async () => ({ path: 'wxfile://invalid.jpg', sourceImageId: 'new-id' }) });
  page.loadDraft();
  page.sourcePixels = async () => { throw new Error('解码失败'); };
  await page.upload();
  assert.equal(app.globalData.draft, draft);
  assert.equal(page.pattern.name, '已有图纸');
  assert.equal(page.busy, false);
  assert.equal(page.uploading, false);
});

test('closing export ignores a late preview and allows a later opening', async () => {
  const pattern = { version: 1, paletteId: 'mard-221', name: 'A', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] };
  let finishPreview;
  const { page } = editor({ pattern, completedRows: [] }, { renderPatternPreview: () => new Promise(resolve => { finishPreview = resolve; }) });
  page.loadDraft();
  page.nativeExportCanvas = async () => ({});
  page.exportOpen = true;
  const preview = page.prepareExportPreview();
  await Promise.resolve();
  page.closeExport();
  finishPreview('wxfile://old-preview.png');
  await preview;
  assert.equal(page.exportPreviewPath, '');
  assert.equal(page.exportPreviewLoading, false);
  assert.equal(page.exportOpen, false);
});

test('switching tabs during photo conversion never commits the incomplete candidate', async () => {
  const draft = { pattern: { version: 1, paletteId: 'mard-221', name: '未保存图纸', width: 1, height: 1, beadSize: 2.6, cells: ['H1'] }, completedRows: [] };
  let current = true;
  let finishPixels;
  const { page, app, definition } = editor(draft, {
    isCurrentPage: () => current,
    selectPersonalImage: async () => ({ path: 'wxfile://photo.jpg', sourceImageId: 'image-id' })
  });
  page.loadDraft();
  page.sourcePixels = () => new Promise(resolve => { finishPixels = resolve; });
  const uploading = page.upload();
  await Promise.resolve();
  current = false;
  definition.onHide.call(page);
  finishPixels({ width: 1, height: 1, data: [0, 0, 0, 255] });
  await uploading;
  assert.equal(app.globalData.draft, draft);
  assert.equal(app.globalData.draft.pattern.name, '未保存图纸');
});

test('reopening community export clears the previous file and direction result', () => {
  const definition = component('../src/pages/community/detail.vue');
  const detail = Object.assign(definition.data(), definition.methods, { item: { pattern: {} }, retryPath: 'wxfile://mirrored.png', exportError: '保存失败', albumDenied: true, intent: { id: 'old' } });
  detail.openExport();
  assert.equal(detail.exportOpen, true);
  assert.equal(detail.retryPath, '');
  assert.equal(detail.exportError, '');
  assert.equal(detail.albumDenied, false);
  assert.equal(detail.intent, null);
});
