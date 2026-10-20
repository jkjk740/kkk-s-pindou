const { test } = require('node:test');
const assert = require('node:assert/strict');
const { savePayload, validateRequest } = require('../backend/src/validation.cjs');
const { createApi } = require('../backend/src/api.cjs');
const { issueSession, readConfig } = require('../backend/src/session.cjs');
const { createCutoutService } = require('../backend/src/cutout-service.cjs');
const colors = require('../backend/src/mard-codes.json');
const imageId = 'aa111111-1111-4111-8111-111111111111';
const cutoutId = 'bb111111-1111-4111-8111-111111111111';
const env = { WECHAT_APPID: 'wx0ebba69092706cc6', WECHAT_APP_SECRET: 'test-only-app-secret', SESSION_SECRET: 'test-only-secret-'.repeat(4) };
const pattern = { version: 1, paletteId: 'mard-221', name: '高清', width: 128, height: 128, beadSize: 2.6, cells: Array.from({ length: 16384 }, (_, index) => colors[index % colors.length]) };
test('new Node API accepts 128 grid and request bodies above 64KiB within 256KiB', () => {
  const request = { action: 'works.save', payload: { work: { id: 'large', pattern, completedRows: [], sourceImageId: imageId, cutoutId }, baseRevision: 0 } };
  assert.ok(Buffer.byteLength(JSON.stringify(request)) > 65536);
  validateRequest(request);
  assert.equal(savePayload(request.payload).work.cutoutId, cutoutId);
  assert.throws(() => validateRequest({ action: 'works.save', payload: { content: 'x'.repeat(262144) } }), { code: 'PAYLOAD_TOO_LARGE' });
});
test('source mismatch rejects owned cutout and valid reference survives DTO', async () => {
  const owner = 'u_' + 'a'.repeat(64); const token = issueSession(owner, readConfig(env), Date.now()).token;
  let matching = false;
  const repository = { get: async () => null, getImage: async () => ({ id: imageId }), getCutout: async () => ({ sourceImageId: matching ? imageId : 'other' }), compareAndSwap: async () => true };
  const api = createApi({ repository, env });
  const request = { action: 'works.save', payload: { work: { id: 'large', pattern, completedRows: [], sourceImageId: imageId, cutoutId }, baseRevision: 0 } };
  assert.equal((await api(request, { authorization: 'Bearer ' + token })).error.code, 'INVALID_REQUEST');
  matching = true;
  assert.equal((await api(request, { authorization: 'Bearer ' + token })).data.work.cutoutId, cutoutId);
});
test('missing AI credentials cannot prevent construction of manual service', () => {
  const service = createCutoutService({ config: { uploadLimits: { quotaBytes: 104857600 }, cutout: { queue: 8, daily: 10 } }, pool: {}, storage: {}, repository: {}, provider: { configured: () => false } });
  assert.deepEqual(service.capabilities(), { intelligent: false, manual: true, maxEdge: 1024 }); service.close();
});
