'use strict';

const { loadConfig } = require('../src/config.cjs');
const { createCommunityImages } = require('../src/community-images.cjs');
const { SYSTEM_AUTHOR, getDemoPatterns } = require('../src/demo-patterns.cjs');
const { pattern: validatePattern } = require('../src/validation.cjs');

const LOCK_NAME = 'bead-island:seed-community:v1';

function assertLocalTarget(config) {
  const target = config.mysql;
  if (target.host !== '127.0.0.1' || target.port !== 3306 || target.database !== 'bead_island' || target.socketPath) {
    throw new Error('seed 目标必须是本机 127.0.0.1:3306/bead_island');
  }
}

async function precheck(connection) {
  await connection.execute('SELECT id, app_id, display_name, created_at, updated_at, last_login_at FROM bead_users LIMIT 0');
  await connection.execute('SELECT id, owner, client_id, source_image_id, origin_public_id, pattern, completed_rows, created_at, updated_at, revision, deleted FROM bead_works LIMIT 0');
  await connection.execute('SELECT id, owner, source_work_id, source_revision, title, pattern, thumbnail_key, download_count, created_at, published_at, updated_at, withdrawn FROM bead_public_works LIMIT 0');
  const [tables] = await connection.execute('SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?)',
    ['bead_island', 'bead_users', 'bead_works', 'bead_public_works']);
  if (tables.length !== 3 || tables.some(table => table.ENGINE !== 'InnoDB')) throw new Error('seed 需要完整的 InnoDB 社区表；请先完成社区迁移');
}

function assertSource(source, demo) {
  if (source.id !== demo.sourceWorkId || source.owner !== SYSTEM_AUTHOR.id || source.client_id !== demo.clientId ||
      source.deleted || source.origin_public_id || source.source_image_id || Number(source.revision) !== 1 ||
      JSON.stringify(validatePattern(typeof source.pattern === 'string' ? JSON.parse(source.pattern) : source.pattern)) !== JSON.stringify(demo.pattern)) {
    throw new Error('系统图纸标识已被占用或源作品已更改；seed 不会覆盖既有作品');
  }
}

async function seedCommunity({ config, pool, images = createCommunityImages(config.communityDir), clock = Date.now }) {
  assertLocalTarget(config);
  const demos = getDemoPatterns();
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('seed 时间无效');
  const connection = await pool.getConnection();
  const createdKeys = [];
  let locked = false, transaction = false, committing = false, discarded = false;
  try {
    await precheck(connection);
    const [locks] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
    if (Number(locks[0].acquired) !== 1) throw new Error('另一个社区 seed 正在执行，请稍后重试');
    locked = true;
    await connection.beginTransaction();
    transaction = true;
    const [users] = await connection.execute('SELECT * FROM bead_users WHERE id = ? FOR UPDATE', [SYSTEM_AUTHOR.id]);
    if (users.length) {
      if (users[0].app_id !== SYSTEM_AUTHOR.appId || users[0].display_name !== SYSTEM_AUTHOR.displayName) throw new Error('系统作者标识冲突；seed 不会修改既有用户');
    } else {
      await connection.execute('INSERT INTO bead_users (id, app_id, display_name, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)',
        [SYSTEM_AUTHOR.id, SYSTEM_AUTHOR.appId, SYSTEM_AUTHOR.displayName, now, now, now]);
    }
    let inserted = 0, skipped = 0;
    for (const demo of demos) {
      const [publicWorks] = await connection.execute('SELECT * FROM bead_public_works WHERE id = ? OR (owner = ? AND source_work_id = ?) FOR UPDATE',
        [demo.publicId, SYSTEM_AUTHOR.id, demo.sourceWorkId]);
      if (publicWorks.length) {
        if (publicWorks.length !== 1 || publicWorks[0].id !== demo.publicId || publicWorks[0].owner !== SYSTEM_AUTHOR.id || publicWorks[0].source_work_id !== demo.sourceWorkId) {
          throw new Error('公开图纸标识冲突；seed 不会修改既有作品');
        }
        skipped += 1;
        continue;
      }
      const [sources] = await connection.execute('SELECT * FROM bead_works WHERE id = ? OR (owner = ? AND client_id = ?) FOR UPDATE',
        [demo.sourceWorkId, SYSTEM_AUTHOR.id, demo.clientId]);
      if (sources.length) {
        if (sources.length !== 1) throw new Error('系统源作品标识冲突');
        assertSource(sources[0], demo);
      } else {
        await connection.execute('INSERT INTO bead_works (id, owner, client_id, source_image_id, origin_public_id, pattern, completed_rows, created_at, updated_at, revision, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [demo.sourceWorkId, SYSTEM_AUTHOR.id, demo.clientId, null, null, JSON.stringify(demo.pattern), '[]', now, now, 1, false]);
      }
      const thumbnail = await images.create(demo.pattern);
      createdKeys.push(thumbnail.storageKey);
      await connection.execute('INSERT INTO bead_public_works (id, owner, source_work_id, source_revision, title, pattern, thumbnail_key, download_count, created_at, published_at, updated_at, withdrawn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [demo.publicId, SYSTEM_AUTHOR.id, demo.sourceWorkId, 1, demo.title, JSON.stringify(demo.pattern), thumbnail.storageKey, 0, now, now, now, false]);
      inserted += 1;
    }
    committing = true;
    await connection.commit();
    transaction = false;
    return { inserted, skipped };
  } catch (error) {
    let rollbackConfirmed = !transaction;
    if (transaction) {
      try { await connection.rollback(); rollbackConfirmed = true; } catch {
        error.rollbackUncertain = true;
        connection.destroy();
        discarded = true;
        locked = false;
      }
    }
    let removable = rollbackConfirmed && !committing ? createdKeys : [];
    if (createdKeys.length && (committing || !rollbackConfirmed)) {
      try {
        const [references] = await pool.execute('SELECT thumbnail_key FROM bead_public_works WHERE thumbnail_key IN (' + createdKeys.map(() => '?').join(', ') + ')', createdKeys);
        const referenced = new Set(references.map(row => row.thumbnail_key));
        removable = createdKeys.filter(key => !referenced.has(key));
      } catch { error.cleanupUncertain = true; }
    }
    for (const key of removable) {
      try { await images.removeTemporary(key); } catch { error.cleanupUncertain = true; }
    }
    throw error;
  } finally {
    if (locked) {
      try { await connection.execute('SELECT RELEASE_LOCK(?) AS released', [LOCK_NAME]); } catch {
        connection.destroy();
        discarded = true;
      }
    }
    if (!discarded) connection.release();
  }
}

async function main() {
  const config = loadConfig();
  assertLocalTarget(config);
  const pool = require('mysql2/promise').createPool(config.mysql);
  try {
    const result = await seedCommunity({ config, pool });
    process.stdout.write(`豆屿图纸：新增 ${result.inserted} 份，跳过 ${result.skipped} 份；新增图纸下载数为 0。\n`);
  } finally { await pool.end(); }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('社区 seed 未完成，请检查 backend/.env 的本机 3306/bead_island 连接、社区迁移和缩略图目录权限；不会覆盖既有作品或重置下载量。\n');
    if (error.cleanupUncertain || error.rollbackUncertain) process.stderr.write('数据库或文件清理状态暂无法确认，已保留可能被引用的 PNG；请恢复连接后检查并幂等重试。\n');
    process.exitCode = 1;
  });
}

module.exports = { seedCommunity, assertLocalTarget };
