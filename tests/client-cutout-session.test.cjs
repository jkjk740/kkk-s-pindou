const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCutoutSession } = require('../src/lib/cutout-session.js');
const { conversionFrame } = require('../src/lib/conversion-frame.js');
test('late AI result is offered as stale but never applied to hand edited mask', () => {
  const session = createCutoutSession({ sourceImageId: 'original' }); const stamp = session.stamp(); session.edited();
  assert.equal(session.offer('mask', stamp), true); assert.equal(session.candidate().stale, true); assert.equal(session.current(stamp), false);
  session.cancel(); assert.equal(session.offer('late', stamp), false);
});
test('transparent frame crops visible bounds with one cell padding and never erases white', () => {
  const data = new Uint8Array(10 * 10 * 4);
  for (let row = 3; row < 7; row++) for (let column = 3; column < 7; column++) data.set([255, 255, 255, 255], (row * 10 + column) * 4);
  const frame = conversionFrame({ width: 10, height: 10, data }, 128);
  assert.equal(frame.width, 128); assert.equal(frame.padding, 1); assert.equal(frame.cropWidth, 4);
  assert.throws(() => conversionFrame({ width: 10, height: 10, data: new Uint8Array(400) }, 64));
});
