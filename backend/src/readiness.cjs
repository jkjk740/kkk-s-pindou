'use strict';

const fs = require('node:fs/promises');
const { readConfig } = require('./session.cjs');

async function assertReady(config, pool, storage) {
  readConfig(config.auth);
  await pool.execute('SELECT display_name FROM bead_users LIMIT 0');
  await pool.execute('SELECT origin_public_id, cutout_id FROM bead_works LIMIT 0');
  await pool.execute('SELECT input_image_id FROM bead_cutout_inputs LIMIT 0');
  await pool.execute('SELECT status FROM bead_cutout_tasks LIMIT 0');
  await pool.execute('SELECT mask_image_id FROM bead_cutouts LIMIT 0');
  await pool.execute('SELECT download_count, thumbnail_key FROM bead_public_works LIMIT 0');
  await pool.execute('SELECT completed_at FROM bead_public_downloads LIMIT 0');
  await fs.access(storage.tempDir, fs.constants.R_OK | fs.constants.W_OK);
  await fs.access(config.communityDir, fs.constants.R_OK | fs.constants.W_OK);
}

module.exports = { assertReady };
