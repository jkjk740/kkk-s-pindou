'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
async function provision() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env');
  let existing = null;
  try { existing = await fs.readFile(envPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing) throw new Error('本项目 .env 已存在，请保留配置；不重复初始化或覆盖密码。');
  const adminPath = path.join(os.homedir(), '.local/etc/mysql/private/root-client.cnf');
  const admin = {};
  for (const line of (await fs.readFile(adminPath, 'utf8')).split(/\r?\n/)) {
    const match = /^\s*(user|password|host|port)\s*=(.*)$/.exec(line);
    if (match) admin[match[1]] = match[2].trim();
  }
  if (admin.user !== 'root' || admin.host !== '127.0.0.1' || admin.port !== '3306' || !admin.password) throw new Error('只接受本机 3306 的已恢复管理员配置。');
  const connection = await mysql.createConnection({ host: admin.host, port: 3306, user: admin.user, password: admin.password, multipleStatements: false });
  const password = crypto.randomBytes(32).toString('hex');
  const sessionSecret = crypto.randomBytes(48).toString('hex');
  try {
    const [accounts] = await connection.execute("SELECT User FROM mysql.user WHERE User = 'bead_island_app' AND Host = '127.0.0.1'");
    if (accounts.length) throw new Error('专用账号已存在但没有本项目配置，停止以免覆盖账号。');
    const sql = await fs.readFile(path.join(root, 'sql/schema.sql'), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await connection.query(statement);
    await connection.query("CREATE USER 'bead_island_app'@'127.0.0.1' IDENTIFIED BY ?", [password]);
    await connection.query("GRANT SELECT, INSERT, UPDATE ON bead_island.bead_users TO 'bead_island_app'@'127.0.0.1'");
    await connection.query("GRANT SELECT, INSERT ON bead_island.bead_images TO 'bead_island_app'@'127.0.0.1'");
    await connection.query("GRANT SELECT, INSERT, UPDATE ON bead_island.bead_works TO 'bead_island_app'@'127.0.0.1'");
    await connection.query("GRANT SELECT, INSERT, UPDATE ON bead_island.bead_public_works TO 'bead_island_app'@'127.0.0.1'");
    await connection.query("GRANT SELECT, INSERT, UPDATE, DELETE ON bead_island.bead_public_downloads TO 'bead_island_app'@'127.0.0.1'");
    const contents = `HOST=127.0.0.1\nPORT=3001\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=bead_island\nDB_USER=bead_island_app\nDB_PASSWORD=${password}\nWECHAT_APPID=wx0ebba69092706cc6\nWECHAT_APP_SECRET=\nSESSION_SECRET=${sessionSecret}\nUPLOAD_DIR=./data/private-images\n`;
    await fs.writeFile(envPath, contents, { mode: 0o600, flag: 'wx' });
    process.stdout.write('已实施豆屿专用库、表、应用账号及私有 .env；未运行测试或连通性验证。请填写 WECHAT_APP_SECRET。\n');
  } finally { await connection.end(); }
}
provision().catch(error => {
  const allowed = ['本项目 .env', '专用账号已存在', '只接受本机'];
  process.stderr.write(allowed.some(prefix => error.message?.startsWith(prefix)) ? error.message + '\n' : '初始化未完成，请检查管理员文件和 MySQL 配置；不会重置已有密码。\n');
  process.exitCode = 1;
});
