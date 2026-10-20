'use strict';
const sharp = require('sharp');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { ApiError } = require('./errors.cjs');
async function decodeMask(buffer, width, height) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length > 2097152) throw new Error();
    const image = sharp(buffer, { limitInputPixels: 1048576, failOn: 'warning' });
    const metadata = await image.metadata();
    if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height || (metadata.pages || 1) !== 1) throw new Error();
    const raw = await image.toColourspace('srgb').ensureAlpha().raw().toBuffer();
    const values = Buffer.alloc(width * height);
    let visible = false;
    for (let index = 0; index < values.length; index++) {
      const offset = index * 4;
      if (raw[offset] !== raw[offset + 1] || raw[offset] !== raw[offset + 2] || raw[offset + 3] !== 255) throw new Error();
      values[index] = raw[offset]; visible ||= values[index] > 0;
    }
    if (!visible) throw new Error();
    return values;
  } catch { throw new ApiError('MASK_INVALID'); }
}
function composeRgba(original, values) {
  const result = Buffer.from(original);
  for (let index = 0; index < values.length; index++) result[index * 4 + 3] = Math.round(original[index * 4 + 3] * values[index] / 255);
  return result;
}
function createCutoutImages({ storage, repository, cutoutRepository, quota }) {
  async function artifact(buffer, width, height) {
    const id = crypto.randomUUID();
    const storageKey = id.slice(0, 2) + '/' + id + '.png';
    const temp = path.join(storage.tempDir, id + '.upload');
    try { await fs.writeFile(temp, buffer, { mode: 0o600 }); await storage.commit(temp, storageKey); }
    catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
    return { id, storageKey, byteSize: buffer.length, width, height, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  }
  async function persist(owner, buffers, width, height, operation) {
    const artifacts = [];
    let databaseStarted = false;
    try {
      for (const buffer of buffers) artifacts.push(await artifact(buffer, width, height));
      databaseStarted = true;
      const result = await cutoutRepository.persistImages(owner, artifacts, quota, operation(artifacts));
      if (result.existing) for (const image of artifacts) await storage.removeUncommitted(image.storageKey).catch(() => {});
      return result.value;
    } catch (error) {
      if (!databaseStarted || error.rollbackConfirmed) for (const image of artifacts) await storage.removeUncommitted(image.storageKey).catch(() => {});
      throw error;
    }
  }
  async function prepareInput(owner, sourceId) {
    const existing = await cutoutRepository.getInput(owner, sourceId);
    if (existing) return repository.getImage(owner, existing.inputImageId);
    const source = await repository.getImage(owner, sourceId);
    if (!source) throw new ApiError('IMAGE_NOT_FOUND');
    const { data, info } = await sharp(storage.resolve(source.storageKey), { limitInputPixels: 20000000 }).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().png().toBuffer({ resolveWithObject: true });
    const mapping = await persist(owner, [data], info.width, info.height, images => ({ find: connection => cutoutRepository.getInput(owner, sourceId, connection), insert: connection => cutoutRepository.saveInput(connection, owner, sourceId, images[0].id) }));
    return repository.getImage(owner, mapping.inputImageId);
  }
  async function confirm(owner, sourceId, input, maskPath) {
    const mapping = await cutoutRepository.getInput(owner, sourceId);
    if (mapping?.inputImageId !== input.inputImageId) throw new ApiError('INVALID_REQUEST');
    const image = await repository.getImage(owner, input.inputImageId);
    if (!image) throw new ApiError('IMAGE_NOT_FOUND');
    const buffer = await fs.readFile(maskPath);
    const values = await decodeMask(buffer, image.width, image.height);
    const original = await sharp(storage.resolve(image.storageKey)).ensureAlpha().raw().toBuffer();
    const raw = composeRgba(original, values);
    if (!raw.some((value, index) => index % 4 === 3 && value >= 100)) throw new ApiError('MASK_INVALID');
    const mask = await sharp(values, { raw: { width: image.width, height: image.height, channels: 1 } }).png().toBuffer();
    const result = await sharp(raw, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
    const maskHash = crypto.createHash('sha256').update(mask).digest('hex');
    function same(previous) {
      if (previous && (previous.sourceImageId !== sourceId || previous.inputImageId !== input.inputImageId || previous.maskHash !== maskHash)) throw new ApiError('INVALID_REQUEST');
      return previous;
    }
    const previous = same(await cutoutRepository.findConfirmation(owner, input.requestId));
    if (previous) return previous;
    return persist(owner, [mask, result], image.width, image.height, images => ({ find: async connection => same(await cutoutRepository.findConfirmation(owner, input.requestId, connection)), insert: connection => cutoutRepository.saveConfirmation(connection, owner, { id: crypto.randomUUID(), sourceImageId: sourceId, inputImageId: image.id, maskImageId: images[0].id, resultImageId: images[1].id, requestId: input.requestId, maskHash }) }));
  }
  async function saveTaskMask(task, buffer) {
    const image = await repository.getImage(task.owner, task.inputImageId);
    const values = await decodeMask(buffer, image.width, image.height);
    const mask = await sharp(values, { raw: { width: image.width, height: image.height, channels: 1 } }).png().toBuffer();
    return persist(task.owner, [mask], image.width, image.height, images => ({ find: async () => null, insert: async connection => { await cutoutRepository.finishTask(task.id, { maskImageId: images[0].id }, connection); return images[0].id; } }));
  }
  return { prepareInput, confirm, saveTaskMask };
}
module.exports = { createCutoutImages, decodeMask, composeRgba };
