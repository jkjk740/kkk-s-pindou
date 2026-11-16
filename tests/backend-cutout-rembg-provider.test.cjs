const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('../backend/node_modules/sharp');
const { decodeMask } = require('../backend/src/cutout-images.cjs');
const { createRembgCutoutProvider, sidecarUrl } = require('../backend/src/cutout-rembg-provider.cjs');
const { createCutoutService } = require('../backend/src/cutout-service.cjs');
const { loadConfig } = require('../backend/src/config.cjs');

const dimensions = { width: 300, height: 200 };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
async function input(size = dimensions) { return sharp({ create: { ...size, channels: 4, background: { r: 90, g: 140, b: 40, alpha: 0.5 } } }).png().toBuffer(); }
async function grayMask(size = dimensions, fill = index => [0, 64, 128, 255][index % 4]) {
  const pixels = Buffer.alloc(size.width * size.height);
  for (let index = 0; index < pixels.length; index++) pixels[index] = fill(index);
  return sharp(pixels, { raw: { ...size, channels: 1 } }).toColourspace('b-w').png().toBuffer();
}
// 用真实的本机 HTTP 服务模拟 sidecar，覆盖请求格式、状态码和响应校验。
async function sidecar(handler, health = { ok: true, model: 'u2net' }) {
  const seen = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', async () => {
      const body = Buffer.concat(chunks);
      seen.push({ method: request.method, url: request.url, type: request.headers['content-type'], body });
      if (request.url === '/health') {
        if (typeof health === 'number') { response.writeHead(health).end(); return; }
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(health)); return;
      }
      try { await handler(request, response, body); } catch { response.destroy(); }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, seen, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
function png(buffer, status = 200) { return (request, response) => response.writeHead(status, { 'Content-Type': 'image/png', 'Content-Length': buffer.length }).end(buffer); }
async function provider(url, overrides = {}) {
  const value = createRembgCutoutProvider({ enabled: true, rembg: { url, timeoutMs: 2000, healthTimeoutMs: 500, queue: 4, ...overrides } }, { poll: false });
  await value.refresh();
  return value;
}

test('sidecar URL must be plain loopback HTTP', () => {
  for (const value of ['http://127.0.0.1:3101', 'http://localhost:3101/', 'http://[::1]:3101']) assert.equal(sidecarUrl(value).protocol, 'http:');
  for (const value of ['https://127.0.0.1:3101', 'http://10.0.0.5:3101', 'http://0.0.0.0:3101', 'http://example.com', 'http://user:p@127.0.0.1:3101', 'http://127.0.0.1:3101/api', 'http://127.0.0.1.evil.test']) assert.throws(() => sidecarUrl(value));
});

test('config selects provider and rejects unknown values', () => {
  assert.equal(loadConfig({}).cutout.provider, 'aidge');
  const config = loadConfig({ CUTOUT_PROVIDER: 'rembg', CUTOUT_AI_ENABLED: 'true' }).cutout;
  assert.equal(config.provider, 'rembg'); assert.equal(config.enabled, true);
  assert.deepEqual(config.rembg, { url: 'http://127.0.0.1:3101', timeoutMs: 45000, queue: 4, healthIntervalMs: 15000 });
  assert.throws(() => loadConfig({ CUTOUT_PROVIDER: 'bria-rmbg' }));
  assert.throws(() => loadConfig({ CUTOUT_REMBG_TIMEOUT_MS: '10' }));
});

test('capabilities follow sidecar health without throwing', async () => {
  const mock = await sidecar(png(Buffer.alloc(0)));
  try {
    const disabled = createRembgCutoutProvider({ enabled: false, rembg: { url: mock.url } }, { poll: false });
    assert.equal(await disabled.refresh(), false); assert.equal(disabled.configured(), false);
    const value = await provider(mock.url);
    assert.equal(value.configured(), true);
    const service = createCutoutService({ config: { uploadLimits: { quotaBytes: 1 }, cutout: { queue: 8, daily: 10 } }, pool: {}, storage: {}, repository: {}, provider: value });
    assert.deepEqual(service.capabilities(), { intelligent: true, manual: true, maxEdge: 1024 }); service.close();
  } finally { await mock.close(); }
  for (const health of [500, { ok: true, model: 'bria-rmbg' }, { ok: false, model: 'u2net' }]) {
    const other = await sidecar(png(Buffer.alloc(0)), health);
    try { assert.equal((await provider(other.url)).configured(), false); } finally { await other.close(); }
  }
  const down = await sidecar(png(Buffer.alloc(0)));
  const url = down.url; await down.close();
  const value = await provider(url);
  assert.equal(value.configured(), false);
  await assert.rejects(value.segment(await input(), dimensions), { code: 'CUTOUT_UNAVAILABLE' });
});

test('flattened PNG is sent and a single-channel mask is returned in the original coordinates', async () => {
  const mask = await grayMask();
  const mock = await sidecar(png(mask));
  try {
    const value = await provider(mock.url);
    const result = await value.segment(await input(), dimensions);
    const request = mock.seen.find(item => item.url === '/v1/mask');
    assert.equal(request.method, 'POST'); assert.equal(request.type, 'image/png');
    const sent = await sharp(request.body).metadata();
    assert.equal(sent.format, 'png'); assert.equal(sent.width, 300); assert.equal(sent.height, 200); assert.equal(sent.hasAlpha, false);
    const metadata = await sharp(result).metadata();
    assert.equal(metadata.format, 'png'); assert.equal(metadata.hasAlpha, false); assert.equal(metadata.channels, 1);
    assert.deepEqual(Array.from((await decodeMask(result, 300, 200)).subarray(0, 4)), [0, 64, 128, 255]);
  } finally { await mock.close(); }
});

test('invalid, empty, resized, RGB or oversized masks fail so the client falls back to manual tools', async () => {
  const rgb = await sharp({ create: { ...dimensions, channels: 3, background: '#808080' } }).png().toBuffer();
  const alpha = await sharp({ create: { ...dimensions, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const replies = [
    png(await grayMask({ width: 299, height: 200 })), png(await grayMask(dimensions, () => 0)), png(rgb), png(alpha), png(Buffer.from('not a png')),
    png(await grayMask(), 500), png(await grayMask(), 504), png(await grayMask(), 400),
    (request, response) => response.writeHead(200, { 'Content-Type': 'application/json' }).end('{}'),
    (request, response) => response.writeHead(200, { 'Content-Type': 'image/png' }).end(Buffer.alloc(2 * 1024 * 1024 + 1)),
    (request, response) => response.writeHead(302, { Location: 'http://127.0.0.1:1/' }).end(),
    (request, response) => response.destroy()
  ];
  for (const reply of replies) {
    const mock = await sidecar(reply);
    try { await assert.rejects((await provider(mock.url)).segment(await input(), dimensions), { code: 'CUTOUT_FAILED' }); }
    finally { await mock.close(); }
  }
});

test('busy sidecar maps to unavailable and wrong input never reaches it', async () => {
  const mock = await sidecar((request, response) => response.writeHead(503, { 'Content-Type': 'application/json' }).end('{"ok":false,"error":"BUSY"}'));
  try {
    const value = await provider(mock.url);
    await assert.rejects(value.segment(await input(), dimensions), { code: 'CUTOUT_UNAVAILABLE' });
    const before = mock.seen.filter(item => item.url === '/v1/mask').length;
    for (const size of [{ width: 300, height: 201 }, { width: 15, height: 200 }, { width: 300, height: 1025 }, { width: 300.5, height: 200 }]) await assert.rejects(value.segment(await input(), size), { code: 'CUTOUT_FAILED' });
    assert.equal(mock.seen.filter(item => item.url === '/v1/mask').length, before);
  } finally { await mock.close(); }
});

test('slow inference times out as failed and requests are serialized with a bounded wait queue', async () => {
  const slow = await sidecar(() => {});
  try { await assert.rejects((await provider(slow.url, { timeoutMs: 100 })).segment(await input(), dimensions), { code: 'CUTOUT_FAILED' }); }
  finally { await slow.close(); }

  const mask = await grayMask(); const gate = deferred(); const started = deferred();
  let active = 0; let maximum = 0; let requests = 0;
  const mock = await sidecar(async (request, response) => {
    active++; maximum = Math.max(maximum, active);
    if (++requests === 1) { started.resolve(); await gate.promise; }
    active--; png(mask)(request, response);
  });
  try {
    const value = await provider(mock.url, { queue: 2 });
    const original = await input();
    const tasks = [value.segment(original, dimensions), value.segment(original, dimensions), value.segment(original, dimensions)];
    await started.promise;
    await assert.rejects(value.segment(original, dimensions), { code: 'CUTOUT_UNAVAILABLE' });
    gate.resolve();
    for (const result of await Promise.all(tasks)) assert.equal((await sharp(result).metadata()).width, 300);
    assert.equal(maximum, 1); assert.equal(requests, 3);
  } finally { await mock.close(); }
});

test('health polling uses the injected timer and close stops it', async () => {
  const intervals = []; let cleared = null;
  const value = createRembgCutoutProvider({ enabled: true, rembg: { url: 'http://127.0.0.1:9', healthIntervalMs: 1234, healthTimeoutMs: 200 } }, {
    setInterval: (callback, ms) => { intervals.push(ms); return 'timer'; }, clearInterval: timer => { cleared = timer; }
  });
  assert.deepEqual(intervals, [1234]);
  assert.equal(await value.refresh(), false);
  value.close(); assert.equal(cleared, 'timer');
});
