'use strict';
const sharp = require('sharp');
const http = require('node:http');
const { ApiError } = require('./errors.cjs');

// 本机 rembg 服务（backend/cutout-sidecar）返回与工作副本同尺寸的单通道灰度 PNG。
const MAX_PIXELS = 1024 * 1024;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_MASK_BYTES = 2 * 1024 * 1024;
const MODELS = new Set(['u2net', 'u2netp', 'silueta']);
const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);

function sidecarUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.username || url.password || !LOOPBACK.has(url.hostname) || url.pathname !== '/' || url.search || url.hash) throw new Error('CUTOUT_REMBG_URL 只能是本机 loopback 的 http 地址');
  return url;
}
function unavailable() { return new ApiError('CUTOUT_UNAVAILABLE'); }
function failed() { return new ApiError('CUTOUT_FAILED'); }

// 单次 HTTP 请求：限制响应字节、总时长，绝不跟随重定向。
function call(base, { method = 'GET', path, body, contentType, timeoutMs, maxBytes }, transport = http.request) {
  return new Promise(resolve => {
    let settled = false; let timer; let request;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (result.status === undefined) request?.destroy();
      resolve(result);
    };
    try {
      request = transport(new URL(path, base), {
        method, agent: false,
        headers: body ? { 'Content-Type': contentType, 'Content-Length': body.length } : {}
      }, response => {
        const chunks = []; let bytes = 0;
        const declared = Number(response.headers['content-length']);
        if (declared > maxBytes) { response.destroy(); finish({ error: 'TOO_LARGE' }); return; }
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) { response.destroy(); finish({ error: 'TOO_LARGE' }); return; }
          chunks.push(chunk);
        });
        response.on('error', () => finish({ error: 'NETWORK' }));
        response.on('aborted', () => finish({ error: 'NETWORK' }));
        response.on('end', () => finish({ status: response.statusCode, type: String(response.headers['content-type'] || ''), body: Buffer.concat(chunks) }));
      });
      request.on('error', error => finish({ error: error?.code === 'ECONNREFUSED' ? 'DOWN' : 'NETWORK' }));
      timer = setTimeout(() => finish({ error: 'TIMEOUT' }), timeoutMs);
      request.end(body);
    } catch { finish({ error: 'NETWORK' }); }
  });
}

async function validateMask(output, width, height) {
  if (!Buffer.isBuffer(output) || output.length > MAX_MASK_BYTES) throw new Error();
  const image = sharp(output, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height || (metadata.pages || 1) !== 1 || metadata.channels !== 1 || metadata.hasAlpha) throw new Error();
  const values = await image.extractChannel(0).raw({ depth: 'uchar' }).toBuffer();
  if (values.length !== width * height || !values.some(value => value > 0)) throw new Error();
  const mask = await sharp(values, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png({ palette: false }).toBuffer();
  if (mask.length > MAX_MASK_BYTES) throw new Error();
  return mask;
}

function createRembgCutoutProvider(config = {}, dependencies = {}) {
  const settings = config.rembg || {};
  const base = sidecarUrl(settings.url || 'http://127.0.0.1:3101/');
  const timeoutMs = settings.timeoutMs || 45000;
  const healthTimeoutMs = settings.healthTimeoutMs || 3000;
  const waitingLimit = settings.queue || 4;
  const transport = dependencies.request || http.request;
  let healthy = false;
  let checking = null;
  let timer = null;
  let draining = Promise.resolve();
  let pending = 0;

  async function refresh() {
    if (!config.enabled) { healthy = false; return false; }
    checking ||= call(base, { path: '/health', timeoutMs: healthTimeoutMs, maxBytes: 4096 }, transport).then(result => {
      let body = null;
      try { body = result.status === 200 ? JSON.parse(result.body.toString('utf8')) : null; } catch {}
      healthy = body?.ok === true && MODELS.has(body.model);
      return healthy;
    }).finally(() => { checking = null; });
    return checking;
  }
  if (config.enabled && dependencies.poll !== false) {
    void refresh();
    timer = (dependencies.setInterval || setInterval)(() => { void refresh(); }, settings.healthIntervalMs || 15000);
    timer?.unref?.();
  }
  // 能力查询保持同步：只读取最近一次健康检查结果，服务不可用时只关闭智能按钮，不影响 /health/ready。
  const configured = () => Boolean(config.enabled && healthy);

  async function segment(inputPath, { width, height } = {}) {
    if (!configured()) throw unavailable();
    if (!Number.isInteger(width) || !Number.isInteger(height) || Math.min(width, height) < 16 || Math.max(width, height) > 1024) throw failed();
    // 一个执行中 + 最多 waitingLimit 个等待，超出直接让前端改用手动工具。
    if (pending > waitingLimit) throw unavailable();
    pending++;
    // 与 Aidge 供应商相同：同一时刻只发一个推理请求，先占位再等待。
    const previous = draining;
    let release;
    draining = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const image = sharp(inputPath, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
      const metadata = await image.metadata().catch(() => { throw failed(); });
      if (metadata.width !== width || metadata.height !== height || (metadata.pages || 1) !== 1) throw failed();
      // 透明区域合成白底后无损发送，坐标与工作副本一致。
      const body = await image.flatten({ background: '#ffffff' }).toColourspace('srgb').png({ compressionLevel: 1 }).toBuffer().catch(() => { throw failed(); });
      if (body.length > MAX_INPUT_BYTES) throw failed();
      const result = await call(base, { method: 'POST', path: '/v1/mask', body, contentType: 'image/png', timeoutMs, maxBytes: MAX_MASK_BYTES }, transport);
      if (result.error === 'DOWN') { healthy = false; throw unavailable(); }
      if (result.status === 503) { void refresh(); throw unavailable(); }
      if (result.status !== 200 || !result.type.startsWith('image/png')) throw failed();
      return await validateMask(result.body, width, height).catch(() => { throw failed(); });
    } catch (error) {
      throw error?.code === 'CUTOUT_UNAVAILABLE' ? unavailable() : failed();
    } finally { pending--; release(); }
  }
  function close() { if (timer) (dependencies.clearInterval || clearInterval)(timer); timer = null; }
  return { configured, segment, refresh, close };
}
module.exports = { createRembgCutoutProvider, sidecarUrl, validateMask };
