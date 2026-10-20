const test = require('node:test');
const assert = require('node:assert/strict');
const { convertRgba, gridDimensions, validatePattern } = require('../src/lib/pattern.js');
const palette = require('../src/data/mard.json').colors;

test('supports 128 grids and the complete MARD palette', () => {
  assert.deepEqual(gridDimensions(200, 100, 128), { width: 128, height: 64 });
  const cells = Array.from({ length: 16384 }, (_, index) => palette[index % palette.length].code);
  assert.equal(validatePattern({ version: 1, paletteId: 'mard-221', name: '精细图', width: 128, height: 128, beadSize: 2.6, cells }, palette), true);
  assert.throws(() => gridDimensions(100, 100, 129));
});
test('never erases white subjects by corner color', () => {
  const colors = [{ code: 'H2', hex: '#FFFFFF', rgb: [255, 255, 255] }];
  const image = { width: 2, height: 1, data: Uint8ClampedArray.from([255,255,255,255,255,255,255,0]) };
  assert.deepEqual(convertRgba(image, colors, { maxColors: 221, removeBackground: true }).cells, ['H2', null]);
});
test('client and backend agree on conversion boundaries', () => {
  const client = require('../src/lib/conversion-limits.js');
  const server = require('../backend/src/conversion-limits.cjs');
  for (const name of ['MAX_GRID_EDGE', 'MAX_GRID_CELLS', 'MAX_PALETTE_COLORS']) assert.equal(client[name], server[name]);
  assert.equal(server.MAX_BODY_BYTES, 262144);
});
