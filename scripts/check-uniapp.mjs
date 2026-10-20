import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parse } from '@vue/compiler-sfc';
import { spawnSync } from 'node:child_process';

const manifest = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
const pages = JSON.parse(fs.readFileSync('src/pages.json', 'utf8'));
assert.equal(manifest.appid, '__UNI__ACD00BD');
assert.equal(manifest['mp-weixin'].appid, 'wx0ebba69092706cc6');
assert.equal(pages.pages.length, 5);
for (const page of pages.pages) assert.ok(fs.existsSync(`src/${page.path}.vue`), `Missing page ${page.path}`);
for (const tab of pages.tabBar.list) for (const key of ['iconPath', 'selectedIconPath']) assert.ok(fs.existsSync(`src/${tab[key]}`), `Missing tab image ${tab[key]}`);
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(filename); continue; }
    if (!/\.(js|json|vue)$/.test(filename)) continue;
    const text = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('.json')) JSON.parse(text);
    if (filename.endsWith('.js')) assert.equal(spawnSync(process.execPath, ['--check', filename]).status, 0, `JS syntax ${filename}`);
    if (filename.endsWith('.vue')) {
      const result = parse(text, { filename });
      assert.deepEqual(result.errors, [], `Vue syntax ${filename}`);
      assert.ok(result.descriptor.template || filename.endsWith('App.vue'), `Missing template ${filename}`);
      assert.ok(!/\b(?:Page|Component|App)\(\{|\bwx\./.test(text), `Native source found in ${filename}`);
    }
    assert.ok(!/WECHAT_APP_SECRET\s*[:=]\s*['"][^'"]+/.test(text), `Secret in client ${filename}`);
  }
}
inspect('src');
const palette = JSON.parse(fs.readFileSync('src/data/mard.json', 'utf8')).colors;
assert.equal(palette.length, 221);
assert.equal(new Set(palette.map(color => color.code)).size, 221);
for (const id of ['cat', 'flower', 'coffee']) assert.ok(fs.existsSync(`src/static/example-${id}.png`));
console.log('uni-app source, five Vue pages, 221 colors, AppIDs and assets verified');
