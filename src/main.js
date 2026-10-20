import { createSSRApp } from 'vue';
import App from './App.vue';
import AppHeader from './components/app-header.vue';
import BeadCanvas from './components/bead-canvas.vue';
import MaterialSheet from './components/material-sheet.vue';
import ExportSheet from './components/export-sheet.vue';
import PatternViewer from './components/pattern-viewer.vue';
import PatternDetail from './components/pattern-detail.vue';

import UiHost from './components/ui-host.vue';
import AppSheet from './components/app-sheet.vue';
import SafeImage from './components/safe-image.vue';
import { dismiss } from './lib/ui-controller.js';

export function createApp() {
  const app = createSSRApp(App);
  app.component('app-header', AppHeader);
  app.component('bead-canvas', BeadCanvas);
  app.component('material-sheet', MaterialSheet);
  app.component('export-sheet', ExportSheet);
  app.component('pattern-viewer', PatternViewer);
  app.component('pattern-detail', PatternDetail);
  app.component('ui-host', UiHost);
  app.component('app-sheet', AppSheet);
  app.component('safe-image', SafeImage);
  app.mixin({ onHide() { if (this.$scope?.route) dismiss(this.$scope.route); }, onUnload() { if (this.$scope?.route) dismiss(this.$scope.route); } });
  return { app };
}
