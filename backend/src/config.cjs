'use strict';

const path = require('node:path');
function number(value, fallback, minimum, maximum) {
  const result = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) throw new Error('服务数字配置无效');
  return result;
}
function choice(value, fallback, allowed) {
  const result = value === undefined || value === '' ? fallback : value;
  if (!allowed.includes(result)) throw new Error('服务选项配置无效');
  return result;
}
function loadConfig(env = process.env) {
  return {
    host: env.HOST || '127.0.0.1',
    port: number(env.PORT, 3001, 1, 65535),
    trustProxyLoopback: env.TRUST_PROXY_LOOPBACK === 'true',
    mysql: {
      host: env.DB_HOST || '127.0.0.1', port: number(env.DB_PORT, 3306, 1, 65535),
      database: env.DB_NAME || 'bead_island', user: env.DB_USER || 'bead_island_app', password: env.DB_PASSWORD || '',
      charset: 'utf8mb4', connectionLimit: 4, connectTimeout: 8000, waitForConnections: true, queueLimit: 32,
      supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false
    },
    auth: { WECHAT_APPID: env.WECHAT_APPID, WECHAT_APP_SECRET: env.WECHAT_APP_SECRET, SESSION_SECRET: env.SESSION_SECRET },
    uploadDir: path.resolve(__dirname, '..', env.UPLOAD_DIR || './data/private-images'),
    communityDir: path.resolve(__dirname, '../data/community-thumbnails'),
    uploadLimits: { bytes: 10 * 1024 * 1024, pixels: 20000000, quotaBytes: 100 * 1024 * 1024, concurrent: 2 },
    cutout: {
      enabled: env.CUTOUT_AI_ENABLED === 'true',
      // aidge：阿里云 Aidge 付费抠图；rembg：本机 backend/cutout-sidecar（U-2-Net，CPU）。
      provider: choice(env.CUTOUT_PROVIDER, 'aidge', ['aidge', 'rembg']),
      rembg: {
        url: env.CUTOUT_REMBG_URL || 'http://127.0.0.1:3101',
        timeoutMs: number(env.CUTOUT_REMBG_TIMEOUT_MS, 45000, 1000, 120000),
        queue: number(env.CUTOUT_REMBG_QUEUE_LIMIT, 4, 1, 32),
        healthIntervalMs: number(env.CUTOUT_REMBG_HEALTH_INTERVAL_MS, 15000, 1000, 300000)
      },
      accessKeyId: env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
      accessKeySecret: env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
      stagingBucket: env.CUTOUT_OSS_BUCKET || '',
      stagingRegion: env.CUTOUT_OSS_REGION || '',
      stagingEndpoint: env.CUTOUT_OSS_ENDPOINT || '',
      stagingCname: env.CUTOUT_OSS_CNAME === 'true',
      daily: number(env.CUTOUT_DAILY_LIMIT, 10, 1, 100),
      queue: number(env.CUTOUT_QUEUE_LIMIT, 8, 1, 32)
    }
  };
}
module.exports = { loadConfig };
