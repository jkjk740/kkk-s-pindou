'use strict';
const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
function record(row) {
  if (!row) return null;
  return { id: row.id, sourceImageId: row.source_image_id, inputImageId: row.input_image_id, maskImageId: row.mask_image_id || null, resultImageId: row.result_image_id || null, requestId: row.request_id, maskHash: row.mask_hash, status: row.status, errorCode: row.error_code || null, createdAt: Number(row.created_at) };
}
function createCutoutRepository(pool) {
  async function transaction(owner, operation) {
    let connection;
    try { connection = await pool.getConnection(); } catch (error) { error.rollbackConfirmed = true; throw error; }
    let committing = false;
    try {
      await connection.beginTransaction();
      const [users] = await connection.execute('SELECT id FROM bead_users WHERE id = ? FOR UPDATE', [owner]);
      if (!users.length) throw new ApiError('UNAUTHORIZED');
      const result = await operation(connection);
      committing = true; await connection.commit(); return result;
    } catch (error) {
      error.rollbackConfirmed = false;
      if (!committing) { try { await connection.rollback(); error.rollbackConfirmed = true; } catch {} }
      throw error;
    } finally { connection.release(); }
  }
  async function queryOne(sql, values, connection = pool) { const [rows] = await connection.execute(sql, values); return record(rows[0]); }
  const repository = {
    transaction,
    getInput(owner, sourceId, connection = pool) { return queryOne('SELECT source_image_id, input_image_id FROM bead_cutout_inputs WHERE owner = ? AND source_image_id = ? AND version = 1', [owner, sourceId], connection); },
    getCutout(owner, id) { return queryOne('SELECT * FROM bead_cutouts WHERE owner = ? AND id = ?', [owner, id]); },
    findConfirmation(owner, requestId, connection = pool) { return queryOne('SELECT * FROM bead_cutouts WHERE owner = ? AND request_id = ?', [owner, requestId], connection); },
    findTask(owner, requestId, connection = pool) { return queryOne('SELECT * FROM bead_cutout_tasks WHERE owner = ? AND request_id = ?', [owner, requestId], connection); },
    getTask(owner, id) { return queryOne('SELECT * FROM bead_cutout_tasks WHERE owner = ? AND id = ?', [owner, id]); },
    findReadyMask(owner, inputId) { return queryOne("SELECT * FROM bead_cutout_tasks WHERE owner = ? AND input_image_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1", [owner, inputId]); },
    async enqueueTask(owner, input, limits, now = Date.now()) {
      return transaction(owner, async connection => {
        await connection.execute('SELECT id FROM bead_cutout_lock WHERE id = 1 FOR UPDATE');
        const previous = await repository.findTask(owner, input.requestId, connection);
        if (previous) { if (previous.sourceImageId !== input.sourceImageId) throw new ApiError('INVALID_REQUEST'); return previous; }
        const [pending] = await connection.execute("SELECT COUNT(*) AS total, SUM(owner = ?) AS owned FROM bead_cutout_tasks WHERE status IN ('queued', 'processing')", [owner]);
        if (Number(pending[0].owned) > 0 || Number(pending[0].total) >= limits.queue + 1) throw new ApiError('CUTOUT_BUSY');
        const day = Math.floor((now + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
        const [daily] = await connection.execute('SELECT COUNT(*) AS total FROM bead_cutout_tasks WHERE owner = ? AND created_at >= ?', [owner, day]);
        if (Number(daily[0].total) >= limits.daily) throw new ApiError('CUTOUT_LIMIT');
        const id = crypto.randomUUID();
        await connection.execute("INSERT INTO bead_cutout_tasks (id, owner, source_image_id, input_image_id, request_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)", [id, owner, input.sourceImageId, input.inputImageId, input.requestId, now, now]);
        return { id, ...input, status: 'queued', createdAt: now };
      });
    },
    async nextTask() { const [rows] = await pool.execute("SELECT * FROM bead_cutout_tasks WHERE status = 'queued' ORDER BY created_at, id LIMIT 1"); return rows[0] ? { ...record(rows[0]), owner: rows[0].owner } : null; },
    async claimTask(id) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute('SELECT id FROM bead_cutout_lock WHERE id = 1 FOR UPDATE');
        const [active] = await connection.execute("SELECT id FROM bead_cutout_tasks WHERE status = 'processing' LIMIT 1");
        if (active.length) { await connection.commit(); return false; }
        const [result] = await connection.execute("UPDATE bead_cutout_tasks SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'queued'", [Date.now(), id]);
        await connection.commit(); return result.affectedRows === 1;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async finishTask(id, { maskImageId = null, errorCode = null }, connection = pool) { await connection.execute("UPDATE bead_cutout_tasks SET status = ?, mask_image_id = ?, error_code = ?, updated_at = ? WHERE id = ? AND status = 'processing'", [maskImageId ? 'ready' : 'failed', maskImageId, errorCode, Date.now(), id]); },
    recoverInterrupted() { return pool.execute("UPDATE bead_cutout_tasks SET status = 'failed', error_code = 'CUTOUT_INTERRUPTED', updated_at = ? WHERE status = 'processing'", [Date.now()]); },
    async persistImages(owner, images, quota, operation) {
      return transaction(owner, async connection => {
        const existing = await operation.find(connection);
        if (existing) return { existing: true, value: existing };
        const [totals] = await connection.execute('SELECT COALESCE(SUM(byte_size), 0) AS used FROM bead_images WHERE owner = ?', [owner]);
        if (Number(totals[0].used) + images.reduce((sum, image) => sum + image.byteSize, 0) > quota) throw new ApiError('QUOTA_EXCEEDED');
        for (const image of images) await connection.execute('INSERT INTO bead_images (id, owner, storage_provider, storage_key, mime_type, byte_size, width, height, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [image.id, owner, 'local', image.storageKey, 'image/png', image.byteSize, image.width, image.height, image.sha256, Date.now()]);
        return { existing: false, value: await operation.insert(connection) };
      });
    },
    async saveInput(connection, owner, sourceId, imageId) { await connection.execute('INSERT INTO bead_cutout_inputs (owner, source_image_id, input_image_id) VALUES (?, ?, ?)', [owner, sourceId, imageId]); return { sourceImageId: sourceId, inputImageId: imageId }; },
    async saveConfirmation(connection, owner, input) {
      await connection.execute('INSERT INTO bead_cutouts (id, owner, source_image_id, input_image_id, mask_image_id, result_image_id, request_id, mask_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [input.id, owner, input.sourceImageId, input.inputImageId, input.maskImageId, input.resultImageId, input.requestId, input.maskHash, Date.now()]); return input;
    }
  };
  return repository;
}
module.exports = { createCutoutRepository };
