const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createFeedState } = require('../src/lib/community-feed.js');

const source = fs.readFileSync(require.resolve('../src/components/community-gallery.vue'), 'utf8')
  .match(/<script>([\s\S]*?)<\/script>/)[1]
  .replace(/^import .*;\s*$/gm, '')
  .replace('export default', 'module.exports =');
const context = { module: { exports: {} }, CommunityCard: {} };
vm.runInNewContext(source, context);
const applyDownload = context.module.exports.methods.applyDownload;

test('download events retain cards displayed after a failed refresh', () => {
  const gallery = { feed: createFeedState(), columns: [[{ id: 'demo', downloadCount: 0 }], []], fallbackColumns: null };
  applyDownload.call(gallery, { id: 'demo', downloadCount: 1 });
  assert.equal(gallery.columns[0].length, 1);
  assert.equal(gallery.columns[0][0].downloadCount, 1);
});

test('downloads update pending fallback cards without creating new cards', () => {
  const gallery = { feed: createFeedState(), columns: [[], []], fallbackColumns: [[{ id: 'demo', downloadCount: 0 }], []] };
  applyDownload.call(gallery, { id: 'demo', downloadCount: 2 });
  assert.equal(gallery.columns[0].length, 0);
  assert.equal(gallery.fallbackColumns[0][0].downloadCount, 2);
  applyDownload.call(gallery, { id: 'other', downloadCount: 3 });
  assert.equal(gallery.fallbackColumns[0].length, 1);
});
