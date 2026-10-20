const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMaskEditor } = require('../src/lib/cutout-mask.js');
const { fitImage, toImagePoint, zoomImage } = require('../src/lib/cutout-geometry.js');
test('brushes and lasso retain original mask values through undo', () => {
  const editor = createMaskEditor({ width: 12, height: 12 });
  editor.beginStroke(); editor.paint([{ x: 5, y: 5 }, { x: 9, y: 5 }], 2, false); editor.endStroke();
  assert.equal(editor.values()[5 * 12 + 7], 0);
  editor.undo(); assert.equal(editor.values()[5 * 12 + 7], 255);
  editor.redo(); assert.equal(editor.values()[5 * 12 + 7], 0);
  editor.lasso([{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 10 }, { x: 2, y: 10 }]);
  assert.equal(editor.values()[0], 0); assert.equal(editor.values()[5 * 12 + 7], 255);
});
test('zoom keeps the anchor in the same image position', () => {
  const geometry = fitImage({ width: 400, height: 400 }, { width: 300, height: 300 });
  const pose = { scale: 1, x: 0, y: 0 }; const anchor = { x: 150, y: 150 };
  assert.deepEqual(toImagePoint(anchor, pose, geometry), toImagePoint(anchor, zoomImage(pose, 3, anchor, geometry), geometry));
});
