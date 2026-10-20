'use strict';

const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
function safeNumber(value) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new ApiError('INTERNAL_ERROR');
  return result;
}
function json(value) { return typeof value === 'string' ? JSON.parse(value) : value; }
function workRecord(row) {
  if (!row) return null;
  return { owner: row.owner, clientId: row.client_id, sourceImageId: row.source_image_id, cutoutId: row.cutout_id || null, originPublicId: row.origin_public_id || null, publishedId: row.published_id || null,
    pattern: json(row.pattern), completedRows: json(row.completed_rows), createdAt: safeNumber(row.created_at),
    updatedAt: safeNumber(row.updated_at), revision: safeNumber(row.revision), deleted: Boolean(row.deleted) };
}
function imageRecord(row) {
  if (!row) return null;
  return { id: row.id, owner: row.owner, storageProvider: row.storage_provider, storageKey: row.storage_key,
    mimeType: row.mime_type, byteSize: safeNumber(row.byte_size), width: row.width, height: row.height, createdAt: safeNumber(row.created_at) };
}
function createRepository(pool) {
  return {
    async upsertUser(owner, appId, now) {
      await pool.execute('INSERT INTO bead_users (id, app_id, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = ?, last_login_at = ?', [owner, appId, now, now, now, now, now]);
    },
    async get(owner, clientId) {
      const [rows] = await pool.execute('SELECT w.*, p.id AS published_id FROM bead_works w LEFT JOIN bead_public_works p ON p.source_work_id = w.id AND p.owner = w.owner WHERE w.owner = ? AND w.client_id = ? LIMIT 1', [owner, clientId]);
      return workRecord(rows[0]);
    },
    async getProfile(owner) {
      const displayName = '豆友' + crypto.randomBytes(3).toString('hex');
      const [result] = await pool.execute('UPDATE bead_users SET display_name = ? WHERE id = ? AND display_name IS NULL', [displayName, owner]);
      const [rows] = await pool.execute('SELECT display_name FROM bead_users WHERE id = ?', [owner]);
      if (!rows.length) throw new ApiError('UNAUTHORIZED');
      return { displayName: rows[0].display_name, needsName: result.affectedRows === 1 };
    },
    async updateProfile(owner, displayName, now) {
      const [result] = await pool.execute('UPDATE bead_users SET display_name = ?, updated_at = ? WHERE id = ?', [displayName, now, owner]);
      if (!result.affectedRows) throw new ApiError('UNAUTHORIZED');
      return { displayName, needsName: false };
    },
    async getPublicOrigin(id) {
      const [rows] = await pool.execute('SELECT id FROM bead_public_works WHERE id = ? AND withdrawn = FALSE', [id]);
      return rows[0] || null;
    },
    async list(owner, after, limit) {
      const [rows] = await pool.query('SELECT w.*, p.id AS published_id FROM bead_works w LEFT JOIN bead_public_works p ON p.source_work_id = w.id AND p.owner = w.owner WHERE w.owner = ? AND w.client_id > ? ORDER BY w.client_id ASC LIMIT ?', [owner, after || '', limit]);
      return rows.map(workRecord);
    },
    async compareAndSwap(owner, clientId, baseRevision, next) {
      const values = [next.sourceImageId || null, next.cutoutId || null, next.originPublicId || null, next.pattern ? JSON.stringify(next.pattern) : null, JSON.stringify(next.completedRows), next.updatedAt, next.revision, next.deleted ? 1 : 0];
      if (baseRevision === 0) {
        try {
          const id = crypto.createHash('sha256').update(JSON.stringify([owner, clientId])).digest('hex');
          await pool.execute('INSERT INTO bead_works (id, owner, client_id, created_at, source_image_id, cutout_id, origin_public_id, pattern, completed_rows, updated_at, revision, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, owner, clientId, next.createdAt, ...values]);
          return true;
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') return false;
          throw error;
        }
      }
      const [result] = await pool.execute('UPDATE bead_works SET source_image_id = ?, cutout_id = ?, origin_public_id = ?, pattern = ?, completed_rows = ?, updated_at = ?, revision = ?, deleted = ? WHERE owner = ? AND client_id = ? AND revision = ?', [...values, owner, clientId, baseRevision]);
      return result.affectedRows === 1;
    },
    async getCutout(owner, id) {
      const [rows] = await pool.execute('SELECT source_image_id FROM bead_cutouts WHERE owner = ? AND id = ?', [owner, id]);
      return rows[0] ? { sourceImageId: rows[0].source_image_id } : null;
    },
    async getImage(owner, imageId) {
      const [rows] = await pool.execute('SELECT * FROM bead_images WHERE owner = ? AND id = ? LIMIT 1', [owner, imageId]);
      return imageRecord(rows[0]);
    },
    async saveImage(owner, metadata, quotaBytes) {
      let connection;
      try { connection = await pool.getConnection(); }
      catch (error) { error.rollbackConfirmed = true; throw error; }
      let committing = false;
      try {
        await connection.beginTransaction();
        const [users] = await connection.execute('SELECT id FROM bead_users WHERE id = ? FOR UPDATE', [owner]);
        if (!users.length) throw new ApiError('UNAUTHORIZED');
        const [totals] = await connection.execute('SELECT COALESCE(SUM(byte_size), 0) AS used FROM bead_images WHERE owner = ?', [owner]);
        if (safeNumber(totals[0].used) + metadata.byteSize > quotaBytes) throw new ApiError('QUOTA_EXCEEDED');
        await connection.execute('INSERT INTO bead_images (id, owner, storage_provider, storage_key, mime_type, byte_size, width, height, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [metadata.id, owner, 'local', metadata.storageKey, metadata.mimeType, metadata.byteSize, metadata.width, metadata.height, metadata.sha256, metadata.createdAt]);
        committing = true;
        await connection.commit();
        return metadata;
      } catch (error) {
        if (!committing) {
          try { await connection.rollback(); error.rollbackConfirmed = true; } catch { error.rollbackConfirmed = false; }
        } else error.rollbackConfirmed = false;
        throw error;
      } finally { connection.release(); }
    }
  };
}
module.exports = { createRepository };
