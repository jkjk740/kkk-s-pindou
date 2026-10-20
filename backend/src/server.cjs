'use strict';

const mysql = require('mysql2/promise');
const fs = require('node:fs/promises');
const { assertReady } = require('./readiness.cjs');
const { loadConfig } = require('./config.cjs');
const { createRepository } = require('./repository.cjs');
const { createStorage } = require('./storage.cjs');
const { createApp } = require('./app.cjs');
async function start() {
  const config = loadConfig();
  const pool = mysql.createPool(config.mysql);
  const storage = createStorage(config.uploadDir);
  try {
    await storage.prepare();
    await fs.mkdir(config.communityDir, { recursive: true });
    await assertReady(config, pool, storage);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const app = createApp({ config, pool, storage, repository: createRepository(pool) });
  await app.cutoutService.resume();
  const server = app.listen(config.port, config.host, () => process.stdout.write(`豆屿后端监听 ${config.host}:${config.port}\n`));
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.on('error', () => { process.stderr.write('后端监听失败，请检查端口和配置。\n'); pool.end().finally(() => process.exit(1)); });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    app.cutoutService.close();
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(() => pool.end().finally(() => { clearTimeout(timeout); process.exit(0); }));
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
start().catch(() => { process.stderr.write('后端启动失败，请检查本项目环境配置、MySQL 连接及社区数据库迁移。\n'); process.exitCode = 1; });
