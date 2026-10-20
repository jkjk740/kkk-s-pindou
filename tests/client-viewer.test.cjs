const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const viewport = require('../src/lib/viewport.js');
const { drawViewport } = require('../src/lib/viewport-renderer.js');

function viewerFixture(pose = { x: 0, y: 0, scale: 1 }) {
  const source = fs.readFileSync(require.resolve('../src/components/pattern-viewer.vue'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*;\s*$/gm, '')
    .replace('export default', 'module.exports =');
  const paints = [], updates = [];
  const canvasContext = {
    setTransform(...values) { paints.push({ transform: values }); },
    scale(...values) { paints.push({ scale: values }); },
    translate(...values) { paints.push({ origin: values }); },
    clearRect() {}, fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillText() {}
  };
  const context = { module: { exports: {} }, ...viewport, drawViewport, drawPattern() {}, windowInfo: () => ({ windowWidth: 375 }), markRaw: value => value };
  vm.runInNewContext(source, context);
  const definition = context.module.exports;
  const viewer = { pose, active: true, inspectable: true, selectingRows: false, completedRows: [], pattern: { width: 32, height: 32, cells: Array(1024).fill('M1') }, heightLimit: 320, $emit: (name, value) => updates.push({ name, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) }) };
  Object.assign(viewer, definition.data.call(viewer), definition.methods);
  for (const [name, getter] of Object.entries(definition.computed)) Object.defineProperty(viewer, name, { get: () => getter.call(viewer) });
  viewer.context = canvasContext;
  viewer.pixelRatio = 2;
  viewer.requestPaint = () => viewer.paint();
  return { viewer, updates, paints, definition };
}

test('zoom buttons change the canvas drawing transform, not just the percentage', () => {
  const { viewer, updates, paints } = viewerFixture();
  viewer.zoom(0.5);
  assert.equal(viewer.currentPose.scale, 1.5);
  assert.deepEqual(paints.find(value => value.scale).scale, [1.5, 1.5]);
  assert.deepEqual(updates[0].value, { x: 0, y: 0, scale: 1.5 });
});

test('reset fits and centers the actual drawing without accumulating transforms', () => {
  const { viewer, paints } = viewerFixture({ x: 30, y: 20, scale: 6 });
  viewer.reset();
  assert.deepEqual(JSON.parse(JSON.stringify(viewer.currentPose)), { x: 0, y: 0, scale: 1 });
  assert.deepEqual(paints.find(value => value.transform).transform, [2, 0, 0, 2, 0, 0]);
  assert.deepEqual(paints.find(value => value.origin).origin, [24, 37.5]);
  assert.deepEqual(paints.find(value => value.scale).scale, [1, 1]);
});

test('a pinch redraws around its initial midpoint without parent feedback loops', () => {
  const { viewer, updates, paints, definition } = viewerFixture();
  viewer.touchStart({ touches: [{ x: 100, y: 150 }, { x: 200, y: 150 }] });
  viewer.touchMove({ touches: [{ x: 50, y: 150 }, { x: 250, y: 150 }] });
  assert.equal(viewer.currentPose.scale, 2);
  assert.deepEqual(paints.find(value => value.scale).scale, [2, 2]);
  const count = paints.length;
  definition.watch.pose.handler.call(viewer, updates[0].value);
  assert.equal(paints.length, count);
  viewer.touchEnd({ touches: [], changedTouches: [{ x: 250, y: 150 }] });
  assert.equal(updates.filter(value => value.name === 'inspect').length, 0);
});

test('single-finger panning updates canvas origin and clamps its bounds', () => {
  const { viewer } = viewerFixture({ x: 0, y: 0, scale: 2 });
  viewer.touchStart({ touches: [{ x: 100, y: 100 }] });
  viewer.touchMove({ touches: [{ x: 120, y: 130 }] });
  assert.deepEqual(JSON.parse(JSON.stringify(viewer.currentPose)), { x: 20, y: 30, scale: 2 });
  viewer.touchMove({ touches: [{ x: 1000, y: 1000 }] });
  assert.equal(viewer.currentPose.x, 122.5);
  assert.equal(viewer.currentPose.y, 109);
});

test('pinch scaling and midpoint movement are combined before clamping', () => {
  const { viewer } = viewerFixture({ x: 122.5, y: 0, scale: 2 });
  viewer.touchStart({ touches: [{ x: 96.5, y: 160 }, { x: 196.5, y: 160 }] });
  viewer.touchMove({ touches: [{ x: 59, y: 160 }, { x: 134, y: 160 }] });
  assert.equal(viewer.currentPose.scale, 1.5);
  assert.equal(viewer.currentPose.x, 41.875);
});

test('inactive viewers cannot alter the shared detail pose', () => {
  const { viewer, updates, paints } = viewerFixture();
  viewer.active = false;
  viewer.zoom(0.5);
  viewer.reset();
  viewer.touchStart({ touches: [{ x: 100, y: 100 }] });
  viewer.touchMove({ touches: [{ x: 120, y: 130 }] });
  assert.equal(updates.length, 0);
  assert.equal(paints.length, 0);
});

test('an external pose redraws once without re-emitting it', () => {
  const { viewer, updates, paints, definition } = viewerFixture();
  definition.watch.pose.handler.call(viewer, { x: 10, y: 20, scale: 3 });
  assert.equal(viewer.currentPose.scale, 3);
  assert.deepEqual(paints.find(value => value.scale).scale, [3, 3]);
  assert.equal(updates.length, 0);
});

test('row selection reverses the same zoom and pan transform used for drawing', () => {
  const { viewer, updates } = viewerFixture({ x: 20, y: 30, scale: 2 });
  viewer.selectingRows = true;
  const origin = viewport.boardOrigin(viewer.currentPose, viewer.board);
  const point = { x: origin.x + 12.5 * viewer.board.cellSize * 2, y: origin.y + 10.5 * viewer.board.cellSize * 2 };
  viewer.touchStart({ touches: [point] });
  viewer.touchEnd({ touches: [], changedTouches: [point] });
  assert.deepEqual(updates[0], { name: 'select-row', value: { row: 10, column: 12, index: 332 } });
});

test('changing from pinch to one finger continues smoothly and never opens details', () => {
  const { viewer, updates } = viewerFixture();
  viewer.touchStart({ touches: [{ x: 100, y: 150 }, { x: 200, y: 150 }] });
  viewer.touchMove({ touches: [{ x: 50, y: 150 }, { x: 250, y: 150 }] });
  viewer.touchEnd({ touches: [{ x: 250, y: 150 }], changedTouches: [{ x: 50, y: 150 }] });
  viewer.touchMove({ touches: [{ x: 240, y: 160 }] });
  assert.equal(viewer.currentPose.scale, 2);
  viewer.touchEnd({ touches: [], changedTouches: [{ x: 240, y: 160 }] });
  assert.equal(updates.filter(value => value.name === 'inspect').length, 0);
});

test('zoom limits remain 100 to 600 percent', () => {
  const board = viewport.fitBoard({ width: 32, height: 48 }, 300, 320);
  assert.equal(viewport.constrainPose({ x: 999, y: 999, scale: 0.5 }, board).scale, 1);
  assert.deepEqual(viewport.constrainPose({ x: 999, y: 999, scale: 0.5 }, board), { x: 0, y: 0, scale: 1 });
  assert.equal(viewport.constrainPose({ x: 0, y: 0, scale: 10 }, board).scale, 6);
});
