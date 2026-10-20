const { createHash } = require('node:crypto');

const env = {
  WECHAT_APPID: 'wx0ebba69092706cc6',
  WECHAT_APP_SECRET: 'test-only-wechat-secret',
  SESSION_SECRET: 'test-only-session-secret-at-least-32-bytes'
};

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pattern(overrides = {}) {
  return Object.assign({
    version: 1, paletteId: 'mard-221', name: '小猫', width: 2, height: 2,
    beadSize: 2.6, cells: ['H1', null, 'B1', 'H1']
  }, overrides);
}

function work(id = 'cat-1', overrides = {}) {
  return Object.assign({ id, pattern: pattern(), completedRows: [0] }, overrides);
}

function memoryRepository() {
  const records = new Map();
  const key = (owner, clientId) => JSON.stringify([owner, clientId]);
  return {
    records,
    async get(owner, clientId) { return clone(records.get(key(owner, clientId)) || null); },
    async compareAndSwap(owner, clientId, baseRevision, next) {
      const current = records.get(key(owner, clientId));
      if ((!current && baseRevision !== 0) || (current && current.revision !== baseRevision)) return false;
      records.set(key(owner, clientId), clone(next));
      return true;
    },
    async list(owner, after, limit) {
      return [...records.values()]
        .filter(record => record.owner === owner && (!after || record.clientId > after))
        .sort((left, right) => left.clientId < right.clientId ? -1 : 1)
        .slice(0, limit).map(clone);
    }
  };
}

function fixture(overrides = {}) {
  const { createApi } = require('../uniCloud-alipay/cloudfunctions/bead-island/lib/api.js');
  let currentTime = 1700000000000;
  const repository = overrides.repository || memoryRepository();
  const exchanges = [];
  const api = createApi(Object.assign({
    env, repository, clock: () => currentTime,
    exchange: async (code, config) => {
      exchanges.push({ code, config });
      return { openid: `openid-${code}`, session_key: 'must-never-escape' };
    }
  }, overrides));
  return {
    api, repository, exchanges,
    advance(milliseconds) { currentTime += milliseconds; },
    async login(code = 'alice') {
      const result = await api({ action: 'auth.login', payload: { code } }, {});
      if (!result.ok) throw new Error(JSON.stringify(result));
      return result.data;
    },
    request(action, payload, token) {
      return api({ action, payload }, token ? { authorization: `Bearer ${token}` } : {});
    }
  };
}

function databaseDouble() {
  const records = new Map();
  const operations = [];
  let failure;
  const command = {
    gt: value => ({ operator: 'gt', value }),
    set: value => ({ operator: 'set', value })
  };
  function matches(record, conditions) {
    return Object.entries(conditions).every(([field, expected]) =>
      expected && expected.operator === 'gt' ? record[field] > expected.value : record[field] === expected);
  }
  function query(collection, conditions = {}, order = null, limit = 100) {
    return {
      where(value) { return query(collection, value, order, limit); },
      orderBy(field, direction) { return query(collection, conditions, { field, direction }, limit); },
      limit(value) { return query(collection, conditions, order, value); },
      async get() {
        if (failure) throw failure;
        operations.push({ operation: 'get', collection, conditions: clone(conditions), order, limit });
        const items = [...records.values()].filter(record => matches(record, conditions));
        if (order) items.sort((left, right) => left[order.field] < right[order.field] ? -1 : 1);
        return { data: items.slice(0, limit).map(clone) };
      },
      async add(record) {
        if (failure) throw failure;
        operations.push({ operation: 'add', collection, record: clone(record) });
        if (records.has(record._id)) throw new Error('duplicate _id');
        records.set(record._id, clone(record));
        return { id: record._id };
      },
      async update(patch) {
        if (failure) throw failure;
        operations.push({ operation: 'update', collection, conditions: clone(conditions), patch: clone(patch) });
        let updated = 0;
        for (const record of records.values()) {
          if (!matches(record, conditions)) continue;
          for (const [field, value] of Object.entries(patch)) {
            record[field] = clone(value && value.operator === 'set' ? value.value : value);
          }
          updated += 1;
        }
        return { updated };
      }
    };
  }
  return {
    records, operations, command,
    collection(name) { return query(name); },
    fail(error) { failure = error; },
    databaseId(owner, clientId) {
      return createHash('sha256').update(JSON.stringify([owner, clientId])).digest('hex');
    }
  };
}

module.exports = { env, clone, pattern, work, fixture, memoryRepository, databaseDouble };
