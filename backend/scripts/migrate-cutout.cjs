'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const mysql = require('mysql2/promise');
const { loadConfig } = require('../src/config.cjs');
async function migrate() {
  const { mysql: target } = loadConfig();
  if (target.host !== '127.0.0.1' || target.port !== 3306 || target.database !== 'bead_island' || target.user !== 'bead_island_app') throw new Error('目标必须是本机 3306/bead_island');
  const admin = {};
  const file = process.env.MYSQL_ADMIN_CNF || path.join(os.homedir(), '.local/etc/mysql/private/root-client.cnf');
  for (const line of (await fs.readFile(file, 'utf8')).split(/\r?\n/)) {
    const match = /^\s*(user|password|host|port)\s*=(.*)$/.exec(line);
    if (match) admin[match[1]] = match[2].trim();
  }
  if (admin.user !== 'root' || admin.host !== '127.0.0.1' || admin.port !== '3306' || !admin.password) throw new Error('管理员目标不匹配');
  const connection = await mysql.createConnection({ ...admin, port: 3306, database: 'bead_island', multipleStatements: false });
  try {
    const sql = await fs.readFile(path.join(__dirname, '../sql/migrations/2026-10-09-cutout.sql'), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) {
      if (statement.startsWith('ALTER TABLE')) {
        const [columns] = await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'bead_island' AND TABLE_NAME = 'bead_works' AND COLUMN_NAME = 'cutout_id'");
        if (columns.length) continue;
      }
      await connection.query(statement);
    }
    for (const table of ['bead_cutout_inputs', 'bead_cutouts', 'bead_cutout_tasks', 'bead_cutout_lock']) await connection.query(`GRANT SELECT, INSERT, UPDATE ON bead_island.${table} TO 'bead_island_app'@'127.0.0.1'`);
    process.stdout.write('豆屿抠图增量结构已写入，原图和作品保留。\n');
  } finally { await connection.end(); }
}
migrate().catch(() => { process.stderr.write('抠图迁移未完成，请检查本机管理员配置；不会重置密码或清空数据。\n'); process.exitCode = 1; });
