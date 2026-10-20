const fs = require('node:fs');
const vm = require('node:vm');
const patternLibrary = require('../src/lib/pattern.js');
const paletteData = require('../src/data/mard.json');
function editorFixture(draft) {
  const app = { globalData: { draft, examples: [], palette: paletteData.colors }, $vm: { getDraft: () => app.globalData.draft } };
  const source = fs.readFileSync(require.resolve('../src/pages/editor/index.vue'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*;\s*$/gm, '').replace('export default', 'module.exports =');
  const context = { module: { exports: {} }, paletteData, ...patternLibrary, getApp: () => app, uni: { hideTabBar() {} }, selectTab() {}, toast() {}, showError() {}, chooseImage() {}, saveExport() {}, console };
  vm.runInNewContext(source, context);
  const definition = context.module.exports;
  const page = definition.data();
  Object.assign(page, definition.methods);
  page.loadDraft();
  return { page, app, definition };
}
module.exports = { editorFixture };
