const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createExportPlan } = require('../src/lib/export-plan.js');
const { createExportLayout } = require('../src/lib/export-layout.js');
const palette = require('../src/data/mard.json').colors;
const pattern = { version: 1, paletteId: 'mard-221', name: '高清图纸', width: 128, height: 128, beadSize: 2.6, cells: Array.from({ length: 16384 }, (_, index) => palette[index % palette.length].code) };
test('128-grid full color export fits total canvas budget', () => { const layout = createExportLayout(pattern, palette); assert.ok(layout.width <= 4096 && layout.height <= 4096 && layout.width * layout.height <= 12000000); });
test('mirror is applied globally before four tiles, without color changes', () => {
  const pages = createExportPlan(pattern, palette, { mirror: true, format: 'tiles' });
  assert.equal(pages.length, 4);
  assert.equal(pages[0].pattern.cells[0], pattern.cells[127]);
  assert.equal(pages[1].pattern.cells[0], pattern.cells[63]);
  assert.equal(pages[3].block.startRow, 64); assert.equal(pages[3].block.startColumn, 64);
  assert.equal(pages.reduce((sum, page) => sum + page.pattern.cells.length, 0), 16384);
});
test('narrow tail tiles gain legend columns without reducing 40px cells', () => {
  const narrow = { ...pattern, width: 66, cells: Array.from({ length: 66 * 128 }, (_, index) => palette[index % palette.length].code) };
  const pages = createExportPlan(narrow, palette, { format: 'tiles' });
  const tail = pages.find(page => page.pattern.width === 2);
  assert.equal(tail.layout.cellSize, 40);
  assert.ok(tail.layout.height <= 4096 && tail.layout.width * tail.layout.height <= 12000000);
});
