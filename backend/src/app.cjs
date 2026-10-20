'use strict';

const express = require('express');
const { assertReady } = require('./readiness.cjs');
const { ApiError, errorEnvelope, statusFor } = require('./errors.cjs');
const { readConfig, verifySession } = require('./session.cjs');
const { createApi } = require('./api.cjs');
const { exchange } = require('./wechat.cjs');
const { imageRoutes } = require('./images.cjs');
const { profileRoutes } = require('./profile.cjs');
const { communityRoutes } = require('./community.cjs');
const { createCommunityRepository } = require('./community-repository.cjs');
const { createCommunityImages } = require('./community-images.cjs');
const { createCutoutProvider } = require('./cutout-provider.cjs');
const { createCutoutService } = require('./cutout-service.cjs');
const { cutoutRoutes } = require('./cutout.cjs');
function createApp({ config, pool, repository, storage }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyLoopback) app.set('trust proxy', 'loopback');
  app.use((request, response, next) => { response.set('X-Content-Type-Options', 'nosniff'); next(); });
  const buckets = new Map();
  function rateLimit(category, maximum, windowMs, key = request => request.ip) {
    return (request, response, next) => {
      const now = Date.now();
      if (buckets.size >= 4096) for (const [name, bucket] of buckets) if (bucket.until <= now) buckets.delete(name);
      const name = category + ':' + key(request);
      let bucket = buckets.get(name);
      if (!bucket || bucket.until <= now) {
        if (buckets.size >= 4096 && !bucket) return next(new ApiError('RATE_LIMITED'));
        bucket = { count: 0, until: now + windowMs }; buckets.set(name, bucket);
      }
      if (++bucket.count > maximum) { response.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))); return next(new ApiError('RATE_LIMITED')); }
      next();
    };
  }
  function authenticate(request, response, next) {
    try { request.owner = verifySession(request.headers.authorization, readConfig(config.auth), Date.now()); next(); }
    catch (error) { next(error); }
  }
  const api = createApi({ repository, env: config.auth, exchange });
  app.post('/api/sync', rateLimit('sync', 120, 60000), express.json({ limit: '256kb', strict: true }), (request, response, next) => {
    if (request.body?.action === 'auth.login') return rateLimit('login', 20, 60000)(request, response, next);
    next();
  }, async (request, response) => {
    const result = await api(request.body, request.headers);
    response.set('Cache-Control', 'no-store').status(result.ok ? 200 : statusFor(result.error.code)).json(result);
  });
  imageRoutes(app, { repository, storage, config, authenticate, rateLimit });
  app.cutoutService = createCutoutService({ config, pool, repository, storage, provider: createCutoutProvider(config.cutout) });
  cutoutRoutes(app, { service: app.cutoutService, storage, authenticate, rateLimit });
  profileRoutes(app, { repository, authenticate, rateLimit });
  communityRoutes(app, { repository, config, authenticate, rateLimit, communityRepository: createCommunityRepository(pool), communityImages: createCommunityImages(config.communityDir) });
  app.get('/health/live', (request, response) => response.json({ ok: true }));
  app.get('/health/ready', async (request, response) => {
    try {
      await assertReady(config, pool, storage);
      response.json({ ok: true });
    } catch { response.status(503).json({ ok: false }); }
  });
  app.use((request, response) => response.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '接口不存在。' } }));
  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    const safe = error.type === 'entity.too.large' ? new ApiError('PAYLOAD_TOO_LARGE') : error.type === 'entity.parse.failed' ? new ApiError('INVALID_REQUEST') : error;
    response.status(statusFor(safe.code)).json(errorEnvelope(safe));
  });
  return app;
}
module.exports = { createApp };
