'use strict';

const crypto = require('node:crypto');
const { isIP } = require('node:net');
const { ApiError } = require('./errors.cjs');

// Public OSS regions. Custom endpoints still use one of these regions for V4 signing.
const regions = new Set([
  'oss-cn-hangzhou', 'oss-cn-shanghai', 'oss-cn-nanjing', 'oss-cn-qingdao',
  'oss-cn-beijing', 'oss-cn-zhangjiakou', 'oss-cn-huhehaote', 'oss-cn-wulanchabu',
  'oss-cn-shenzhen', 'oss-cn-heyuan', 'oss-cn-guangzhou', 'oss-cn-chengdu',
  'oss-cn-zhongwei', 'oss-cn-hongkong', 'oss-ap-northeast-1', 'oss-ap-northeast-2',
  'oss-ap-southeast-1', 'oss-ap-southeast-3', 'oss-ap-southeast-5',
  'oss-ap-southeast-6', 'oss-ap-southeast-7', 'oss-ap-southeast-8',
  'oss-sa-east-1', 'oss-eu-central-1', 'oss-eu-west-1', 'oss-eu-west-2',
  'oss-us-west-1', 'oss-us-east-1', 'oss-na-south-1', 'oss-me-east-1', 'oss-me-central-1'
]);
const requestTimeout = () => [10000, 20000];

function endpointUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/[a-z0-9.-]+\/?$/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || isIP(host)) return null;
    if (host.length > 253 || !host.includes('.') || /(^|\.)(localhost|local|internal|lan)$/.test(host)) return null;
    if (host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    if (!/^[a-z]{2,63}$/.test(host.split('.').at(-1))) return null;
    return url;
  } catch { return null; }
}

function settings(config) {
  if (!config || typeof config !== 'object') return null;
  const accessKeyId = typeof config.accessKeyId === 'string' ? config.accessKeyId.trim() : '';
  const accessKeySecret = typeof config.accessKeySecret === 'string' ? config.accessKeySecret.trim() : '';
  const bucket = config.stagingBucket;
  const region = config.stagingRegion === undefined ? 'oss-cn-shanghai' : config.stagingRegion;
  if (!accessKeyId || !accessKeySecret || /\s/.test(accessKeyId) || /\s/.test(accessKeySecret)) return null;
  if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !regions.has(region)) return null;
  if (config.stagingCname !== undefined && typeof config.stagingCname !== 'boolean') return null;
  const cname = config.stagingCname === true;
  const standardEndpoint = 'https://' + region + '.aliyuncs.com';
  const supplied = config.stagingEndpoint !== undefined && config.stagingEndpoint !== '';
  if (cname && !supplied) return null;
  const endpoint = endpointUrl(supplied ? config.stagingEndpoint : standardEndpoint);
  if (!endpoint || !cname && endpoint.origin !== standardEndpoint) return null;
  return { accessKeyId, accessKeySecret, bucket, region, endpoint: endpoint.origin, cname,
    hostname: cname ? endpoint.hostname : bucket + '.' + endpoint.hostname };
}

function signedImageUrl(value, key, configuration) {
  if (typeof value !== 'string') throw new Error();
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== configuration.hostname || url.username || url.password || url.port || url.hash || url.pathname !== '/' + key) throw new Error();
  if (url.searchParams.get('x-oss-signature-version') !== 'OSS4-HMAC-SHA256' || url.searchParams.get('x-oss-expires') !== '300' || !url.searchParams.get('x-oss-signature') || !url.searchParams.get('x-oss-credential')?.startsWith(configuration.accessKeyId + '/')) throw new Error();
  return value;
}

function createCutoutStaging(config = {}, dependencies = {}) {
  const configuration = settings(config);
  let client = dependencies.client;
  const configured = () => Boolean(configuration);
  function warn(message) {
    try { (dependencies.warn || console.warn)(message); } catch {}
  }
  function ossClient() {
    if (!client) {
      const OSS = require('ali-oss');
      const { accessKeyId, accessKeySecret, bucket, region, endpoint, cname } = configuration;
      client = new OSS({ accessKeyId, accessKeySecret, bucket, region, endpoint, cname,
        secure: true, internal: false, authorizationV4: true, retryMax: 0, timeout: 20000 });
    }
    return client;
  }
  async function withImage(buffer, operation) {
    if (!configured()) throw new ApiError('CUTOUT_UNAVAILABLE');
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 3 * 1024 * 1024 || typeof operation !== 'function') throw new ApiError('CUTOUT_FAILED');
    let oss;
    try { oss = ossClient(); }
    catch {
      warn('抠图临时图片暂存失败。');
      throw new ApiError('CUTOUT_UNAVAILABLE');
    }
    const key = 'douyu-cutout-tmp/' + crypto.randomUUID() + '.jpg';
    try {
      let url;
      try {
        await oss.put(key, buffer, { mime: 'image/jpeg', timeout: requestTimeout(),
          headers: { 'x-oss-object-acl': 'private', 'x-oss-forbid-overwrite': 'true', 'Cache-Control': 'no-store' } });
        url = signedImageUrl(await oss.signatureUrlV4('GET', 300, undefined, key), key, configuration);
      } catch {
        warn('抠图临时图片暂存失败。');
        throw new ApiError('CUTOUT_FAILED');
      }
      return await operation(url);
    } finally {
      // A failed upload can still have reached OSS. Never list or delete any other key.
      try { await oss.delete(key, { timeout: requestTimeout() }); }
      catch { warn('抠图临时图片清理未完成，请检查 OSS 生命周期规则。'); }
    }
  }
  return { configured, withImage };
}

module.exports = { createCutoutStaging };
