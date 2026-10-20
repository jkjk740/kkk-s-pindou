const INDEX = 'bead-island-works-index-v2';
const LEGACY = 'bead-island-works-v1';
const PREFIX = 'bead-island-work-v2:';
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => encodeURIComponent(value).replace(/%[A-F\d]{2}/g, '_').length;
export function createWorkStore(platform) {
  function entries() {
    const index = platform.getStorageSync(INDEX);
    if (!index) return null;
    if (index.version !== 2 || !Array.isArray(index.entries) || index.entries.some(entry => typeof entry.id !== 'string' || typeof entry.key !== 'string' || !entry.key.startsWith(PREFIX)) || new Set(index.entries.map(entry => entry.id)).size !== index.entries.length) throw new Error('作品索引无法读取，请保留应用数据');
    return index.entries;
  }
  function readAll() {
    const index = entries();
    if (!index) {
      const legacy = platform.getStorageSync(LEGACY);
      if (!legacy) return [];
      if (!Array.isArray(legacy)) throw new Error('作品数据无法读取，请保留应用数据');
      return copy(legacy);
    }
    return index.map(entry => {
      const record = platform.getStorageSync(entry.key);
      if (!record || record.id !== entry.id || typeof record !== 'object') throw new Error('作品数据无法读取，请保留应用数据');
      return copy(record);
    });
  }
  function writeAll(records) {
    if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string') || new Set(records.map(record => record.id)).size !== records.length) throw new Error('作品数据无效');
    if (records.filter(record => !record.deleted).length > 40) throw new Error('最多保存 40 份作品，请先整理');
    if (bytes(JSON.stringify(records)) > 5 * 1024 * 1024) throw new Error('作品空间不足，请先导出并整理作品');
    const previous = entries() || [];
    const staged = [];
    const next = [];
    try {
      for (const record of records) {
        const existing = previous.find(entry => entry.id === record.id);
        if (existing && JSON.stringify(platform.getStorageSync(existing.key)) === JSON.stringify(record)) { next.push(existing); continue; }
        const key = PREFIX + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2) + ':' + next.length;
        platform.setStorageSync(key, copy(record));
        staged.push(key); next.push({ id: record.id, key });
      }
      platform.setStorageSync(INDEX, { version: 2, entries: next });
    } catch (error) {
      staged.forEach(key => { try { platform.removeStorageSync?.(key); } catch {} });
      throw new Error('保存空间不足或暂不可用，原作品仍保留');
    }
    const retained = new Set(next.map(entry => entry.key));
    previous.forEach(entry => { if (!retained.has(entry.key)) { try { platform.removeStorageSync?.(entry.key); } catch {} } });
  }
  return { readAll, writeAll };
}
