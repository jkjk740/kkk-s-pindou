'use strict';
const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
const { copyPattern } = require('./validation.cjs');
const { cursorFor } = require('./community-validation.cjs');
const select = 'SELECT p.*, u.display_name FROM bead_public_works p JOIN bead_users u ON u.id = p.owner';
function createCommunityRepository(pool) {
  async function persist(owner, input, snapshot, thumbnail, now, updateId) {
    let connection;
    try { connection = await pool.getConnection(); } catch (error) { error.rollbackConfirmed = true; throw error; }
    let committing = false;
    try {
      await connection.beginTransaction();
      const [sources] = await connection.execute('SELECT * FROM bead_works WHERE owner = ? AND client_id = ? FOR UPDATE', [owner, input.sourceClientId]);
      const source = sources[0];
      if (!source || source.deleted || source.origin_public_id || Number(source.revision) !== input.sourceRevision) throw new ApiError('PUBLIC_SOURCE_INVALID');
      const [existing] = await connection.execute('SELECT * FROM bead_public_works WHERE owner = ? AND source_work_id = ? FOR UPDATE', [owner, source.id]);
      const previous = existing[0];
      const content = JSON.stringify(snapshot);
      let id;
      if (updateId) {
        if (!previous || previous.id !== updateId) throw new ApiError('PUBLIC_NOT_FOUND');
        id = previous.id;
        await connection.execute('UPDATE bead_public_works SET source_revision = ?, title = ?, pattern = ?, thumbnail_key = ?, updated_at = ?, withdrawn = FALSE WHERE id = ? AND owner = ?', [input.sourceRevision, input.title, content, thumbnail.storageKey, now, id, owner]);
      } else if (previous) {
        const previousPattern = JSON.stringify(copyPattern(typeof previous.pattern === 'string' ? JSON.parse(previous.pattern) : previous.pattern));
        if (previous.withdrawn || previous.title !== input.title || previousPattern !== content) throw new ApiError('ALREADY_PUBLISHED', { id: previous.id });
        id = previous.id;
      } else {
        id = crypto.randomUUID();
        await connection.execute('INSERT INTO bead_public_works (id, owner, source_work_id, source_revision, title, pattern, thumbnail_key, created_at, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, owner, source.id, input.sourceRevision, input.title, content, thumbnail.storageKey, now, now, now]);
      }
      const [rows] = await connection.execute(select + ' WHERE p.id = ?', [id]);
      committing = true;
      await connection.commit();
      return rows[0];
    } catch (error) {
      error.rollbackConfirmed = false;
      if (!committing) try { await connection.rollback(); error.rollbackConfirmed = true; } catch {}
      throw error;
    } finally { connection.release(); }
  }
  return {
    publish(owner, input, snapshot, thumbnail, now) { return persist(owner, input, snapshot, thumbnail, now); },
    update(owner, id, input, snapshot, thumbnail, now) { return persist(owner, input, snapshot, thumbnail, now, id); },
    async get(id) { const [rows] = await pool.execute(select + ' WHERE p.id = ? AND p.withdrawn = FALSE', [id]); return rows[0] || null; },
    async list(input) {
      const values = [], conditions = ['p.withdrawn = FALSE'];
      if (input.query) {
        conditions.push("(p.title LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!')");
        const term = '%' + input.query.replace(/[!%_]/g, match => '!' + match) + '%';
        values.push(term, term);
      }
      if (input.after) {
        const after = input.after;
        if (input.sort === 'hot') {
          conditions.push('(p.download_count < ? OR (p.download_count = ? AND (p.published_at < ? OR (p.published_at = ? AND p.id < ?))))');
          values.push(after.downloadCount, after.downloadCount, after.publishedAt, after.publishedAt, after.id);
        } else { conditions.push('(p.published_at < ? OR (p.published_at = ? AND p.id < ?))'); values.push(after.publishedAt, after.publishedAt, after.id); }
      }
      const order = input.sort === 'hot' ? 'p.download_count DESC, p.published_at DESC, p.id DESC' : 'p.published_at DESC, p.id DESC';
      const [rows] = await pool.query(select + ' WHERE ' + conditions.join(' AND ') + ' ORDER BY ' + order + ' LIMIT ?', [...values, input.limit + 1]);
      const page = rows.slice(0, input.limit);
      return { rows: page, cursor: rows.length > input.limit ? cursorFor(page[page.length - 1], input) : null };
    },
    async withdraw(owner, id, now) {
      const [result] = await pool.execute('UPDATE bead_public_works SET withdrawn = TRUE, updated_at = ? WHERE id = ? AND owner = ?', [now, id, owner]);
      if (!result.affectedRows) throw new ApiError('PUBLIC_NOT_FOUND');
      return { id, withdrawn: true };
    },
    async createDownloadIntent(id, now) {
      const [rows] = await pool.execute('SELECT id FROM bead_public_works WHERE id = ? AND withdrawn = FALSE', [id]);
      if (!rows.length) throw new ApiError('PUBLIC_NOT_FOUND');
      const intent = { id: crypto.randomUUID(), token: crypto.randomBytes(32).toString('base64url'), expiresAt: now + 600000 };
      await pool.execute('INSERT INTO bead_public_downloads (id, public_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [intent.id, id, crypto.createHash('sha256').update(intent.token).digest('hex'), now, intent.expiresAt]);
      await pool.query('DELETE FROM bead_public_downloads WHERE completed_at IS NULL AND expires_at < ? LIMIT 100', [now]);
      return intent;
    },
    async confirmDownload(id, intent, now) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [works] = await connection.execute('SELECT download_count, withdrawn FROM bead_public_works WHERE id = ? FOR UPDATE', [id]);
        if (!works.length || works[0].withdrawn) throw new ApiError('PUBLIC_NOT_FOUND');
        const [intents] = await connection.execute('SELECT * FROM bead_public_downloads WHERE id = ? AND public_id = ? FOR UPDATE', [intent.id, id]);
        const record = intents[0];
        const hash = crypto.createHash('sha256').update(intent.token).digest('hex');
        if (!record || !crypto.timingSafeEqual(Buffer.from(record.token_hash, 'hex'), Buffer.from(hash, 'hex'))) throw new ApiError('INVALID_REQUEST');
        const count = Number(works[0].download_count);
        if (!Number.isSafeInteger(count) || count >= Number.MAX_SAFE_INTEGER) throw new ApiError('INTERNAL_ERROR');
        const counted = record.completed_at == null;
        if (counted) {
          if (Number(record.expires_at) <= now) throw new ApiError('DOWNLOAD_EXPIRED');
          await connection.execute('UPDATE bead_public_downloads SET completed_at = ? WHERE id = ?', [now, intent.id]);
          await connection.execute('UPDATE bead_public_works SET download_count = download_count + 1 WHERE id = ?', [id]);
        }
        await connection.commit();
        return { id, downloadCount: count + (counted ? 1 : 0), counted };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; }
      finally { connection.release(); }
    }
  };
}
module.exports = { createCommunityRepository };
