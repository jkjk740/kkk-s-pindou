'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
function createStorage(root) {
  const directory = path.resolve(root);
  const tempDir = path.join(directory, '.tmp');
  function resolve(storageKey) {
    if (!/^[a-f0-9]{2}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(storageKey)) throw new Error('无效对象标识');
    return path.join(directory, storageKey);
  }
  return {
    tempDir,
    async prepare() {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
      const cutoff = Date.now() - 15 * 60 * 1000;
      for (const entry of await fs.readdir(tempDir, { withFileTypes: true })) {
        if (!entry.isFile() || !/^[a-f0-9-]{36}\.upload$/.test(entry.name)) continue;
        const filePath = path.join(tempDir, entry.name);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) await fs.unlink(filePath);
      }
    },
    resolve,
    async commit(tempPath, storageKey) {
      const destination = resolve(storageKey);
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.chmod(tempPath, 0o600);
      await fs.rename(tempPath, destination);
    },
    async removeUncommitted(storageKey) { await fs.unlink(resolve(storageKey)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  };
}
module.exports = { createStorage };
