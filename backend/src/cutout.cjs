'use strict';
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { ApiError } = require('./errors.cjs');
const { imageId, fields } = require('./validation.cjs');
function cutoutRoutes(app, { service, storage, authenticate, rateLimit }) {
  const upload = multer({ storage: multer.diskStorage({ destination: storage.tempDir, filename: (request, file, callback) => callback(null, crypto.randomUUID() + '.upload') }), limits: { fileSize: 2097152, files: 1, fields: 2, fieldSize: 128, parts: 3 } }).single('mask');
  const guard = [authenticate, rateLimit('cutout', 120, 60000, request => request.owner)];
  const uuid = value => { const result = imageId(value); if (!result) throw new ApiError('INVALID_REQUEST'); return result; };
  const send = (response, data) => response.set('Cache-Control', 'no-store').json({ ok: true, data });
  app.get('/api/cutout/capabilities', ...guard, (request, response) => send(response, service.capabilities()));
  app.get('/api/images/:id/cutout-input', ...guard, async (request, response) => send(response, await service.input(request.owner, uuid(request.params.id))));
  app.post('/api/images/:id/cutout-tasks', ...guard, require('express').json({ limit: '1kb' }), async (request, response) => { fields(request.body, ['requestId'], ['requestId']); send(response, await service.start(request.owner, uuid(request.params.id), uuid(request.body.requestId))); });
  app.get('/api/cutout-tasks/:id', ...guard, async (request, response) => send(response, await service.task(request.owner, uuid(request.params.id))));
  app.get('/api/cutouts/:id', ...guard, async (request, response) => send(response, await service.cutout(request.owner, uuid(request.params.id))));
  app.post('/api/images/:id/cutouts', ...guard, (request, response, next) => upload(request, response, error => error ? next(new ApiError('MASK_INVALID')) : next()), async (request, response) => {
    try {
      fields(request.body, ['inputImageId', 'requestId'], ['inputImageId', 'requestId']);
      if (!request.file || request.file.mimetype !== 'image/png') throw new ApiError('MASK_INVALID');
      send(response, await service.confirm(request.owner, uuid(request.params.id), { inputImageId: uuid(request.body.inputImageId), requestId: uuid(request.body.requestId) }, request.file.path));
    } finally { if (request.file?.path) await fs.unlink(request.file.path).catch(() => {}); }
  });
}
module.exports = { cutoutRoutes };
