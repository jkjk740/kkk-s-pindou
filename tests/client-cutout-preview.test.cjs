const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createPreviewQueue } = require('../src/lib/cutout-preview.js');
const { createMaskEditor } = require('../src/lib/cutout-mask.js');
const geometryLibrary = require('../src/lib/cutout-geometry.js');

const tick = () => new Promise(resolve => setImmediate(resolve));

test('preview retains the displayed frame until the next image has loaded', async () => {
  const states = []; const released = []; let sequence = 0;
  const preview = createPreviewQueue({ render: async () => `frame-${++sequence}`, publish: state => states.push(state), release: path => released.push(path) });
  preview.request(); await tick();
  assert.deepEqual(states.at(-1), { active: '', pending: 'frame-1' });
  preview.request(); preview.request(); await tick();
  assert.equal(sequence, 1);
  await preview.loaded('frame-1'); await tick();
  assert.deepEqual(states.at(-1), { active: 'frame-1', pending: 'frame-2' });
  assert.deepEqual(released, []);
  await preview.loaded('frame-2');
  assert.deepEqual(states.at(-1), { active: 'frame-2', pending: '' });
  assert.deepEqual(released, ['frame-1']);
  await preview.dispose();
  assert.deepEqual(released, ['frame-1', 'frame-2']);
});

test('late render and image-load callbacks cannot republish a disposed workspace', async () => {
  const states = []; const released = []; let finish;
  const preview = createPreviewQueue({ render: () => new Promise(resolve => { finish = resolve; }), publish: state => states.push(state), release: path => released.push(path) });
  preview.request();
  await preview.dispose(); finish('late-frame'); await tick();
  await preview.loaded('late-frame');
  assert.deepEqual(states, []);
  assert.deepEqual(released, ['late-frame']);
});

test('a failed frame stops the queue and reports an actionable error', async () => {
  const errors = [];
  const preview = createPreviewQueue({ render: async () => { throw new Error('disk unavailable'); }, publish() {}, release() {}, onError: error => errors.push(error.message) });
  preview.request(); await tick();
  assert.deepEqual(errors, ['disk unavailable']);
  await preview.dispose();
});

test('cutout presents ordinary image layers inside the same view that handles gestures', () => {
  const source = fs.readFileSync(new URL('../src/components/cutout-workspace.vue', 'file://' + __filename), 'utf8');
  assert.doesNotMatch(source, /<canvas\b/);
  assert.match(source, /<view class="workspace"[^>]*@touchstart\.stop\.prevent=/);
  assert.match(source, /<image\b[^>]*v-for="path in previewFrames"/);
  assert.match(source, /createPreviewQueue/);
});

test('image gestures subtract the shared view origin before editing the original mask', () => {
  const source = fs.readFileSync(require.resolve('../src/components/cutout-workspace.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import[^\n]+\n/gm, '').replace('export default', 'module.exports =');
  const context = { module: { exports: {} }, ...geometryLibrary };
  vm.runInNewContext(source, context);
  const rectangle = { left: 15, top: 102, width: 345, height: 455 };
  const editor = createMaskEditor({ width: 400, height: 400 });
  const workspace = Object.assign(context.module.exports.data(), context.module.exports.methods, {
    rect: rectangle, geometry: geometryLibrary.fitImage({ width: 400, height: 400 }, rectangle),
    pose: { scale: 1, x: 0, y: 0 }, ready: true, previewState: { active: 'shown', pending: '' },
    tool: 'erase', brushSize: 24, editor, draw() {}, scheduleDraw() {}, $emit() {}
  });
  const event = { touches: [{ clientX: rectangle.left + rectangle.width / 2, clientY: rectangle.top + rectangle.height / 2 }] };
  workspace.start(event); workspace.end({ touches: [] });
  assert.equal(editor.values()[200 * 400 + 200], 0);
  assert.equal(editor.values()[50 * 400 + 200], 255);
  workspace.undo();
  assert.equal(editor.values()[200 * 400 + 200], 255);
  workspace.tool = 'lasso';
  const touch = (x, y) => ({ touches: [{ clientX: rectangle.left + x, clientY: rectangle.top + y }] });
  workspace.start(touch(100, 150)); workspace.move(touch(245, 150)); workspace.move(touch(245, 300)); workspace.move(touch(100, 300)); workspace.end({ touches: [] });
  assert.equal(editor.values()[200 * 400 + 200], 255);
  assert.equal(editor.values()[0], 0);
});
