'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('../backend/node_modules/sharp');
const { pattern: validatePattern } = require('../backend/src/validation.cjs');
const { createCommunityImages } = require('../backend/src/community-images.cjs');
const { loadConfig } = require('../backend/src/config.cjs');

function databaseFixture(options = {}) {
  let tables = { bead_users: new Map(), bead_works: new Map(), bead_public_works: new Map() };
  let snapshot;
  let writes = 0;
  let destroyed = false;
  const connection = {
    async execute(sql, values = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: options.lockBusy ? 0 : 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('LIMIT 0')) {
        if (options.notReady) throw new Error('missing schema');
        return [[]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[...Object.keys(tables).map(name => ({ TABLE_NAME: name, ENGINE: options.engine || 'InnoDB' }))]];
      }
      if (sql.startsWith('SELECT')) {
        const table = /FROM (bead_\w+)/.exec(sql)[1];
        const records = [...tables[table].values()];
        if (sql.includes('thumbnail_key IN')) return [records.filter(row => values.includes(row.thumbnail_key))];
        if (table === 'bead_works') return [records.filter(row => row.id === values[0] || (row.owner === values[1] && row.client_id === values[2]))];
        if (table === 'bead_public_works') return [records.filter(row => row.id === values[0] || (row.owner === values[1] && row.source_work_id === values[2]))];
        return [records.filter(row => row.id === values[0])];
      }
      const insert = /^INSERT INTO (bead_\w+) \(([^)]+)\) VALUES/.exec(sql);
      assert.ok(insert, 'seed must only insert missing rows');
      writes += 1;
      if (options.failInsert === writes) throw new Error('insert failed');
      const columns = insert[2].split(',').map(column => column.trim());
      assert.equal(columns.length, values.length);
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      assert.ok(!tables[insert[1]].has(row.id), 'duplicate IDs must not be inserted');
      tables[insert[1]].set(row.id, row);
      return [{ affectedRows: 1 }];
    },
    async beginTransaction() { snapshot = structuredClone(tables); },
    async commit() {
      if (options.commitAfterSuccess) { snapshot = undefined; throw new Error('commit response lost'); }
      if (options.failCommit) throw new Error('commit failed');
      snapshot = undefined;
    },
    async rollback() {
      if (options.failRollback) throw new Error('rollback failed');
      if (snapshot) tables = snapshot;
      snapshot = undefined;
    },
    destroy() { destroyed = true; if (snapshot) tables = snapshot; snapshot = undefined; },
    release() { assert.equal(snapshot, undefined, 'unresolved transactions must not return to the pool'); }
  };
  return {
    pool: { getConnection: async () => connection, execute: (...args) => connection.execute(...args) },
    get tables() { return tables; },
    get writes() { return writes; },
    get destroyed() { return destroyed; }
  };
}

async function seedFixture(context, options) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bead-demo-test-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const database = databaseFixture(options);
  const config = { ...loadConfig({}), communityDir: directory };
  const images = createCommunityImages(directory);
  const { seedCommunity } = require('../backend/scripts/seed-community.cjs');
  return { database, directory, images, run: overrides => seedCommunity({ config, pool: database.pool, images, clock: () => 1700000000000, ...overrides }) };
}

test('ten distinct followable patterns use valid MARD cells and varied 32–48 grids', () => {
  const { getDemoPatterns, SYSTEM_AUTHOR } = require('../backend/src/demo-patterns.cjs');
  const demos = getDemoPatterns();
  assert.equal(demos.length, 10);
  assert.equal(SYSTEM_AUTHOR.displayName, '豆屿图纸');
  assert.match(SYSTEM_AUTHOR.id, /^s_[a-f0-9]{64}$/);
  assert.equal(new Set(demos.map(demo => demo.publicId)).size, 10);
  assert.equal(new Set(demos.map(demo => JSON.stringify(demo.pattern.cells))).size, 10);
  assert.ok(new Set(demos.map(demo => demo.pattern.width / demo.pattern.height)).size >= 5);
  for (const demo of demos) {
    assert.deepEqual(validatePattern(demo.pattern), demo.pattern);
    assert.match(demo.sourceWorkId, /^[a-f0-9]{64}$/);
    assert.match(demo.publicId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    assert.ok(demo.pattern.width >= 32 && demo.pattern.width <= 48);
    assert.ok(demo.pattern.height >= 32 && demo.pattern.height <= 48);
    assert.ok(demo.pattern.cells.filter(Boolean).length > 300);
    assert.ok(demo.pattern.cells.includes(null));
    assert.ok(new Set(demo.pattern.cells.filter(Boolean)).size <= 12);
  }
  const previous = structuredClone(demos);
  demos[0].pattern.cells.fill(null);
  assert.deepEqual(getDemoPatterns(), previous);
});

test('every thumbnail is a real PNG with the corresponding grid aspect ratio', async context => {
  const fixture = await seedFixture(context);
  const { getDemoPatterns } = require('../backend/src/demo-patterns.cjs');
  for (const { pattern } of getDemoPatterns()) {
    const image = await fixture.images.create(pattern);
    const metadata = await sharp(await fixture.images.read(image.storageKey)).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, pattern.width * 12 + 24);
    assert.equal(metadata.height, pattern.height * 12 + 24);
  }
});

test('seed is insert-only, isolates the author and preserves counters and existing works on rerun', async context => {
  const fixture = await seedFixture(context);
  fixture.database.tables.bead_users.set('real-user', { id: 'real-user', display_name: '用户' });
  fixture.database.tables.bead_works.set('real-work', { id: 'real-work', owner: 'real-user', pattern: 'untouched' });
  assert.deepEqual(await fixture.run(), { inserted: 10, skipped: 0 });
  const publicWorks = [...fixture.database.tables.bead_public_works.values()];
  assert.ok(publicWorks.every(row => row.download_count === 0));
  publicWorks[0].download_count = 7;
  publicWorks[1].withdrawn = true;
  const before = structuredClone(fixture.database.tables);
  const files = await fs.readdir(fixture.directory);
  assert.deepEqual(await fixture.run({ clock: () => 1800000000000 }), { inserted: 0, skipped: 10 });
  assert.deepEqual(fixture.database.tables, before);
  assert.deepEqual(await fs.readdir(fixture.directory), files);
  assert.equal(fixture.database.tables.bead_users.size, 2);
  assert.equal([...fixture.database.tables.bead_works.values()].filter(row => row.owner === 'real-user').length, 1);
});

test('failed inserts and failed commits roll back all rows and remove only new thumbnails', async context => {
  for (const options of [{ failInsert: 4 }, { failCommit: true }]) {
    const fixture = await seedFixture(context, options);
    await fs.writeFile(path.join(fixture.directory, 'existing.png'), 'preserve');
    await assert.rejects(fixture.run());
    assert.ok(Object.values(fixture.database.tables).every(table => table.size === 0));
    assert.deepEqual(await fs.readdir(fixture.directory), ['existing.png']);
  }
});

test('lost commit response preserves thumbnails actually referenced by committed rows', async context => {
  const fixture = await seedFixture(context, { commitAfterSuccess: true });
  await assert.rejects(fixture.run());
  assert.equal(fixture.database.tables.bead_public_works.size, 10);
  for (const row of fixture.database.tables.bead_public_works.values()) {
    assert.equal((await sharp(await fixture.images.read(row.thumbnail_key)).metadata()).format, 'png');
  }
});

test('schema readiness and transactional engines are checked before any writes or images', async context => {
  for (const options of [{ notReady: true }, { engine: 'MyISAM' }, { lockBusy: true }]) {
    const fixture = await seedFixture(context, options);
    await assert.rejects(fixture.run());
    assert.equal(fixture.database.writes, 0);
    assert.deepEqual(await fs.readdir(fixture.directory), []);
  }
});

test('unsafe targets are rejected before connecting', async () => {
  const { seedCommunity } = require('../backend/scripts/seed-community.cjs');
  for (const env of [{ DB_PORT: '3307' }, { DB_HOST: 'remote.example' }, { DB_NAME: 'other' }]) {
    const pool = { getConnection() { assert.fail('unsafe target must not connect'); } };
    await assert.rejects(seedCommunity({ config: loadConfig(env), pool }), /3306.*bead_island/);
  }
});

test('conflicting deterministic IDs are rejected without changing existing rows', async context => {
  const fixture = await seedFixture(context);
  const { getDemoPatterns } = require('../backend/src/demo-patterns.cjs');
  fixture.database.tables.bead_public_works.set(getDemoPatterns()[0].publicId, { id: getDemoPatterns()[0].publicId, owner: 'real-user', source_work_id: 'real-work' });
  const before = structuredClone(fixture.database.tables);
  await assert.rejects(fixture.run());
  assert.deepEqual(fixture.database.tables, before);
  assert.deepEqual(await fs.readdir(fixture.directory), []);
});

test('missing publications reuse unchanged source rows regardless of MySQL JSON key order', async context => {
  const fixture = await seedFixture(context);
  await fixture.run();
  const publication = [...fixture.database.tables.bead_public_works.values()][0];
  publication.download_count = 12;
  fixture.database.tables.bead_public_works.delete(publication.id);
  const source = fixture.database.tables.bead_works.get(publication.source_work_id);
  source.pattern = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(source.pattern)).reverse()));
  const before = structuredClone(source);
  assert.deepEqual(await fixture.run(), { inserted: 1, skipped: 9 });
  assert.deepEqual(fixture.database.tables.bead_works.get(source.id), before);
  assert.equal(fixture.database.tables.bead_public_works.get(publication.id).download_count, 0);
});

test('thumbnail generation failures roll back database rows and clean previous new PNGs', async context => {
  const fixture = await seedFixture(context);
  let created = 0;
  const images = {
    ...fixture.images,
    async create(pattern) {
      created += 1;
      if (created === 2) throw new Error('image generation failed');
      return fixture.images.create(pattern);
    }
  };
  await assert.rejects(fixture.run({ images }));
  assert.ok(Object.values(fixture.database.tables).every(table => table.size === 0));
  assert.deepEqual(await fs.readdir(fixture.directory), []);
});

test('failed rollback discards the connection before checking and removing orphan thumbnails', async context => {
  const fixture = await seedFixture(context, { failInsert: 4, failRollback: true });
  await assert.rejects(fixture.run());
  assert.equal(fixture.database.destroyed, true);
  assert.ok(Object.values(fixture.database.tables).every(table => table.size === 0));
  assert.deepEqual(await fs.readdir(fixture.directory), []);
});
