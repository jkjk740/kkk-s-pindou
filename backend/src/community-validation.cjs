'use strict';
const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
const { fields, integer, clientId, imageId, copyPattern } = require('./validation.cjs');
function publicId(value) { const result = imageId(value); if (!result) throw new ApiError('INVALID_REQUEST'); return result; }
function publishInput(value) {
  fields(value, ['sourceClientId', 'sourceRevision', 'title'], ['sourceClientId', 'sourceRevision', 'title']);
  if (typeof value.title !== 'string') throw new ApiError('INVALID_REQUEST');
  const title = value.title.trim();
  if (!title || Array.from(title).length > 50 || /[\u0000-\u001f\u007f-\u009f]/.test(title)) throw new ApiError('INVALID_REQUEST');
  return { title, sourceClientId: clientId(value.sourceClientId), sourceRevision: integer(value.sourceRevision, 1, Number.MAX_SAFE_INTEGER - 1) };
}
function scope(query, sort) { return crypto.createHash('sha256').update(JSON.stringify([query, sort])).digest('hex'); }
function listInput(value) {
  fields(value, ['query', 'sort', 'cursor', 'limit'], []);
  const query = value.query === undefined ? '' : value.query;
  const sort = value.sort || 'hot';
  if (typeof query !== 'string' || Array.from(query).length > 50 || /[\u0000-\u001f\u007f-\u009f]/.test(query) || !['hot', 'latest'].includes(sort)) throw new ApiError('INVALID_REQUEST');
  const limit = value.limit === undefined ? 10 : typeof value.limit === 'string' && /^\d{1,2}$/.test(value.limit) ? Number(value.limit) : 0;
  integer(limit, 1, 10);
  let after = null;
  if (value.cursor) {
    try {
      if (typeof value.cursor !== 'string' || value.cursor.length > 700 || !/^[A-Za-z0-9_-]+$/.test(value.cursor)) throw new Error();
      after = JSON.parse(Buffer.from(value.cursor, 'base64url').toString('utf8'));
      fields(after, ['id', 'publishedAt', 'downloadCount', 'scope'], ['id', 'publishedAt', 'downloadCount', 'scope']);
      publicId(after.id); integer(after.publishedAt, 0, Number.MAX_SAFE_INTEGER); integer(after.downloadCount, 0, Number.MAX_SAFE_INTEGER);
      if (after.scope !== scope(query.trim(), sort)) throw new Error();
    } catch { throw new ApiError('INVALID_REQUEST'); }
  }
  return { query: query.trim(), sort, after, limit };
}
function cursorFor(row, input) {
  return Buffer.from(JSON.stringify({ id: row.id, publishedAt: Number(row.published_at), downloadCount: Number(row.download_count), scope: scope(input.query, input.sort) })).toString('base64url');
}
function downloadInput(value) {
  fields(value, ['id', 'token'], ['id', 'token']);
  publicId(value.id);
  if (typeof value.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.token)) throw new ApiError('INVALID_REQUEST');
  return { id: value.id, token: value.token };
}
function publicDto(row, owner, detail = false) {
  if (!row) throw new ApiError('PUBLIC_NOT_FOUND');
  const pattern = typeof row.pattern === 'string' ? JSON.parse(row.pattern) : row.pattern;
  const colors = new Set(pattern.cells.filter(Boolean));
  const result = { id: row.id, title: row.title, author: { name: row.display_name || '豆友' }, width: pattern.width, height: pattern.height,
    colorCount: colors.size, beadCount: pattern.cells.filter(Boolean).length, thumbnailUrl: '/api/community/' + row.id + '/thumbnail?v=' + row.updated_at,
    downloadCount: Number(row.download_count), publishedAt: Number(row.published_at) };
  if (detail) { result.pattern = { ...copyPattern(pattern), name: row.title }; result.canManage = Boolean(owner && row.owner === owner); }
  return result;
}
module.exports = { publicId, publishInput, listInput, cursorFor, downloadInput, publicDto };
