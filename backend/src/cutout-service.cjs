'use strict';
const { ApiError } = require('./errors.cjs');
const { createCutoutRepository } = require('./cutout-repository.cjs');
const { createCutoutImages } = require('./cutout-images.cjs');
function dto(record) { const { maskHash, ...safe } = record; return safe; }
function createCutoutService({ config, pool, repository, storage, provider }) {
  const cutouts = createCutoutRepository(pool);
  const images = createCutoutImages({ storage, repository, cutoutRepository: cutouts, quota: config.uploadLimits.quotaBytes });
  const pending = new Map();
  let closed = false;
  let running = false;
  let timer;
  function single(key, operation) {
    if (pending.has(key)) return pending.get(key);
    const promise = operation().finally(() => pending.delete(key)); pending.set(key, promise); return promise;
  }
  async function pump() {
    if (running || closed) return;
    running = true;
    try {
      while (!closed) {
        const task = await cutouts.nextTask();
        if (!task) break;
        if (!await cutouts.claimTask(task.id)) break;
        try {
          if (!provider.configured()) throw new ApiError('CUTOUT_UNAVAILABLE');
          const image = await repository.getImage(task.owner, task.inputImageId);
          const mask = await provider.segment(storage.resolve(image.storageKey), image);
          await images.saveTaskMask(task, mask);
        } catch (error) { await cutouts.finishTask(task.id, { errorCode: ['CUTOUT_UNAVAILABLE', 'CUTOUT_FAILED', 'MASK_INVALID', 'QUOTA_EXCEEDED'].includes(error.code) ? error.code : 'CUTOUT_FAILED' }); }
      }
    } catch {} finally { running = false; }
  }
  return {
    capabilities() { return { intelligent: provider.configured(), manual: true, maxEdge: 1024 }; },
    async resume() { await cutouts.recoverInterrupted(); timer = setInterval(pump, 2000).unref(); void pump(); },
    async input(owner, sourceId) { const image = await single(owner + ':input:' + sourceId, () => images.prepareInput(owner, sourceId)); return { imageId: image.id, width: image.width, height: image.height }; },
    async start(owner, sourceId, requestId) {
      const existing = await cutouts.findTask(owner, requestId);
      if (existing) { if (existing.sourceImageId !== sourceId) throw new ApiError('INVALID_REQUEST'); return dto(existing); }
      const input = await this.input(owner, sourceId);
      const cached = await cutouts.findReadyMask(owner, input.imageId);
      if (cached) return dto(cached);
      if (!provider.configured()) throw new ApiError('CUTOUT_UNAVAILABLE');
      const task = await cutouts.enqueueTask(owner, { sourceImageId: sourceId, inputImageId: input.imageId, requestId }, config.cutout);
      void pump(); return dto(task);
    },
    async task(owner, id) { const task = await cutouts.getTask(owner, id); if (!task) throw new ApiError('CUTOUT_NOT_FOUND'); return dto(task); },
    async confirm(owner, sourceId, input, maskPath) { return dto(await images.confirm(owner, sourceId, input, maskPath)); },
    async cutout(owner, id) { const value = await cutouts.getCutout(owner, id); if (!value) throw new ApiError('CUTOUT_NOT_FOUND'); return dto(value); },
    close() { closed = true; clearInterval(timer); }
  };
}
module.exports = { createCutoutService };
