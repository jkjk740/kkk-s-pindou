'use strict';

const { ApiError, errorEnvelope } = require('./errors');
const { readConfig, issueSession, verifySession, userId } = require('./session');
const { validateRequest, loginPayload, savePayload, deletePayload, listPayload, copyPattern } = require('./validation');

function publicWork(record) {
  if (!record) return null;
  const result = {
    id: record.clientId, completedRows: record.completedRows.slice(),
    createdAt: record.createdAt, updatedAt: record.updatedAt, revision: record.revision, deleted: record.deleted
  };
  if (record.pattern) result.pattern = copyPattern(record.pattern);
  return result;
}

function owned(record, owner, clientId) {
  if (record && (record.owner !== owner || (clientId !== undefined && record.clientId !== clientId))) throw new ApiError('INTERNAL_ERROR');
  return record;
}

function deleteRetry(record, baseRevision) {
  return record && record.deleted && (record.revision === baseRevision || record.revision === baseRevision + 1);
}

function createApi(options) {
  const repository = options.repository;
  const clock = options.clock || Date.now;

  async function currentWork(owner, clientId) {
    return owned(await repository.get(owner, clientId), owner, clientId);
  }

  function conflict(record) {
    throw new ApiError('CONFLICT', { work: publicWork(record) });
  }

  async function mutate(owner, payload, deleting, now) {
    const clientId = deleting ? payload.id : payload.work.id;
    const baseRevision = payload.baseRevision;
    const current = await currentWork(owner, clientId);
    if (deleting && deleteRetry(current, baseRevision)) return { work: publicWork(current) };
    if ((current && current.revision !== baseRevision) || (!current && baseRevision !== 0)) conflict(current);
    const next = {
      owner, clientId, createdAt: current ? current.createdAt : now,
      updatedAt: now, revision: baseRevision + 1, deleted: deleting,
      completedRows: deleting ? (current ? current.completedRows.slice() : []) : payload.work.completedRows
    };
    const nextPattern = deleting ? (current && current.pattern) : payload.work.pattern;
    if (nextPattern) next.pattern = copyPattern(nextPattern);
    if (await repository.compareAndSwap(owner, clientId, baseRevision, next)) return { work: publicWork(next) };
    const latest = await currentWork(owner, clientId);
    if (deleting && deleteRetry(latest, baseRevision)) return { work: publicWork(latest) };
    conflict(latest);
  }

  return async function api(request, headers) {
    try {
      validateRequest(request);
      let payload;
      if (request.action === 'auth.login') payload = loginPayload(request.payload);
      if (request.action === 'works.save') payload = savePayload(request.payload);
      if (request.action === 'works.delete') payload = deletePayload(request.payload);
      if (request.action === 'works.list') payload = listPayload(request.payload);
      const config = readConfig(options.env || {});
      const now = clock();
      if (!Number.isSafeInteger(now) || now < 0) throw new ApiError('INTERNAL_ERROR');
      if (request.action === 'auth.login') {
        let session;
        try {
          session = await options.exchange(payload, { appId: config.appId, appSecret: config.appSecret });
        } catch (error) {
          throw new ApiError(error instanceof ApiError && error.code === 'SERVICE_UNAVAILABLE' ? 'SERVICE_UNAVAILABLE' : 'AUTH_FAILED');
        }
        if (!session || (session.errcode !== undefined && session.errcode !== 0) ||
          typeof session.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(session.openid)) throw new ApiError('AUTH_FAILED');
        return { ok: true, data: issueSession(userId(config.appId, session.openid), config, now) };
      }
      const owner = verifySession(headers && headers.authorization, config, now);
      if (request.action === 'works.list') {
        const records = await repository.list(owner, payload.after, payload.limit + 1);
        const page = records.slice(0, payload.limit).map(record => publicWork(owned(record, owner)));
        return { ok: true, data: { items: page, cursor: records.length > payload.limit ? page[page.length - 1].id : null } };
      }
      return { ok: true, data: await mutate(owner, payload, request.action === 'works.delete', now) };
    } catch (error) {
      return errorEnvelope(error);
    }
  };
}

module.exports = { createApi };
