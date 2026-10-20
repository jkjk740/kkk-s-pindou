const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCutoutStaging } = require('../backend/src/cutout-staging.cjs');

const config = {
  accessKeyId: 'testAccessKeyId',
  accessKeySecret: 'testAccessKeySecret',
  stagingBucket: 'douyu-private-test',
  stagingRegion: 'oss-cn-shanghai'
};
const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const objectKey = /^douyu-cutout-tmp\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.jpg$/;

function fixture(overrides = {}, configuration = config) {
  const calls = [];
  const warnings = [];
  const client = {
    async put(key, buffer, options) { calls.push({ method: 'put', key, buffer, options }); },
    async signatureUrlV4(method, expires, request, key) {
      calls.push({ method: 'signatureUrlV4', key, verb: method, expires, request });
      const origin = configuration.stagingCname ? configuration.stagingEndpoint : 'https://' + configuration.stagingBucket + '.' + configuration.stagingRegion + '.aliyuncs.com';
      const url = new URL(origin + '/' + key);
      url.searchParams.set('x-oss-credential', configuration.accessKeyId + '/20261017/cn-shanghai/oss/aliyun_v4_request');
      url.searchParams.set('x-oss-expires', String(expires));
      url.searchParams.set('x-oss-signature-version', 'OSS4-HMAC-SHA256');
      url.searchParams.set('x-oss-signature', 'test-only-signature');
      return url.href;
    },
    async delete(key, options) { calls.push({ method: 'delete', key, options }); },
    ...overrides
  };
  const staging = createCutoutStaging(configuration, { client, warn: (...values) => warnings.push(values) });
  return { staging, client, calls, warnings };
}

test('staging requires credentials, a valid bucket and an exact supported public region', async () => {
  assert.equal(createCutoutStaging().configured(), false);
  for (const update of [
    { accessKeyId: '' }, { accessKeySecret: ' ' }, { accessKeyId: null },
    { stagingBucket: 'ab' }, { stagingBucket: 'a'.repeat(64) },
    { stagingBucket: '-private' }, { stagingBucket: 'private-' },
    { stagingBucket: 'Private-bucket' }, { stagingBucket: 'private.bucket' },
    { stagingBucket: ' private-bucket' }, { stagingBucket: 'private/bucket' },
    { stagingRegion: 'cn-shanghai' }, { stagingRegion: 'oss-cn-nowhere' },
    { stagingRegion: 'oss-cn-shanghai-internal' },
    { stagingRegion: 'https://oss-cn-shanghai.aliyuncs.com' },
    { stagingEndpoint: 'https://custom.example.com' },
    { stagingCname: true }, { stagingCname: 'true' },
    { stagingCname: true, stagingEndpoint: 'http://cutout.example.com' },
    { stagingCname: true, stagingEndpoint: 'https://localhost' },
    { stagingCname: true, stagingEndpoint: 'https://images.localhost' },
    { stagingCname: true, stagingEndpoint: 'https://127.0.0.1' },
    { stagingCname: true, stagingEndpoint: 'https://[::1]' },
    { stagingCname: true, stagingEndpoint: 'https://cutout.example.com:443' },
    { stagingCname: true, stagingEndpoint: 'https://cutout.example.com/path' },
    { stagingCname: true, stagingEndpoint: 'https://cutout.example.com?token=bad' },
    { stagingCname: true, stagingEndpoint: 'https://cutout.example.com#bad' },
    { stagingCname: true, stagingEndpoint: 'https://user:password@cutout.example.com' },
    { stagingCname: true, stagingEndpoint: 'https://-bad.example.com' }
  ]) {
    let touched = false;
    const staging = createCutoutStaging({ ...config, ...update }, { client: { put() { touched = true; } } });
    assert.equal(staging.configured(), false);
    await assert.rejects(staging.withImage(image, () => { touched = true; }), { code: 'CUTOUT_UNAVAILABLE' });
    assert.equal(touched, false);
  }
  assert.equal(createCutoutStaging(config).configured(), true);
  assert.equal(createCutoutStaging({ ...config, stagingRegion: 'oss-ap-southeast-1' }).configured(), true);
  assert.equal(createCutoutStaging({ ...config, stagingEndpoint: 'https://oss-cn-shanghai.aliyuncs.com' }).configured(), true);
});

test('staging privately uploads one random JPEG, signs a five minute HTTPS GET and deletes after the operation', async () => {
  const { staging, calls, warnings } = fixture();
  const result = { mask: Buffer.from([127]) };
  const returned = await staging.withImage(image, async value => {
    assert.equal(calls.some(call => call.method === 'delete'), false);
    const url = new URL(value);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'douyu-private-test.oss-cn-shanghai.aliyuncs.com');
    assert.match(url.pathname.slice(1), objectKey);
    assert.equal(url.searchParams.get('x-oss-signature'), 'test-only-signature');
    return result;
  });
  assert.equal(returned, result);
  assert.deepEqual(calls.map(call => call.method), ['put', 'signatureUrlV4', 'delete']);
  const [upload, signature, deletion] = calls;
  assert.match(upload.key, objectKey);
  assert.equal(upload.buffer, image);
  assert.equal(upload.options.mime, 'image/jpeg');
  assert.equal(upload.options.headers['x-oss-object-acl'], 'private');
  assert.equal(upload.options.headers['x-oss-forbid-overwrite'], 'true');
  assert.equal(upload.options.headers['Cache-Control'], 'no-store');
  assert.deepEqual(upload.options.timeout, [10000, 20000]);
  assert.equal(signature.key, upload.key);
  assert.equal(signature.verb, 'GET');
  assert.equal(signature.expires, 300);
  assert.equal(signature.request, undefined);
  assert.equal(deletion.key, upload.key);
  assert.deepEqual(deletion.options.timeout, [10000, 20000]);
  assert.deepEqual(warnings, []);
});

test('an explicitly configured custom HTTPS CNAME signs only the staged object on that domain', async () => {
  const custom = { ...config, stagingCname: true, stagingEndpoint: 'https://cutout.example.com' };
  const { staging, calls } = fixture({}, custom);
  assert.equal(staging.configured(), true);
  await staging.withImage(image, async signedUrl => {
    const url = new URL(signedUrl);
    assert.equal(url.hostname, 'cutout.example.com');
    assert.match(url.pathname.slice(1), objectKey);
    assert.equal(url.searchParams.get('x-oss-expires'), '300');
  });
  assert.equal(calls[2].key, calls[0].key);
});

test('separate staging calls never reuse or delete another call object', async () => {
  const { staging, calls } = fixture();
  await Promise.all([staging.withImage(image, async () => 'first'), staging.withImage(image, async () => 'second')]);
  const uploaded = calls.filter(call => call.method === 'put').map(call => call.key);
  const deleted = calls.filter(call => call.method === 'delete').map(call => call.key);
  assert.equal(new Set(uploaded).size, 2);
  assert.deepEqual(new Set(deleted), new Set(uploaded));
  assert.equal(deleted.length, uploaded.length);
});

test('a task error is preserved after deleting only its temporary image', async () => {
  const { staging, calls, warnings } = fixture();
  const taskError = new Error('task failed');
  taskError.code = 'MASK_INVALID';
  await assert.rejects(staging.withImage(image, async () => { throw taskError; }), error => error === taskError);
  assert.deepEqual(calls.map(call => call.method), ['put', 'signatureUrlV4', 'delete']);
  assert.equal(calls[2].key, calls[0].key);
  assert.deepEqual(warnings, []);
});

test('ambiguous upload failure is not retried and still attempts exact object cleanup', async () => {
  let attempts = 0;
  let uploadedKey;
  const { staging, calls, warnings } = fixture({ async put(key) {
    attempts++;
    uploadedKey = key;
    throw new Error('secret provider failure https://sensitive.example/?Signature=secret');
  } });
  let taskCalled = false;
  await assert.rejects(staging.withImage(image, () => { taskCalled = true; }), error => {
    assert.equal(error.code, 'CUTOUT_FAILED');
    assert.doesNotMatch(error.message, /secret|sensitive|Signature/);
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(attempts, 1);
  assert.equal(taskCalled, false);
  assert.deepEqual(calls.map(call => call.method), ['delete']);
  assert.equal(calls[0].key, uploadedKey);
  assert.deepEqual(warnings, [['抠图临时图片暂存失败。']]);
});

test('signature failure is sanitized and the uploaded private image is deleted', async () => {
  const { staging, calls, warnings } = fixture({ async signatureUrlV4() { throw new Error('sensitive signing details'); } });
  await assert.rejects(staging.withImage(image, () => assert.fail('task must not start')), { code: 'CUTOUT_FAILED' });
  assert.deepEqual(calls.map(call => call.method), ['put', 'delete']);
  assert.equal(calls[1].key, calls[0].key);
  assert.deepEqual(warnings, [['抠图临时图片暂存失败。']]);
});

test('unsigned, insecure or unexpected object URLs never reach the provider operation', async () => {
  for (const transform of [
    url => url.replace('https:', 'http:'),
    url => url.replace('.aliyuncs.com/', '.aliyuncs.com.evil.test/'),
    url => url.replace('/douyu-cutout-tmp/', '/different-prefix/'),
    url => url.split('?')[0],
    url => url.replace('https://', 'https://user:password@')
  ]) {
    const { staging, client, calls } = fixture();
    const sign = client.signatureUrlV4;
    client.signatureUrlV4 = async (...values) => transform(await sign(...values));
    await assert.rejects(staging.withImage(image, () => assert.fail('task must not start')), { code: 'CUTOUT_FAILED' });
    assert.equal(calls.filter(call => call.method === 'delete').length, 1);
  }
});

test('cleanup failure logs only a fixed message and preserves a successful task result', async () => {
  let deletions = 0;
  const { staging, warnings } = fixture({ async delete() { deletions++; throw new Error('secret object URL'); } });
  const result = { imageId: 'finished' };
  assert.equal(await staging.withImage(image, async () => result), result);
  assert.equal(deletions, 1);
  assert.deepEqual(warnings, [['抠图临时图片清理未完成，请检查 OSS 生命周期规则。']]);
});

test('cleanup or logging failure cannot replace the original task error', async () => {
  const taskError = new Error('original task error');
  const { client } = fixture({ async delete() { throw new Error('secret cleanup response'); } });
  const staging = createCutoutStaging(config, { client, warn() { throw new Error('logger unavailable'); } });
  await assert.rejects(staging.withImage(image, async () => { throw taskError; }), error => error === taskError);
});

test('invalid or oversized image buffers are rejected before any OSS request', async () => {
  const { staging, calls } = fixture();
  for (const value of [null, 'local-file.jpg', Buffer.alloc(0), Buffer.alloc(3 * 1024 * 1024 + 1)]) {
    await assert.rejects(staging.withImage(value, () => assert.fail('task must not start')), { code: 'CUTOUT_FAILED' });
  }
  await assert.rejects(staging.withImage(image, null), { code: 'CUTOUT_FAILED' });
  assert.deepEqual(calls, []);
});
