'use strict';
const express = require('express');
const { ApiError } = require('./errors.cjs');
function profileRoutes(app, { repository, authenticate, rateLimit }) {
  app.get('/api/profile', authenticate, async (request, response) => response.set('Cache-Control', 'no-store').json({ ok: true, data: await repository.getProfile(request.owner) }));
  app.patch('/api/profile', authenticate, rateLimit('profile', 12, 60000, request => request.owner), express.json({ limit: '2kb' }), async (request, response) => {
    const body = request.body;
    if (!body || Object.keys(body).length !== 1 || typeof body.displayName !== 'string') throw new ApiError('INVALID_REQUEST');
    const displayName = body.displayName.trim();
    if (!displayName || Array.from(displayName).length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(displayName)) throw new ApiError('INVALID_REQUEST');
    response.json({ ok: true, data: await repository.updateProfile(request.owner, displayName, Date.now()) });
  });
}
module.exports = { profileRoutes };
