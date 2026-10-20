<script>
import paletteData from './data/mard.json';
import examples from './data/examples.json';
import { createAutoSave } from './lib/auto-save.js';
import { syncWorks, getSession } from './lib/cloud.js';
import { communityDownloads } from './lib/community-downloads.js';
import { createRepository } from './lib/storage.js';
import { samplePixels, convertRgba } from './lib/pattern.js';

export default {
  globalData: { palette: paletteData.colors, examples, draft: null, repository: null, cutoutSession: null, cutoutResult: null },
  onLaunch() {
    this.globalData.repository = createRepository(uni);
    this.globalData.autoSave = createAutoSave({ repository: this.globalData.repository, syncWorks, getSession });
    this.accountReady = () => this.globalData.autoSave.schedule();
    this.networkReady = status => { if (status.isConnected) { this.globalData.autoSave.schedule(); communityDownloads.retryPending(); } };
    uni.$on('bead-account-ready', this.accountReady);
    uni.onNetworkStatusChange(this.networkReady);
  },
  onShow() { this.globalData.autoSave?.schedule(); communityDownloads.retryPending(); },
  methods: {
    useExample(id) {
      const example = examples.find(item => item.id === id) || examples[0];
      const pattern = convertRgba(samplePixels(example, 32, 32), paletteData.colors, { name: example.name, maxColors: 12 });
      this.globalData.draft = { id: null, pattern, completedRows: [], exampleKind: example.id, size: 32, maxColors: 12, removeBackground: false };
      return this.globalData.draft;
    },
    setDraft(work) { this.globalData.draft = JSON.parse(JSON.stringify(work)); return this.globalData.draft; },
    getDraft() { return this.globalData.draft; },
    openWork(id) { const work = this.globalData.repository.find(id); if (!work) throw new Error('作品已移除'); return this.setDraft(work); }
  }
};
</script>
<style>
@import './styles/common.css';
</style>
