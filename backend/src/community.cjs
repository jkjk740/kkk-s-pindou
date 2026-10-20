'use strict';
const express = require('express');
const { ApiError } = require('./errors.cjs');
const { readConfig, verifySession } = require('./session.cjs');
const { pattern } = require('./validation.cjs');
const { publicId, publishInput, listInput, downloadInput, publicDto } = require('./community-validation.cjs');
function communityRoutes(app, { repository, communityRepository, communityImages, config, authenticate, rateLimit }) {
  function optionalOwner(request) { try { return verifySession(request.headers.authorization, readConfig(config.auth), Date.now()); } catch { return null; } }
  app.get('/api/community', rateLimit('community-read', 120, 60000), async (request, response) => {
    const result = await communityRepository.list(listInput(request.query));
    response.set('Cache-Control', 'no-store').json({ ok: true, data: { items: result.rows.map(row => publicDto(row)), cursor: result.cursor } });
  });
  app.get('/api/community/:id/thumbnail', async (request, response) => {
    const record = await communityRepository.get(publicId(request.params.id));
    if (!record) throw new ApiError('PUBLIC_NOT_FOUND');
    response.set('Cache-Control', 'no-store').type('png').send(await communityImages.read(record.thumbnail_key));
  });
  app.get('/api/community/:id', rateLimit('community-read', 120, 60000), async (request, response) => {
    response.set('Cache-Control', 'no-store').json({ ok: true, data: publicDto(await communityRepository.get(publicId(request.params.id)), optionalOwner(request), true) });
  });
  async function persist(request, response) {
    const input = publishInput(request.body);
    const source = await repository.get(request.owner, input.sourceClientId);
    if (!source || source.deleted || source.originPublicId || source.revision !== input.sourceRevision) throw new ApiError('PUBLIC_SOURCE_INVALID');
    const snapshot = pattern({ ...source.pattern, name: input.title });
    if (!snapshot.cells.some(Boolean)) throw new ApiError('PUBLIC_SOURCE_INVALID');
    await repository.getProfile(request.owner);
    const thumbnail = await communityImages.create(snapshot);
    try {
      const record = request.method === 'PUT'
        ? await communityRepository.update(request.owner, publicId(request.params.id), input, snapshot, thumbnail, Date.now())
        : await communityRepository.publish(request.owner, input, snapshot, thumbnail, Date.now());
      if (record.thumbnail_key !== thumbnail.storageKey) await communityImages.removeTemporary(thumbnail.storageKey);
      response.json({ ok: true, data: publicDto(record, request.owner, true) });
    } catch (error) {
      if (error.rollbackConfirmed) await communityImages.removeTemporary(thumbnail.storageKey).catch(() => {});
      throw error;
    }
  }
  app.post('/api/community', authenticate, rateLimit('publish', 12, 60000, request => request.owner), express.json({ limit: '4kb' }), persist);
  app.put('/api/community/:id', authenticate, rateLimit('publish', 12, 60000, request => request.owner), express.json({ limit: '4kb' }), persist);
  app.delete('/api/community/:id', authenticate, async (request, response) => response.json({ ok: true, data: await communityRepository.withdraw(request.owner, publicId(request.params.id), Date.now()) }));
  app.post('/api/community/:id/download-intents', rateLimit('download-intent', 20, 60000), async (request, response) => {
    response.json({ ok: true, data: await communityRepository.createDownloadIntent(publicId(request.params.id), Date.now()) });
  });
  app.post('/api/community/:id/downloads', rateLimit('download-confirm', 60, 60000), express.json({ limit: '2kb' }), async (request, response) => {
    response.json({ ok: true, data: await communityRepository.confirmDownload(publicId(request.params.id), downloadInput(request.body), Date.now()) });
  });
}
module.exports = { communityRoutes };
