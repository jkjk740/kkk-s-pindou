'use strict';

const fs = require('node:fs');
const files = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const multer = require('multer');
const sharp = require('sharp');
const { pipeline } = require('node:stream/promises');
const { ApiError, errorEnvelope, statusFor } = require('./errors.cjs');
sharp.cache({ memory: 32, files: 0, items: 16 });
sharp.concurrency(1);
function publicImage(record) {
  return { id: record.id, mimeType: record.mimeType, byteSize: record.byteSize, width: record.width, height: record.height, createdAt: record.createdAt };
}
function imageRoutes(app, { repository, storage, config, authenticate, rateLimit }) {
  let active = 0;
  const upload = multer({
    storage: multer.diskStorage({ destination: storage.tempDir, filename(request, file, done) {
      const name = crypto.randomUUID() + '.upload';
      request.uploadTemp = path.join(storage.tempDir, name);
      done(null, name);
    } }),
    limits: { fileSize: config.uploadLimits.bytes, files: 1, fields: 0, parts: 1, headerPairs: 32 }
  }).single('file');
  app.post('/api/images', authenticate, rateLimit('upload', 12, 60000, request => request.owner), async (request, response) => {
    if (active >= config.uploadLimits.concurrent) throw new ApiError('RATE_LIMITED');
    active++;
    let storageKey;
    let keepFinal = false;
    try {
      await new Promise((resolve, reject) => upload(request, response, error => error ? reject(error) : resolve()));
      if (!request.file || request.aborted) throw new ApiError('IMAGE_INVALID');
      const decoderOptions = { limitInputPixels: config.uploadLimits.pixels, failOn: 'warning', sequentialRead: true };
      const metadata = await sharp(request.file.path, decoderOptions).metadata();
      const formats = { jpeg: ['jpg', 'image/jpeg'], png: ['png', 'image/png'], webp: ['webp', 'image/webp'] };
      if (!formats[metadata.format] || (metadata.pages || 1) !== 1) throw new ApiError('IMAGE_INVALID');
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > config.uploadLimits.pixels) throw new ApiError('IMAGE_TOO_LARGE');
      await sharp(request.file.path, decoderOptions).stats();
      if (request.aborted) throw new ApiError('IMAGE_INVALID');
      const id = crypto.randomUUID();
      storageKey = id.slice(0, 2) + '/' + id + '.' + formats[metadata.format][0];
      const hash = crypto.createHash('sha256');
      for await (const chunk of fs.createReadStream(request.file.path)) hash.update(chunk);
      const image = { id, storageKey, mimeType: formats[metadata.format][1], byteSize: request.file.size, width: metadata.width, height: metadata.height, sha256: hash.digest('hex'), createdAt: Date.now() };
      await storage.commit(request.file.path, storageKey);
      try { await repository.saveImage(request.owner, image, config.uploadLimits.quotaBytes); }
      catch (error) { keepFinal = !error.rollbackConfirmed; throw error; }
      keepFinal = true;
      response.status(201).json({ ok: true, data: { image: publicImage(image) } });
    } catch (error) {
      let safe = error;
      if (error instanceof multer.MulterError) safe = new ApiError(error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'INVALID_REQUEST');
      else if (!(error instanceof ApiError) && !storageKey) safe = new ApiError('IMAGE_INVALID');
      if (!response.headersSent && !response.destroyed) response.status(statusFor(safe.code)).json(errorEnvelope(safe));
    } finally {
      if (request.uploadTemp) await files.unlink(request.uploadTemp).catch(() => {});
      if (storageKey && !keepFinal) await storage.removeUncommitted(storageKey).catch(() => {});
      active--;
    }
  });
  async function imageFor(request) {
    if (!/^[a-f0-9-]{36}$/.test(request.params.id)) throw new ApiError('IMAGE_NOT_FOUND');
    const image = await repository.getImage(request.owner, request.params.id);
    if (!image) throw new ApiError('IMAGE_NOT_FOUND');
    return image;
  }
  app.get('/api/images/:id', authenticate, async (request, response) => {
    response.set('Cache-Control', 'private, no-store').json({ ok: true, data: { image: publicImage(await imageFor(request)) } });
  });
  app.get('/api/images/:id/content', authenticate, async (request, response) => {
    const image = await imageFor(request);
    const objectPath = storage.resolve(image.storageKey);
    try { await files.access(objectPath); } catch { throw new ApiError('IMAGE_NOT_FOUND'); }
    response.set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.byteSize), 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
    try { await pipeline(fs.createReadStream(objectPath), response); } catch { if (!response.destroyed) response.destroy(); }
  });
}
module.exports = { imageRoutes };
