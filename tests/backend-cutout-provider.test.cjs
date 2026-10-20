const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const sharp = require('../backend/node_modules/sharp');
const { decodeMask } = require('../backend/src/cutout-images.cjs');
const { safeResultUrl, normalizeAidgeResultUrl, fetchResult, createCutoutProvider } = require('../backend/src/cutout-provider.cjs');

const dimensions = { width: 256, height: 256 };
const resultUrl = 'https://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com/result.png?signature=example';
const stagedUrl = 'https://private-input.oss-cn-beijing.aliyuncs.com/input.jpg?signature=example';
const config = { enabled: true, accessKeyId: 'test-id', accessKeySecret: 'test-secret' };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function response(overrides = {}) {
  return { statusCode: 200, headers: {}, body: { success: true, code: 'success', message: '', requestId: 'test-request', data: { imageUrl: resultUrl, width: 256, height: 256, score: 0.99, usageMap: { ProcessedImageCount: 1 } }, ...overrides } };
}
function staging(overrides = {}) {
  return { configured: () => true, withImage: async (buffer, operation) => operation(stagedUrl), ...overrides };
}
async function input() { return sharp({ create: { ...dimensions, channels: 4, background: { r: 90, g: 140, b: 40, alpha: 0.5 } } }).png().toBuffer(); }
async function transparentResult() {
  const pixels = Buffer.alloc(256 * 256 * 4);
  for (let index = 0; index < 256 * 256; index++) {
    pixels[index * 4] = 13; pixels[index * 4 + 1] = 72; pixels[index * 4 + 2] = 191;
    pixels[index * 4 + 3] = [0, 64, 128, 255][index % 4];
  }
  return sharp(pixels, { raw: { ...dimensions, channels: 4 } }).png().toBuffer();
}
function transport({ statusCode = 200, headers = {}, chunks = [] }, inspect = () => {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const request = new EventEmitter();
    request.destroy = error => queueMicrotask(() => request.emit('error', error || new Error('destroyed')));
    queueMicrotask(() => {
      const stream = new PassThrough();
      stream.statusCode = statusCode; stream.headers = headers;
      callback(stream);
      for (const chunk of chunks) if (!stream.destroyed) stream.write(chunk);
      if (!stream.destroyed) stream.end();
    });
    return request;
  };
}

test('intelligent cutout is unavailable until both Aidge and private staging are configured', () => {
  assert.equal(createCutoutProvider({ enabled: false }, { staging: staging() }).configured(), false);
  assert.equal(createCutoutProvider({ ...config, accessKeySecret: ' ' }, { staging: staging() }).configured(), false);
  assert.equal(createCutoutProvider(config, { staging: staging({ configured: () => false }) }).configured(), false);
  assert.equal(createCutoutProvider(config, { staging: staging() }).configured(), true);
});

test('only Shanghai OSS result links can be normalized and HTTP is upgraded without changing its signature', () => {
  const http = 'http://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com/a%2Fb.png?Signature=a%2Bb&Expires=123';
  assert.equal(normalizeAidgeResultUrl(http).href, 'https://dashscope-7c2c.oss-cn-shanghai.aliyuncs.com/a%2Fb.png?Signature=a%2Bb&Expires=123');
  for (const url of [http, 'https://localhost/a', 'https://127.0.0.1/a', 'https://bucket.oss-cn-shanghai.aliyuncs.com.evil.test/a', 'https://bucket.oss-cn-shanghai-internal.aliyuncs.com/a', 'https://bucket.oss-cn-beijing.aliyuncs.com/a', 'https://user:secret@bucket.oss-cn-shanghai.aliyuncs.com/a', 'https://bucket.oss-cn-shanghai.aliyuncs.com:8443/a']) assert.throws(() => safeResultUrl(url), { code: 'CUTOUT_FAILED' });
  for (const url of ['http://localhost/a', 'http://bucket.oss-cn-shanghai.aliyuncs.com.evil.test/a', 'http://user:secret@bucket.oss-cn-shanghai.aliyuncs.com/a', 'http://bucket.oss-cn-shanghai.aliyuncs.com:8080/a', 'ftp://bucket.oss-cn-shanghai.aliyuncs.com/a']) assert.throws(() => normalizeAidgeResultUrl(url), { code: 'CUTOUT_FAILED' });
  assert.equal(safeResultUrl(resultUrl).protocol, 'https:');
});

test('result downloads reject nonpublic DNS addresses before opening a connection', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '100.64.0.1', '192.0.2.1', '198.18.0.1', '203.0.113.1', '224.0.0.1', '::1']) {
    let opened = false;
    await assert.rejects(fetchResult(resultUrl, { lookup: async () => [{ address, family: address === '::1' ? 6 : 4 }], get: () => { opened = true; throw new Error('unexpected connection'); } }), { code: 'CUTOUT_FAILED' });
    assert.equal(opened, false);
  }
});

test('result download pins the validated DNS address and never follows redirects or oversized bodies', async () => {
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }, { address: '1.1.1.1', family: 4 }];
  const buffer = await fetchResult(resultUrl, { lookup, get: transport({ chunks: [Buffer.from('png')] }, (url, options) => {
    assert.equal(url.protocol, 'https:');
    options.lookup(url.hostname, {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    options.lookup(url.hostname, { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]); });
  }) });
  assert.equal(buffer.toString(), 'png');
  for (const reply of [{ statusCode: 302, headers: { location: 'http://127.0.0.1/' } }, { headers: { 'content-length': String(8 * 1024 * 1024 + 1) } }, { chunks: [Buffer.alloc(8 * 1024 * 1024), Buffer.from([1])] }]) await assert.rejects(fetchResult(resultUrl, { lookup, get: transport(reply) }), { code: 'CUTOUT_FAILED' });
});

test('Aidge transparent PNG becomes an opaque grayscale mask in the original coordinates', async () => {
  const output = await transparentResult();
  const provider = createCutoutProvider(config, {
    staging: staging({ withImage: async (buffer, operation) => {
      const metadata = await sharp(buffer).metadata();
      assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.width, 256); assert.equal(metadata.height, 256); assert.equal(metadata.hasAlpha, false);
      return operation(stagedUrl);
    } }),
    request: async url => { assert.equal(url, stagedUrl); return response({ data: { imageUrl: resultUrl.replace('https:', 'http:'), width: 256, height: 256, score: 0.99, usageMap: { ProcessedImageCount: 1 } } }); },
    fetchResult: async url => { assert.equal(String(url), resultUrl); return output; }
  });
  const mask = await provider.segment(await input(), dimensions);
  const metadata = await sharp(mask).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.hasAlpha, false); assert.equal(metadata.depth, 'uchar');
  assert.deepEqual(Array.from((await decodeMask(mask, 256, 256)).subarray(0, 4)), [0, 64, 128, 255]);
  assert.ok(mask.length <= 2 * 1024 * 1024);
});

test('narrow or incorrectly described input fails before any image is staged', async () => {
  let uploaded = false;
  const provider = createCutoutProvider(config, { staging: staging({ withImage: async () => { uploaded = true; throw new Error(); } }) });
  const original = await input();
  for (const size of [{ width: 255, height: 256 }, { width: 256, height: 1025 }, { width: 256.5, height: 256 }, { width: 257, height: 256 }]) await assert.rejects(provider.segment(original, size), { code: 'CUTOUT_FAILED' });
  assert.equal(uploaded, false);
});

test('failed Aidge responses never download a result and a failed request is not retried', async () => {
  let downloads = 0;
  for (const reply of [response({ success: false }), response({ code: 'Error' }), response({ data: {} }), { ...response(), statusCode: 500 }]) {
    const provider = createCutoutProvider(config, { staging: staging(), request: async () => reply, fetchResult: async () => { downloads++; throw new Error(); } });
    await assert.rejects(provider.segment(await input(), dimensions), { code: 'CUTOUT_FAILED' });
  }
  assert.equal(downloads, 0);
  let requests = 0;
  const provider = createCutoutProvider(config, { staging: staging(), request: async () => { requests++; throw new Error('upstream failed'); } });
  await assert.rejects(provider.segment(await input(), dimensions), { code: 'CUTOUT_FAILED' });
  assert.equal(requests, 1);
});

test('missing transparency, changed dimensions and oversized results cannot become a selection mask', async () => {
  const opaque = await sharp({ create: { ...dimensions, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const wrongSize = await sharp({ create: { width: 255, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const empty = await sharp({ create: { ...dimensions, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  for (const output of [opaque, wrongSize, empty, Buffer.alloc(8 * 1024 * 1024 + 1)]) {
    const provider = createCutoutProvider(config, { staging: staging(), request: async () => response(), fetchResult: async () => output });
    await assert.rejects(provider.segment(await input(), dimensions), { code: 'CUTOUT_FAILED' });
  }
});

test('two tasks submitted in the same turn cannot stage or request images concurrently', async () => {
  const started = deferred(); const upstream = deferred();
  const original = await input(); const output = await transparentResult();
  let requests = 0; let active = 0; let maximum = 0;
  const provider = createCutoutProvider(config, {
    staging: staging({ withImage: async (buffer, operation) => {
      active++; maximum = Math.max(maximum, active);
      try { return await operation(stagedUrl); } finally { active--; }
    } }),
    request: async () => { if (++requests === 1) { started.resolve(); return upstream.promise; } return response(); },
    fetchResult: async () => output
  });
  const first = provider.segment(original, dimensions);
  const second = provider.segment(original, dimensions);
  await started.promise;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
  upstream.resolve(response());
  await Promise.all([first, second]);
  assert.equal(requests, 2); assert.equal(maximum, 1); assert.equal(active, 0);
});

test('a timed-out task drains the request and private-object cleanup before the next task starts', async () => {
  const started = deferred(); const upstream = deferred(); const cleanupStarted = deferred(); const cleanup = deferred();
  const output = await transparentResult();
  const timers = []; let requests = 0; let uploads = 0;
  const provider = createCutoutProvider(config, {
    staging: staging({ withImage: async (buffer, operation) => {
      const number = ++uploads;
      try { return await operation(stagedUrl); }
      finally { if (number === 1) { cleanupStarted.resolve(); await cleanup.promise; } }
    } }),
    request: async () => { if (++requests === 1) { started.resolve(); return upstream.promise; } return response(); },
    fetchResult: async () => output,
    setTimeout: callback => { timers.push(callback); return callback; }, clearTimeout: () => {}
  });
  const original = await input();
  const first = assert.rejects(provider.segment(original, dimensions), { code: 'CUTOUT_FAILED' });
  await started.promise;
  timers[0](); await first;
  const second = provider.segment(original, dimensions);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1); assert.equal(uploads, 1);
  upstream.resolve(response()); await cleanupStarted.promise;
  assert.equal(requests, 1); assert.equal(uploads, 1);
  cleanup.resolve();
  assert.deepEqual(Array.from((await decodeMask(await second, 256, 256)).subarray(0, 4)), [0, 64, 128, 255]);
  assert.equal(requests, 2); assert.equal(uploads, 2);
});
