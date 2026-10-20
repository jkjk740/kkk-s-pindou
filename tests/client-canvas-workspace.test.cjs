const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inflateSync } = require('node:zlib');
const { createWorkingCanvas, encodeRgbaPng, writeCanvasPng, releaseCanvasFile } = require('../src/lib/working-canvas.js');
const { maskOutline } = require('../src/lib/cutout-renderer.js');

test('processing canvases are created offscreen without a selector or rendered node', () => {
  const context = {}; const image = {}; const calls = [];
  const canvas = { getContext: () => context, createImage: () => image };
  const platform = { createOffscreenCanvas(options) { calls.push(options); return canvas; } };
  assert.equal(createWorkingCanvas(32, 48, platform), canvas);
  assert.deepEqual(calls, [{ type: '2d', width: 32, height: 48 }]);
  assert.throws(() => createWorkingCanvas(32, 48, {}), /更新微信/);
});

test('PNG encoding preserves RGBA including transparent color and does not require native export', async () => {
  const bytes = await encodeRgbaPng({ width: 2, height: 1, data: Uint8ClampedArray.from([255, 255, 255, 255, 17, 31, 49, 0]) });
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = []; let offset = 8;
  while (offset < bytes.length) {
    const size = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (name === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const row = inflateSync(Buffer.concat(chunks));
  assert.equal(row[0], 1);
  const rgba = new Uint8Array(8);
  for (let index = 0; index < rgba.length; index++) rgba[index] = (row[index + 1] + (index >= 4 ? rgba[index - 4] : 0)) & 255;
  assert.deepEqual(Array.from(rgba), [255, 255, 255, 255, 17, 31, 49, 0]);
});

test('owned PNG paths are released but downloaded originals are never removed', async () => {
  const writes = []; const removed = [];
  const manager = { writeFile(options) { writes.push(options); options.success(); }, unlink(options) { removed.push(options.filePath); options.success(); } };
  const platform = { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => manager };
  const canvas = { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ width: 1, height: 1, data: Uint8ClampedArray.from([1, 2, 3, 255]) }) }) };
  const filePath = await writeCanvasPng(canvas, platform);
  assert.match(filePath, /^wxfile:\/\/usr\/bead-render-/);
  assert.ok(writes[0].data instanceof ArrayBuffer);
  await releaseCanvasFile(filePath, platform);
  await releaseCanvasFile('wxfile://usr/original-photo.png', platform);
  assert.deepEqual(removed, [filePath]);
});

test('an untouched image has no animated rectangular outline', () => {
  assert.deepEqual(maskOutline(new Uint8Array(16).fill(255), 4, 4), []);
  const selection = new Uint8Array(16); selection[5] = 255;
  assert.ok(maskOutline(selection, 4, 4).length > 0);
});

test('cutout, conversion and export templates contain no hidden processing canvas', () => {
  for (const file of ['src/components/cutout-workspace.vue', 'src/pages/editor/index.vue', 'src/pages/community/detail.vue']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /<canvas[^>]*class="(?:hidden-canvas|offscreen)"/);
    assert.doesNotMatch(source, /id="(?:cutout-source|cutout-composite|cutout-mask|decode-canvas|export-canvas|preview-canvas|community-export)"/);
  }
  const workspace = fs.readFileSync(path.join(__dirname, '../src/components/cutout-workspace.vue'), 'utf8');
  assert.doesNotMatch(workspace, /<canvas\b/);
  assert.match(workspace, /<view class="workspace"[^>]*@touchstart\.stop\.prevent=/);
});

test('cutout display and touch coordinates share one ordinary view without a native canvas host', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/cutout-workspace.vue'), 'utf8');
  assert.doesNotMatch(source, /<canvas\b/);
  assert.match(source, /virtualHost:\s*true/);
  assert.match(source, /select\('\.workspace'\)\.boundingClientRect/);
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/cutout/index.vue'), 'utf8');
  assert.doesNotMatch(page, /<cutout-workspace[^>]*style="[^"]*position:/);
});

test('cutout fills the actual view instead of keeping a height measured on the previous tab', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/cutout/index.vue'), 'utf8');
  assert.match(page, /\.cutout-page\s*\{[^}]*height:\s*100vh/);
  assert.doesNotMatch(page, /viewportHeight|resizePage/);
  assert.match(page, /\.cutout-overlays\s*\{[^}]*position:\s*absolute/);
  assert.match(page, /\.cutout-footer\s*\{[^}]*flex-shrink:\s*0/);
});
