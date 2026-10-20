'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const mysql = require('mysql2/promise');
const { loadConfig } = require('../src/config.cjs');
async function migrate() {
  const config = loadConfig();
  if (config.mysql.host !== '127.0.0.1' || config.mysql.port !== 3306 || config.mysql.database !== 'bead_island' || config.mysql.user !== 'bead_island_app') throw new Error('目标必须是本机 3306/bead_island');
  const admin = {};
  const adminFile = process.env.MYSQL_ADMIN_CNF || path.join(os.homedir(), '.local/etc/mysql/private/root-client.cnf');
  for (const line of (await fs.readFile(adminFile, 'utf8')).split(/\r?\n/)) {
    const match = /^\s*(user|password|host|port)\s*=(.*)$/.exec(line);
    if (match) admin[match[1]] = match[2].trim();
  }
  if (admin.user !== 'root' || admin.host !== '127.0.0.1' || admin.port !== '3306' || !admin.password) throw new Error('只接受本机 3306 管理员配置');
  const connection = await mysql.createConnection({ host: admin.host, port: 3306, user: admin.user, password: admin.password, database: 'bead_island', multipleStatements: false });
  try {
    const source = await fs.readFile(path.join(__dirname, '../sql/migrations/2026-10-09-community.sql'), 'utf8');
    for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) {
      const alter = /^ALTER TABLE (bead_users|bead_works) ADD COLUMN (display_name|origin_public_id)\b/.exec(statement);
      if (alter) {
        const [columns] = await connection.execute('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?', ['bead_island', alter[1], alter[2]]);
        if (columns.length) continue;
      }
      await connection.query(statement);
    }
    await connection.query("GRANT SELECT, INSERT, UPDATE ON bead_island.bead_public_works TO 'bead_island_app'@'127.0.0.1'");
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON bead_island.bead_public_downloads TO 'bead_island_app'@'127.0.0.1'");
    process.stdout.write('豆屿社区增量结构已写入，既有作品和原图未清空。\n');
  } finally { await connection.end(); }
}
migrate().catch(() => { process.stderr.write('社区迁移未完成，请检查本机管理员配置和 bead_island；不会重置密码或清空数据。\n'); process.exitCode = 1; });
