const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('../backend/node_modules/sharp');
const { decodeMask, composeRgba } = require('../backend/src/cutout-images.cjs');
test('gray mask preserves original RGB and multiplies original alpha', async () => {
  const mask = await sharp(Buffer.from([128, 128, 128, 255]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
  const values = await decodeMask(mask, 1, 1);
  assert.deepEqual(Array.from(composeRgba(Buffer.from([255, 255, 255, 128]), values)), [255, 255, 255, 64]);
  const invalid = await sharp(Buffer.from([255, 0, 0, 255]), { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
  await assert.rejects(decodeMask(invalid, 1, 1), { code: 'MASK_INVALID' });
});
