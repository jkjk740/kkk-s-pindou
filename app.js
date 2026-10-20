import { sampleArt, nearestColor, convertImage, countColors, drawPattern } from './art.js';

const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.7 1.5 1.5 0 0 1 1-2.8h2a4 4 0 0 0 4-4C21 6 17 3 12 3Z"/><circle cx="7" cy="11" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="7" r=".7"/><circle cx="18" cy="11" r=".7"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  back:'<path d="m14 5-7 7 7 7"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  pencil:'<path d="m16 3 5 5-12 12H4v-5zm-2 2 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  zoom:'<circle cx="10" cy="10" r="6"/><path d="M10 7v6m-3-3h6m-1 6 6 6"/>',
  undo:'<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  signal:'<path d="M3 20v-4m5 4v-8m5 8V8m5 12V4"/>',
  wifi:'<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-10 4a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".6"/>',
  battery:'<rect x="2" y="6" width="17" height="12" rx="3"/><path d="M22 10v4"/><path d="M5 9h11v6H5z" fill="currentColor" stroke="none"/>',
};
const icon = (name, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${icons[name] || icons.grid}</svg>`;
const escapeText = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const bead = color => `<span class="bead-dot" style="--bead:${color.hex}"></span>`;
const parameters = new URLSearchParams(location.search);
if (parameters.has('screen')) document.body.classList.add('screen-only');
const app = document.querySelector('#app');
let palette;
try {
  const response = await fetch('./data/mard.json');
  if (!response.ok) throw new Error('palette unavailable');
  palette = (await response.json()).colors;
} catch {
  app.innerHTML = '<div class="page-scroll"><h2>色卡暂时没有加载成功</h2><p>请刷新页面后再试。</p></div>';
  throw new Error('Unable to load local palette');
}

let savedWorks = [];
try { savedWorks = JSON.parse(localStorage.getItem('beadisland-works') || '[]'); if (!Array.isArray(savedWorks)) savedWorks = []; } catch { savedWorks = []; }
const pageInformation = {
  home:['灵感从这里开始','一个醒目的创作入口，一些刚刚好的灵感。第一次拼豆，也能轻松开始。'],
  editor:['让图片变得可制作','先看效果，再调大小与颜色。每个像素匹配实际色号，用多少颗也一目了然。'],
  palette:['每种颜色，都有名字','按品牌、色系或色号找到那颗豆子。相近颜色也能看清，备料不用凭感觉。'],
  making:['专心拼，慢慢来','按色号高亮，逐行完成。记住你的进度，放下手机后回来，也能接着拼。'],
  works:['把喜欢，好好收起来','图纸、创作进度和小小的成就感。下一次打开，从上次停下的地方开始。'],
};
const artNames = {cat:'小猫的慢生活',flower:'送你一朵小花',coffee:'一杯好心情'};
const state = {
  page: pageInformation[parameters.get('page')] ? parameters.get('page') : 'home',
  source: sampleArt('cat'), size:32, maxColors:12, beadSize:2.6, removeBackground:false,
  pattern:null, sourceName:artNames.cat, view:'pixel', editing:false, editColor:null, undo:[],
  paletteFilter:'all', search:'', completedRows:[], highlighted:null, zoomed:false, savedId:null,
};
let modalTrigger = null;
let toastTimer;

function generate() {
  state.pattern = convertImage(state.source, palette, state);
  state.pattern.name = state.sourceName;
  state.completedRows = [];
  state.undo = [];
  state.savedId = null;
  state.highlighted = null;
  state.editColor ||= countColors(state.pattern)[0] || palette[0];
}
generate();
if (parameters.get('demo') === '1') state.completedRows = Array.from({length:8}, (_, index) => index);

function stats() {
  const colors = countColors(state.pattern);
  return { colors, total:colors.reduce((sum, color) => sum + color.count, 0), width:(state.pattern.width * state.beadSize / 10).toFixed(1), height:(state.pattern.height * state.beadSize / 10).toFixed(1) };
}

function topBar() {
  const titles = { editor:'图片转图纸', palette:'豆子色卡', making:'跟着图纸拼', works:'我的作品' };
  return `<div class="status-bar"><span>9:41</span><div class="status-icons">${icon('signal')}${icon('wifi')}${icon('battery','class="battery"')}</div></div>
    <div class="wechat-nav">${state.page === 'home' ? '<div class="app-brand"><span class="brand-mark"><i></i><i></i><i></i><i></i></span>豆屿<small>BEAD ISLAND</small></div>' : `<div class="nav-title"><button class="nav-back" data-action="back" aria-label="返回首页">${icon('back')}</button>${titles[state.page]}</div>`}<div class="wechat-capsule" aria-label="微信菜单示意"><span>···</span><i></i><b></b></div></div>`;
}

function tabBar() {
  return `<nav class="tab-bar" aria-label="主导航">${[['home','home','创作'],['editor','grid','图纸'],['palette','palette','色卡'],['works','folder','作品']].map(([page,graphic,label])=>`<button data-page="${page}" class="${state.page===page ? 'active' : ''}" ${state.page === page ? 'aria-current="page"' : ''}>${icon(graphic)}<span>${label}</span></button>`).join('')}</nav>`;
}

function homePage() {
  return `<div class="welcome"><div><h2>今天，拼点喜欢的。</h2><p>把生活里的小美好，变成手里的小作品。</p></div><span class="sun">✳</span></div>
    <section class="hero-card"><span class="tiny-label">${icon('spark','style="width:11px;height:11px"')} 从图片到作品</span><h3>一张图片，<br>无限小小可能。</h3><p>上传喜欢的图片，剩下的交给豆屿。</p><div class="hero-art"><canvas data-art="cat"></canvas></div><span class="hero-spark">✧</span><span class="hero-mini-tag">每颗豆子都有色号</span><div class="hero-cta"><button class="primary" data-action="upload">${icon('image')} 图片转拼豆 ${icon('arrow')}</button></div></section>
    <div class="quick-actions"><button class="quick-card" data-action="example"><span class="quick-icon">${icon('spark')}</span><span><strong>先试试小猫</strong><small>不用选图，直接体验</small></span></button><button class="quick-card" data-page="palette"><span class="quick-icon">${icon('palette')}</span><span><strong>找一颗颜色</strong><small>色号与色卡，随手查</small></span></button></div>
    <div class="section-heading"><h3>一点创作灵感</h3><button data-page="works">去逛逛 ↗</button></div>
    <div class="inspiration-grid">${patternCard('flower','新手友好')}${patternCard('coffee','简单治愈')}</div>`;
}

function patternCard(kind, badge) {
  const pattern = convertImage(sampleArt(kind), palette, { size:32,maxColors:12 });
  const count = countColors(pattern);
  return `<button class="pattern-card" data-art-open="${kind}"><div class="pattern-card-art"><canvas data-art="${kind}"></canvas><span class="card-badge">${badge}</span></div><div class="pattern-card-copy"><strong>${artNames[kind]}</strong><small>32 × 32 · ${count.length} 色 · 原创图案</small></div></button>`;
}

function editorPage() {
  const summary = stats();
  return `<div class="editor-heading"><div><h2>让喜欢，有迹可拼。</h2><p class="subtext">${escapeText(state.sourceName)} · ${summary.width} × ${summary.height} cm</p></div><button class="icon-button" data-action="upload" aria-label="更换图片">${icon('image')}</button></div>
    <div class="preview-card"><div class="preview-toolbar"><div class="segmented" aria-label="预览模式">${[['original','原图'],['pixel','像素'],['codes','色号']].map(([view,label])=>`<button data-view="${view}" class="${state.view===view?'selected':''}" aria-pressed="${state.view===view}">${label}</button>`).join('')}</div><button class="icon-button" data-action="edit" aria-label="手动修色" aria-pressed="${state.editing}">${icon('pencil')}</button></div><div class="canvas-stage">${state.view==='original' ? '<img id="source-image" alt="导入的原图">' : '<canvas id="pattern-canvas" aria-label="拼豆图纸，开启修色后可点击格子修改"></canvas>'}</div>${state.editing?`<div class="edit-strip"><span>点格子修色</span><button data-action="choose-edit-color" aria-label="更换画笔颜色">${bead(state.editColor)} ${state.editColor.code}</button><button data-action="undo" ${state.undo.length?'':'disabled'}>撤销</button><button data-action="edit">完成</button></div>`:''}<div class="preview-meta"><span>${state.pattern.width} × ${state.pattern.height} 格 · ${summary.total} 颗 · ${summary.colors.length} 色</span><span>${icon('check')} 已匹配 MARD 色号</span></div></div>
    <div class="settings"><div class="setting-row"><div class="setting-label"><strong>图纸大小</strong><span>长边格数 · 越大越精细</span></div><div class="option-row">${[24,32,48,64].map(size=>`<button data-size="${size}" class="${state.size===size?'selected':''}" aria-pressed="${state.size===size}">${size} 格</button>`).join('')}</div></div><div class="setting-row"><div class="setting-label"><strong>最多颜色</strong><span>少一点，更容易备料</span></div><div class="option-row">${[8,12,16,24].map(count=>`<button data-colors="${count}" class="${state.maxColors===count?'selected':''}" aria-pressed="${state.maxColors===count}">${count} 色</button>`).join('')}</div></div><div class="inline-options"><label class="brand-select">豆子 <select id="bead-size" aria-label="豆子尺寸"><option value="2.6" ${state.beadSize===2.6?'selected':''}>MARD · 2.6 mm</option><option value="5" ${state.beadSize===5?'selected':''}>MARD · 5 mm</option></select></label><div class="switch-label">去除底色<button class="switch ${state.removeBackground?'on':''}" data-action="background" role="switch" aria-checked="${state.removeBackground}" aria-label="去除与左上角相近的底色"></button></div></div></div>
    <div class="used-colors"><strong>这次用到 ${summary.colors.length} 色</strong>${summary.colors.slice(0,5).map(color=>bead(color)).join('')}<button data-action="materials">看用量 ↗</button></div><p class="footnote">颜色以实物色卡为准 · 图片仅在本地处理</p>`;
}

const groups = {all:[],warm:['A','F'],green:['B'],blue:['C'],purple:['D','E'],neutral:['G','H','M']};
const groupLabels = {all:'全部',warm:'黄橙',green:'绿色',blue:'蓝色',purple:'紫粉',neutral:'灰棕'};
function filteredPalette() {
  const curated = ['#FFF4D0','#F7D688','#E9A165','#D18B69','#CCB6A0','#DAE4BC','#B4C68A','#91AA7C','#6D8E6A','#486E52','#E4E9D2','#CED6BD','#B5C1A7','#99AC97','#7A968B','#EABCA9','#DFA397','#C2857D','#AC6F68','#805751','#F9F9EF','#E3E4D6','#C6CBB7','#909781','#393D32'];
  const ordered = [...new Set(curated.map(hex=>nearestColor(...hex.match(/\w\w/g).map(value=>parseInt(value,16)),palette)))];
  const query=state.search.trim().toLowerCase();
  return [...ordered,...palette.filter(color=>!ordered.includes(color))].filter(color=>(state.paletteFilter==='all' || groups[state.paletteFilter].includes(color.group)) && (!query || (query.startsWith('#')?color.hex:color.code).toLowerCase().includes(query)));
}

function palettePage() {
  return `<h2 class="page-title">找找，你的那颗颜色。</h2><p class="palette-description">让每一个像素，都有准确的色号。</p><div class="brand-banner"><div><strong>MARD <span style="font-weight:400;font-size:11px">麦德</span></strong><small>221 色参考色卡 · A–M 系列</small></div><span>当前色卡 ${icon('check','style="width:13px;height:13px"')}</span></div><label class="search-field">${icon('search')}<input id="palette-search" placeholder="搜索色号，例如 B12 / H1" value="${escapeText(state.search)}" aria-label="搜索豆子色号或 HEX"></label><div class="filter-row">${Object.entries(groupLabels).map(([group,label])=>`<button data-filter="${group}" class="${state.paletteFilter===group?'selected':''}" aria-pressed="${state.paletteFilter===group}">${label}</button>`).join('')}</div><div class="color-heading"><strong>${state.search?'搜索结果':'每颗颜色，都刚刚好'}</strong><span id="color-result-count"></span></div><div class="color-grid" id="color-grid"></div><div class="palette-feature">${icon('palette')}<div><strong>颜色相近，也能分得清。</strong><p>点一颗豆子，查看色号、数值与相近色。</p></div></div><p class="palette-note">屏幕颜色为近似参考，请以实物色卡为准。<br>来源：公开 MARD 221 色数据，非品牌官方标准。</p>`;
}

function updateColorGrid() {
  const colors = filteredPalette();
  document.querySelector('#color-result-count').textContent = `${colors.length} 个颜色`;
  document.querySelector('#color-grid').innerHTML = colors.length ? colors.map(color=>`<button class="color-card" data-color="${color.code}" aria-label="MARD ${color.code} ${color.hex}">${bead(color)}<span>${color.code}</span></button>`).join('') : '<p class="palette-note" style="grid-column:1/-1">没有找到这个色号，试试 B12 或 H1。</p>';
}

function progress() {
  const validRows = state.completedRows.filter(row=>Number.isInteger(row) && row>=0 && row<state.pattern.height);
  const nextRow = Array.from({length:state.pattern.height},(_,index)=>index).find(row=>!validRows.includes(row));
  return { percent:Math.round(validRows.length/state.pattern.height*100), count:validRows.length, nextRow };
}

function makingPage() {
  const summary = stats();
  const status = progress();
  const coordinateLabels = length => [...new Set([0,4,9,14,19,24,29,length-1])].filter(index=>index<length).map(index=>`<span style="left:${(index+.5)/length*100}%">${index+1}</span>`).join('');
  return `<div class="making-heading"><div><h2>${escapeText(state.pattern.name)}</h2><p class="subtext">${state.pattern.width} × ${state.pattern.height} 格 · ${summary.colors.length} 色 · ${summary.total} 颗</p></div><span class="mini-pill">${state.beadSize} mm</span></div><div class="progress-card"><div class="progress-top"><strong>一颗颗，慢慢完成。</strong><b>${status.percent}<small>%</small></b></div><div class="progress-track"><i style="width:${status.percent}%"></i></div><div class="progress-foot"><span>已完成 ${status.count} / ${state.pattern.height} 行</span><span>${state.savedId?'进度自动保存':'保存图纸后可恢复进度'}</span></div></div>
    <div class="making-board"><div class="coordinate-top">${coordinateLabels(state.pattern.width)}</div><div class="making-canvas-wrapper ${state.zoomed?'zoomed':''}"><div class="making-canvas-frame"><div class="coordinate-left">${[...new Set([0,4,9,14,19,24,29,state.pattern.height-1])].filter(index=>index<state.pattern.height).map(index=>`<span style="top:${(index+.5)/state.pattern.height*100}%">${index+1}</span>`).join('')}</div><canvas id="making-canvas" aria-label="拼豆跟拼图纸，包含色号和网格"></canvas></div></div><div class="making-tools"><span>${state.highlighted?`正在高亮 ${state.highlighted}`:'完整图纸 · 点击色号可高亮'}</span><button data-action="zoom">${icon('zoom')}${state.zoomed?'缩小':'放大'}</button><button data-action="unmark" ${status.count?'':'disabled'}>${icon('undo')}撤销</button></div></div>
    <div class="section-heading making-color-heading"><h3>这次，先拼哪种颜色？</h3><button data-action="materials">材料清单 ↗</button></div><div class="making-colors">${summary.colors.map(color=>`<button class="making-color ${state.highlighted===color.code?'selected':''}" data-highlight="${color.code}" aria-pressed="${state.highlighted===color.code}">${bead(color)}<span>${color.code}</span><small>${color.count} 颗</small></button>`).join('')}</div><p class="making-tip">选一个色号，只看它的位置。<br>拼完一行就标记，休息之后也能接着拼。</p>`;
}

function workCard(pattern, id, completedRows = [], example = false) {
  const colors = countColors(pattern);
  const completion = Math.round(completedRows.length / pattern.height * 100);
  return `<button class="work-card" ${example?`data-art-open="${id}"`:`data-work-open="${id}"`}><div class="work-art"><canvas ${example?`data-art="${id}"`:`data-work-art="${id}"`}></canvas></div><div class="work-copy"><strong>${escapeText(pattern.name)}</strong><small>${pattern.width} × ${pattern.height} · ${colors.length} 色 · ${example?'原创示例':`${completion}% 已完成`}</small><span class="work-action">${example?'用这个图案开始':completion>0?'继续上次的创作':'打开我的图纸'} ↗</span></div></button>`;
}

function worksPage() {
  const total = savedWorks.filter(work=>Array.isArray(work.pattern?.cells)).length;
  return `<h2 class="page-title">喜欢的，都在这里。</h2><p class="palette-description">每一份图纸，都值得被好好保存。</p><div class="works-hero"><div><h3>我的小小创作收藏</h3><p>${total} 份已保存图纸 · 随时接着拼</p></div><span>✳</span></div><div class="section-heading"><h3>我的图纸</h3><button data-action="upload">新建作品 ＋</button></div>${total?savedWorks.filter(work=>Array.isArray(work.pattern?.cells)).map(work=>workCard(work.pattern,work.id,work.completedRows)).join(''):'<div class="empty-state">'+icon('folder')+'<strong>你的第一份作品，从这里开始。</strong><p>上传一张喜欢的图，或先试试下面的小图案。</p><button class="primary" data-action="upload">选一张图片</button></div>'}<div class="section-heading" style="margin-top:23px"><h3>给你一点灵感</h3><span class="subtext">豆屿原创</span></div>${['cat','flower','coffee'].map(kind=>{const pattern=convertImage(sampleArt(kind),palette,{size:32,maxColors:12});pattern.name=artNames[kind];return workCard(pattern,kind,[],true);}).join('')}`;
}

function render() {
  const previousScroll = app.querySelector('.page-scroll')?.scrollTop || 0;
  const pages = { home:homePage, editor:editorPage, palette:palettePage, making:makingPage, works:worksPage };
  const status = progress();
  const bottom = state.page==='editor' ? `<div class="bottom-action"><button class="secondary" data-action="export">${icon('download')}导出</button><button class="primary" data-action="save-make">保存并开始拼 ${icon('arrow')}</button></div>` : state.page==='making' ? `<div class="bottom-action"><button class="secondary" data-action="save">${icon('folder')}保存</button><button class="primary" data-action="mark" ${status.nextRow===undefined?'disabled':''}>${icon('check')}${status.nextRow===undefined?'全部完成啦！':`标记第 ${status.nextRow+1} 行完成`}</button></div>` : tabBar();
  app.innerHTML = topBar()+`<main class="page-scroll">${pages[state.page]()}</main>`+bottom;
  app.querySelector('.page-scroll').scrollTop = previousScroll;
  document.querySelectorAll('.studio-nav [data-page]').forEach(button=>button.classList.toggle('selected',button.dataset.page===state.page));
  document.querySelector('#preview-title').textContent = pageInformation[state.page][0];
  document.querySelector('#preview-description').textContent = pageInformation[state.page][1];
  document.querySelector('.note-number').textContent = `${String(Object.keys(pageInformation).indexOf(state.page)+1).padStart(2,'0')} — 05`;
  if (state.page==='palette') updateColorGrid();
  paintCanvases();
}

function paintCanvases() {
  app.querySelectorAll('[data-art]').forEach(canvas=>drawPattern(canvas,convertImage(sampleArt(canvas.dataset.art),palette,{size:32,maxColors:12}),{beads:true,cellSize:12}));
  app.querySelectorAll('[data-work-art]').forEach(canvas=>{const work=savedWorks.find(item=>item.id===canvas.dataset.workArt);if(work)drawPattern(canvas,work.pattern,{beads:true});});
  const preview = app.querySelector('#pattern-canvas');
  if (preview) drawPattern(preview,state.pattern,{beads:state.view==='pixel',grid:state.view==='codes',codes:state.view==='codes',cellSize:24});
  const original = app.querySelector('#source-image');
  if (original) original.src=state.source instanceof HTMLCanvasElement ? state.source.toDataURL() : state.source.src;
  const making = app.querySelector('#making-canvas');
  if (making) drawPattern(making,state.pattern,{grid:true,codes:true,cellSize:32,highlighted:state.highlighted,completedRows:state.completedRows,background:'#FFFEFA'});
}

function navigate(page) {
  if (!pageInformation[page]) return;
  state.page = page;
  closeSheet(true);
  render();
  app.querySelector('.page-scroll').scrollTop = 0;
  history.replaceState(null,'',`${location.pathname}?${parameters.has('screen')?'screen=1&':''}page=${page}`);
}

function notify(message) {
  app.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.className='toast';toast.setAttribute('role','status');toast.textContent=message;
  app.append(toast);
  requestAnimationFrame(()=>toast.classList.add('open'));
  toastTimer=setTimeout(()=>{toast.classList.remove('open');setTimeout(()=>toast.remove(),180);},2500);
}

function openSheet(title, content) {
  closeSheet(true);
  modalTrigger=document.activeElement;
  const overlay=document.createElement('div');overlay.className='modal-overlay';
  overlay.innerHTML=`<section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeText(title)}"><div class="sheet-handle"></div><div class="sheet-heading"><h3>${title}</h3><button class="icon-button" data-action="close" aria-label="关闭弹层">${icon('close')}</button></div>${content}</section>`;
  app.append(overlay);
  requestAnimationFrame(()=>overlay.classList.add('open'));
  overlay.querySelector('[data-action="close"]').focus({preventScroll:true});
}

function closeSheet(immediate=false) {
  const overlay=app.querySelector('.modal-overlay');
  if(!overlay)return;
  const trigger=modalTrigger;
  overlay.classList.add('closing');overlay.classList.remove('open');
  if(immediate)overlay.remove();else setTimeout(()=>overlay.remove(),170);
  if(trigger?.isConnected)trigger.focus({preventScroll:true});
}

function showMaterials() {
  const summary=stats();
  openSheet('这次，需要这些小豆子。',`<p>MARD 221 色 · ${summary.colors.length} 种颜色 · 共 ${summary.total} 颗<br>预计成品 ${summary.width} × ${summary.height} cm（${state.beadSize} mm）</p><table class="material-table"><thead><tr><th>豆子色号</th><th>参考色值</th><th>实际用量</th></tr></thead><tbody>${summary.colors.map(color=>`<tr><td>${bead(color)}${color.code}</td><td>${color.hex}</td><td>${color.count} 颗</td></tr>`).join('')}</tbody></table><p>实际备料可以多留一点余量，颜色以实物为准。</p><button class="primary" data-action="export">${icon('download')}导出图纸与材料清单</button>`);
}

function showColor(code, editing=false) {
  const color=palette.find(item=>item.code===code);if(!color)return;
  if(editing){state.editColor=color;closeSheet(true);render();return;}
  const similar=palette.filter(item=>item.code!==code).map(item=>({...item,distance:item.rgb.reduce((sum,value,index)=>sum+(value-color.rgb[index])**2,0)})).sort((first,second)=>first.distance-second.distance).slice(0,5);
  openSheet('认识这颗颜色',`<div class="color-detail">${bead(color)}<div><h4>${color.code}</h4><p>MARD · 221 色参考色卡</p><p>HEX ${color.hex}</p><p>RGB ${color.rgb.join(' / ')}</p></div></div><div class="section-heading"><h3>相近的颜色</h3><span class="subtext">可点选查看</span></div><div class="color-grid">${similar.map(item=>`<button class="color-card" data-color="${item.code}">${bead(item)}<span>${item.code}</span></button>`).join('')}</div><p>屏幕显示是近似颜色，请以手中的实体色卡为准。</p><button class="primary" data-action="use-color" data-code="${color.code}">用这颗颜色修图 ${icon('pencil')}</button>`);
}

function persistWorks() {
  try { localStorage.setItem('beadisland-works',JSON.stringify(savedWorks));return true; } catch { notify('本地空间不足，试试先导出图纸');return false; }
}

function saveWork(silent=false) {
  const previousWorks=structuredClone(savedWorks);
  const previousId=state.savedId;
  const id=state.savedId || crypto.randomUUID();
  const work={id,pattern:structuredClone(state.pattern),completedRows:[...state.completedRows],beadSize:state.beadSize,size:state.size,maxColors:state.maxColors,updatedAt:new Date().toISOString()};
  savedWorks=[work,...savedWorks.filter(item=>item.id!==id)];
  if(!persistWorks()){savedWorks=previousWorks;state.savedId=previousId;return false;}
  state.savedId=id;
  if(!silent)notify('图纸和进度，已经好好保存');
  return true;
}

function exportPattern() {
  const summary=stats();
  const cellSize=32;
  const diagram=document.createElement('canvas');
  drawPattern(diagram,state.pattern,{grid:true,codes:true,cellSize,background:'#FFFEFA'});
  const width=Math.max(diagram.width+100,800);
  const legendRows=Math.ceil(summary.colors.length/4);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=diagram.height+240+legendRows*44;
  const context=canvas.getContext('2d');context.fillStyle='#FFFEFA';context.fillRect(0,0,canvas.width,canvas.height);
  context.fillStyle='#355C48';context.font='600 28px sans-serif';context.fillText(`豆屿 · ${state.pattern.name}`,40,48);
  context.fillStyle='#7B8478';context.font='16px sans-serif';context.fillText(`MARD 221 色参考 · ${state.pattern.width} × ${state.pattern.height} 格 · ${summary.total} 颗 · ${summary.width} × ${summary.height} cm`,40,80);
  context.drawImage(diagram,50,120);
  context.font='11px sans-serif';context.textAlign='center';
  for(let column=0;column<state.pattern.width;column++)context.fillText(String(column+1),50+(column+.5)*cellSize,111);
  for(let row=0;row<state.pattern.height;row++)context.fillText(String(row+1),33,120+(row+.5)*cellSize+4);
  context.textAlign='left';
  summary.colors.forEach((color,index)=>{const left=40+(index%4)*(width-80)/4;const top=diagram.height+165+Math.floor(index/4)*44;context.fillStyle=color.hex;context.fillRect(left,top,24,24);context.strokeStyle='#BBC3B2';context.strokeRect(left,top,24,24);context.fillStyle='#29372E';context.font='15px sans-serif';context.fillText(`${color.code} · ${color.count} 颗`,left+34,top+18);});
  context.fillStyle='#7B8478';context.font='12px sans-serif';context.fillText('屏幕颜色仅供参考，请以实物色卡为准。 / BEAD ISLAND',40,canvas.height-28);
  const anchor=document.createElement('a');anchor.download=`豆屿-${state.pattern.name}.png`;anchor.href=canvas.toDataURL('image/png');anchor.click();
  notify('图纸和材料清单已导出');
}

function openExample(kind) {
  state.source=sampleArt(kind);state.sourceName=artNames[kind];state.size=32;state.maxColors=12;state.removeBackground=false;state.view='pixel';state.editing=false;generate();navigate('editor');
}

function openWork(id) {
  const work=savedWorks.find(item=>item.id===id);if(!work)return;
  state.pattern=structuredClone(work.pattern);state.sourceName=work.pattern.name;state.savedId=id;
  state.completedRows=[...work.completedRows];state.beadSize=work.beadSize;state.size=work.size;state.maxColors=work.maxColors;
  const canvas=document.createElement('canvas');drawPattern(canvas,state.pattern,{cellSize:1});state.source=canvas;state.view='pixel';state.editing=false;state.removeBackground=false;state.highlighted=null;state.undo=[];state.editColor=countColors(state.pattern)[0]||palette[0];
  navigate(work.completedRows.length?'making':'editor');
}

const actions = {
  back:()=>navigate('home'),
  upload:()=>document.querySelector('#image-input').click(),
  example:()=>openExample('cat'),
  materials:showMaterials,
  close:()=>closeSheet(),
  export:exportPattern,
  background:()=>{state.removeBackground=!state.removeBackground;generate();render();},
  edit:()=>{state.view='pixel';state.editing=!state.editing;render();if(state.editing)notify('选好颜色，再点格子就能修色');},
  'choose-edit-color':()=>openSheet('选一颗画笔颜色',`<p>选择色号后，点图纸上的格子进行修色。</p><label class="search-field">${icon('search')}<input id="edit-color-search" placeholder="搜索色号" aria-label="搜索画笔色号"></label><div class="color-grid" id="edit-color-grid" style="margin-top:12px">${palette.map(color=>`<button class="color-card" data-edit-color="${color.code}">${bead(color)}<span>${color.code}</span></button>`).join('')}</div>`),
  undo:()=>{const previous=state.undo.pop();if(previous){state.pattern.cells[previous.index]=previous.color;render();}},
  save:()=>{saveWork();},
  'save-make':()=>{if(saveWork(true)){state.editing=false;navigate('making');notify('图纸已保存，慢慢拼就好');}},
  mark:()=>{const nextRow=progress().nextRow;if(nextRow===undefined)return;state.completedRows.push(nextRow);const saved=!state.savedId||saveWork(true);render();notify(saved ? (progress().percent===100?'每颗都有位置，作品完成啦！':`第 ${nextRow+1} 行已完成，继续加油`) : '这一行已标记，但保存失败');},
  unmark:()=>{state.completedRows.pop();if(state.savedId)saveWork(true);render();},
  zoom:()=>{state.zoomed=!state.zoomed;render();},
  'use-color':button=>{state.editColor=palette.find(color=>color.code===button.dataset.code);state.editing=true;state.view='pixel';navigate('editor');notify('画笔已选好，点格子开始修色');},
};

document.addEventListener('click',event=>{
  if(event.target.classList.contains('modal-overlay')){closeSheet();return;}
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.page){navigate(button.dataset.page);return;}
  if(button.dataset.artOpen){openExample(button.dataset.artOpen);return;}
  if(button.dataset.workOpen){openWork(button.dataset.workOpen);return;}
  if(button.dataset.view){state.view=button.dataset.view;render();return;}
  if(button.dataset.size){state.size=Number(button.dataset.size);generate();render();return;}
  if(button.dataset.colors){state.maxColors=Number(button.dataset.colors);generate();render();return;}
  if(button.dataset.filter){state.paletteFilter=button.dataset.filter;render();return;}
  if(button.dataset.color){showColor(button.dataset.color);return;}
  if(button.dataset.editColor){showColor(button.dataset.editColor,true);return;}
  if(button.dataset.highlight){state.highlighted=state.highlighted===button.dataset.highlight?null:button.dataset.highlight;render();return;}
  if(button.dataset.action)actions[button.dataset.action]?.(button);
});

app.addEventListener('click',event=>{
  if(event.target.id!=='pattern-canvas'||!state.editing)return;
  const canvas=event.target;
  const bounds=canvas.getBoundingClientRect();
  const column=Math.min(state.pattern.width-1,Math.floor((event.clientX-bounds.left)/bounds.width*state.pattern.width));
  const row=Math.min(state.pattern.height-1,Math.floor((event.clientY-bounds.top)/bounds.height*state.pattern.height));
  const index=row*state.pattern.width+column;
  state.undo.push({index,color:state.pattern.cells[index]});state.pattern.cells[index]=state.editColor;
  state.completedRows=state.completedRows.filter(completed=>completed!==row);
  render();
});

document.addEventListener('input',event=>{
  if(event.target.id==='palette-search'){state.search=event.target.value;updateColorGrid();}
  if(event.target.id==='edit-color-search')document.querySelector('#edit-color-grid').innerHTML=palette.filter(color=>color.code.toLowerCase().includes(event.target.value.toLowerCase())).map(color=>`<button class="color-card" data-edit-color="${color.code}">${bead(color)}<span>${color.code}</span></button>`).join('');
});
document.addEventListener('change',event=>{
  if(event.target.id==='bead-size'){state.beadSize=Number(event.target.value);render();}
});

document.querySelector('#image-input').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  const url=URL.createObjectURL(file);
  try {
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('unsupported');
    const image=new Image();image.src=url;await image.decode();
    const staging=document.createElement('canvas');
    const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
    staging.width=Math.max(1,Math.round(image.naturalWidth*ratio));staging.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    staging.getContext('2d').drawImage(image,0,0,staging.width,staging.height);
    state.source=staging;state.sourceName=file.name.replace(/\.[^.]+$/,'').slice(0,30)||'我的拼豆图纸';
    state.removeBackground=false;state.view='pixel';state.editing=false;generate();navigate('editor');notify('图纸生成好了，试试调整大小和颜色');
  } catch { notify('这张图片没能打开，请选 PNG、JPG 或 WebP'); }
  finally { URL.revokeObjectURL(url);event.target.value=''; }
});

document.addEventListener('keydown',event=>{
  document.documentElement.classList.add('keyboard-mode');
  const overlay=app.querySelector('.modal-overlay');
  if(event.key==='Escape'&&overlay){event.preventDefault();closeSheet();}
  if(event.key==='Tab'&&overlay){
    const controls=Array.from(overlay.querySelectorAll('button:not(:disabled),input,select,a[href]'));
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
document.addEventListener('pointerdown',()=>document.documentElement.classList.remove('keyboard-mode'));
window.addEventListener('beforeunload',()=>{if(state.savedId)saveWork(true);});
render();
if(parameters.get('panel')==='materials')showMaterials();
if(parameters.get('panel')==='color')showColor('B12');
window.__beadPreview={getState:()=>state,getPalette:()=>palette,stats,generate,navigate};
