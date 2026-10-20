const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCutoutRepository } = require('../backend/src/cutout-repository.cjs');
test('only queued tasks can be claimed, interrupted processing is not restarted', async () => {
  const statements = [];
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, execute: async (sql, values) => { statements.push({ sql, values }); return sql.includes("SELECT id FROM bead_cutout_tasks") ? [[]] : [{ affectedRows: 1 }]; };
  const pool = { execute: connection.execute, getConnection: async () => connection };
  const repository = createCutoutRepository(pool);
  assert.equal(await repository.claimTask('task'), true);
  await repository.recoverInterrupted();
  assert.match(statements[2].sql, /status = 'queued'/);
  assert.match(statements[3].sql, /status = 'processing'/);
  assert.match(statements[3].sql, /failed/);
});
