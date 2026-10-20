const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createExportSession } = require('../src/lib/export-session.js');
test('failed third tile resumes at third and never resaves the first two', async () => {
  let fail = true; const saved = [];
  const session = createExportSession({ pages: [0, 1, 2, 3], renderPage: async page => 'file-' + page, savePage: async file => { if (file === 'file-2' && fail) { fail = false; throw new Error('denied'); } saved.push(file); } });
  await assert.rejects(session.run()); assert.equal(session.status().completed, 2);
  await session.retry(); assert.deepEqual(saved, ['file-0', 'file-1', 'file-2', 'file-3']);
});
