'use strict';
const sharp = require('sharp');
const https = require('node:https');
const dns = require('node:dns/promises');
const { isIP } = require('node:net');
const { ApiError } = require('./errors.cjs');
const { createCutoutStaging } = require('./cutout-staging.cjs');

const MAX_PIXELS = 1024 * 1024;
const MAX_RESULT_BYTES = 8 * 1024 * 1024;
const MAX_MASK_BYTES = 2 * 1024 * 1024;
const RESULT_HOST = /^[a-z0-9-]+\.oss-cn-shanghai\.aliyuncs\.com$/;

function safeResultUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !RESULT_HOST.test(url.hostname)) throw new Error();
    return url;
  } catch { throw new ApiError('CUTOUT_FAILED'); }
}
function normalizeAidgeResultUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !RESULT_HOST.test(url.hostname)) throw new Error();
    // OSS signs the path/query, so a documented HTTP result can use HTTPS without exposing it over HTTP.
    url.protocol = 'https:';
    return safeResultUrl(url);
  } catch { throw new ApiError('CUTOUT_FAILED'); }
}
function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
    a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99) ||
    a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
}
async function fetchResult(value, dependencies = {}) {
  try {
    const url = safeResultUrl(value);
    const addresses = await (dependencies.lookup || dns.lookup)(url.hostname, { all: true, family: 4 });
    if (!addresses.length || addresses.some(({ address, family }) => family !== 4 || !publicIPv4(address))) throw new Error();
    const pinned = { address: addresses[0].address, family: 4 };
    return await new Promise((resolve, reject) => {
      let request; let timer; let settled = false;
      function finish(error, buffer) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) reject(new ApiError('CUTOUT_FAILED')); else resolve(buffer);
      }
      function fail() {
        if (settled) return;
        finish(new Error()); request?.destroy();
      }
      request = (dependencies.get || https.get)(url, {
        lookup: (host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, 4),
        timeout: 10000
      }, response => {
        response.on('error', fail); response.on('aborted', fail);
        if (response.statusCode !== 200 || Number(response.headers['content-length']) > MAX_RESULT_BYTES) { response.destroy(); fail(); return; }
        const chunks = []; let bytes = 0;
        response.on('data', chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > MAX_RESULT_BYTES) { response.destroy(); fail(); return; }
          chunks.push(chunk);
        });
        response.on('end', () => finish(null, Buffer.concat(chunks)));
      });
      request.on('timeout', fail); request.on('error', fail);
      if (!settled) timer = setTimeout(fail, 10000);
    });
  } catch { throw new ApiError('CUTOUT_FAILED'); }
}
function createAidgeRequest(config) {
  const sdk = require('@alicloud/aidge20260428');
  const Credential = require('@alicloud/credentials').default;
  const { Config } = require('@alicloud/openapi-core').$OpenApiUtil;
  const { RuntimeOptions, RetryOptions } = require('@darabonba/typescript');
  const credential = new Credential({ type: 'access_key', accessKeyId: config.accessKeyId.trim(), accessKeySecret: config.accessKeySecret.trim() });
  const client = new sdk.default(new Config({
    credential, endpoint: 'aidge.cn-beijing.aliyuncs.com', regionId: 'cn-beijing', protocol: 'HTTPS',
    retryOptions: new RetryOptions({ retryable: false })
  }));
  const runtime = new RuntimeOptions({ autoretry: false, maxAttempts: 1, readTimeout: 60000, connectTimeout: 10000 });
  // Omitting TargetWidth/TargetHeight preserves the prepared image's size and subject coordinates.
  return imageUrl => client.imageMattingWithOptions(new sdk.ImageMattingRequest({ imageUrl, backGroundType: 'TRANSPARENT' }), runtime);
}
async function resultMask(output, width, height) {
  if (!Buffer.isBuffer(output) || output.length > MAX_RESULT_BYTES) throw new Error();
  const image = sharp(output, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height || (metadata.pages || 1) !== 1 || !metadata.hasAlpha) throw new Error();
  const alpha = await image.extractChannel('alpha').raw({ depth: 'uchar' }).toBuffer();
  if (alpha.length !== width * height || !alpha.some(value => value > 0)) throw new Error();
  const mask = await sharp(alpha, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png({ palette: false }).toBuffer();
  if (mask.length > MAX_MASK_BYTES) throw new Error();
  return mask;
}
function createCutoutProvider(config = {}, dependencies = {}) {
  const staging = dependencies.staging || createCutoutStaging(config);
  const scheduleTimeout = dependencies.setTimeout || setTimeout;
  const cancelTimeout = dependencies.clearTimeout || clearTimeout;
  let draining = Promise.resolve();
  let request = dependencies.request;
  const configured = () => Boolean(config.enabled && config.accessKeyId?.trim() && config.accessKeySecret?.trim() && staging.configured());
  async function segment(inputPath, { width, height } = {}) {
    if (!configured()) throw new ApiError('CUTOUT_UNAVAILABLE');
    if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 256 || Math.max(width, height) > 1024) throw new ApiError('CUTOUT_FAILED');
    // Reserve the next slot before awaiting, including when two callers enter in the same turn.
    const previous = draining;
    let release;
    draining = new Promise(resolve => { release = resolve; });
    await previous;
    let timer;
    let timedOut = false;
    const operation = Promise.resolve().then(async () => {
      const image = sharp(inputPath, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
      const metadata = await image.metadata();
      if (metadata.width !== width || metadata.height !== height || (metadata.pages || 1) !== 1) throw new Error();
      const rgb = await image.flatten({ background: '#ffffff' }).toColourspace('srgb').jpeg({ quality: 90 }).toBuffer();
      if (rgb.length > 3 * 1024 * 1024 || timedOut) throw new Error();
      request ||= createAidgeRequest(config);
      return staging.withImage(rgb, async imageUrl => {
        if (timedOut) throw new Error();
        const response = await request(imageUrl);
        if (timedOut || response?.statusCode !== 200 || response?.body?.success !== true || response.body.code !== 'success' || !response.body.data?.imageUrl) throw new Error();
        const resultUrl = normalizeAidgeResultUrl(response.body.data.imageUrl);
        const output = await (dependencies.fetchResult || fetchResult)(resultUrl.href);
        if (timedOut) throw new Error();
        return resultMask(output, width, height);
      });
    });
    // A timeout must not free the slot while the SDK, downloader or staging cleanup still runs.
    operation.then(release, release);
    try {
      const timeout = new Promise((resolve, reject) => { timer = scheduleTimeout(() => { timedOut = true; reject(new ApiError('CUTOUT_FAILED')); }, 60000); });
      return await Promise.race([operation, timeout]);
    } catch (error) { throw new ApiError(error?.code === 'CUTOUT_UNAVAILABLE' ? 'CUTOUT_UNAVAILABLE' : 'CUTOUT_FAILED'); }
    finally { cancelTimeout(timer); }
  }
  return { configured, segment };
}
module.exports = { createCutoutProvider, safeResultUrl, normalizeAidgeResultUrl, fetchResult };
