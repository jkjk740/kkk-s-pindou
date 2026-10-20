const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@vue/compiler-dom');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith('.vue') ? [path.join(directory, entry.name)] : []);
}
function walk(node, visitor) { visitor(node); for (const child of node.children || []) walk(child, visitor); }

test('every app-owned button has shared press feedback with no default black hover', () => {
  for (const file of files(path.join(__dirname, '../src'))) {
    const template = fs.readFileSync(file, 'utf8').match(/<template>([\s\S]*?)<\/template>/)?.[1];
    if (!template) continue;
    walk(parse(template), node => {
      if (node.tag !== 'button') return;
      const attributes = Object.fromEntries(node.props.filter(prop => prop.type === 6).map(prop => [prop.name, prop.value?.content]));
      assert.equal(attributes['hover-class'], 'press-hover', file);
      assert.equal(attributes['hover-start-time'], '0', file);
      assert.equal(attributes['hover-stay-time'], '0', file);
      assert.match(attributes.class || '', /\bpress\b/, file);
    });
  }
});

test('size and color choices use one wrapping four-column layout with unbroken labels', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/editor/index.vue'), 'utf8');
  const style = source.match(/<style scoped>([\s\S]*?)<\/style>/)[1];
  assert.equal((style.match(/\.options\s*\{/g) || []).length, 1);
  assert.match(style, /\.options\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(style, /\.options \.chip\s*\{[^}]*white-space:\s*nowrap/s);
});

test('buttons squash on press and release with an interruptible jelly overshoot', () => {
  const style = fs.readFileSync(path.join(__dirname, '../src/styles/common.css'), 'utf8');
  const release = style.match(/\.press\s*\{([^}]*)\}/)[1];
  const pressed = style.match(/\.press-hover,\s*\.press:active\s*\{([^}]*)\}/)[1];
  const scale = pressed.match(/transform:\s*scale\(([^)]+)\)/)[1].split(',').map(Number);
  assert.equal(scale.length, 2);
  assert.ok(scale[0] > 1 && scale[0] <= 1.04);
  assert.ok(scale[1] < 0.96 && scale[1] >= 0.9);
  const transition = release.match(/transition:\s*transform (\d+)ms cubic-bezier\(([^)]+)\)/);
  const curve = transition[2].split(',').map(Number);
  const midpoint = 0.375 * curve[1] + 0.375 * curve[3] + 0.125;
  assert.ok(1 + (scale[1] - 1) * (1 - midpoint) > 1.015);
  assert.ok(Number(transition[1]) <= 300);
  assert.ok(Number(pressed.match(/transition-duration:\s*(\d+)ms/)[1]) <= 100);
  assert.match(release, /transform:\s*scale\(1,\s*1\)/);
  assert.doesNotMatch(release, /animation:/);
  assert.match(style, /\.press:disabled\s*\{[^}]*transform:\s*none;[^}]*transition:\s*none/s);
  assert.match(style, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.press\s*\{[^}]*transform:\s*none;?[^}]*transition:\s*none/s);
});

test('export format cards center their content and expose the selected checkmark', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/export-sheet.vue'), 'utf8');
  const style = source.match(/<style scoped>([\s\S]*?)<\/style>/)[1];
  const card = style.match(/\.format-option\s*\{([^}]*)\}/)[1];
  assert.match(card, /display:\s*flex/);
  assert.match(card, /flex-direction:\s*column/);
  assert.match(card, /align-items:\s*center/);
  assert.match(card, /justify-content:\s*center/);
  assert.match(card, /min-height:\s*132rpx/);
  assert.match(style, /\.format-option\.selected\s*\{[^}]*border-color:\s*#355c48/);
  const template = source.split('<script>')[0];
  assert.match(template, /class="format-check"[^>]*v-if="format === 'full'"/);
  assert.match(template, /class="format-check"[^>]*v-if="format === 'tiles'"/);
  assert.match(template, /selectFormat\('full'\)/);
  assert.match(template, /selectFormat\('tiles'\)/);
  assert.match(template, /\{\{ tileCount \}\}/);
});
