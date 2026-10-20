import paletteData from '../data/mard.json';
const palette=paletteData.colors;
import {countColors} from './pattern.js';
import {createExportLayout} from './export-layout.js';
import { isWorkingCanvas, writeCanvasPng } from './working-canvas.js';
const lookup={};palette.forEach(color=>{lookup[color.code]=color;});

function drawPattern(context,pattern,options){
  options=options||{};const cell=options.cellSize||12;const codeScale=options.codeScale||1;
  context.clearRect(0,0,pattern.width*cell,pattern.height*cell);
  if(options.background){context.fillStyle=options.background;context.fillRect(0,0,pattern.width*cell,pattern.height*cell);}
  pattern.cells.forEach((code,index)=>{
    if(!code)return;const color=lookup[code];if(!color)return;
    const column=index%pattern.width,row=Math.floor(index/pattern.width),left=column*cell,top=row*cell;
    if(options.visible&&(column<options.visible.left||column>options.visible.right||row<options.visible.top||row>options.visible.bottom))return;
    context.globalAlpha=options.highlighted&&options.highlighted!==code ? 0.15 : (options.completedRows||[]).includes(row) ? 0.3 : 1;
    context.fillStyle=color.hex;
    const inset=options.mode==='beads'?cell*.05:0;
    context.fillRect(left+inset,top+inset,cell-inset*2,cell-inset*2);
    if(options.mode==='beads'){context.fillStyle='rgba(30,45,25,.17)';context.beginPath();context.arc(left+cell/2,top+cell/2,cell*.17,0,Math.PI*2);context.fill();}
    if(options.mode==='codes'&&cell*codeScale>=8){context.fillStyle=color.rgb.reduce((sum,value)=>sum+value,0)>430?'#29372E':'#FFFFFF';context.font=`500 ${Math.max(4/codeScale,cell*.3)}px sans-serif`;context.textAlign='center';context.textBaseline='middle';context.fillText(code,left+cell/2,top+cell/2);}
  });
  context.globalAlpha=1;
  if(options.mode==='codes'){
    for(let column=0;column<=pattern.width;column++){context.strokeStyle=column%5===0?'rgba(55,75,42,.35)':'rgba(55,75,42,.15)';context.lineWidth=(column%5===0?1:.5)/codeScale;context.beginPath();context.moveTo(column*cell,0);context.lineTo(column*cell,pattern.height*cell);context.stroke();}
    for(let row=0;row<=pattern.height;row++){context.strokeStyle=row%5===0?'rgba(55,75,42,.35)':'rgba(55,75,42,.15)';context.lineWidth=(row%5===0?1:.5)/codeScale;context.beginPath();context.moveTo(0,row*cell);context.lineTo(pattern.width*cell,row*cell);context.stroke();}
  }
}

function textColor(color) {
  const linear = color.rgb.map(value => { const normalized = value / 255; return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4); });
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? '#202420' : '#FFFFFF';
}

function drawExport(canvas, pattern, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new Error('高清画布还未准备好，请重试');
  const measuring = canvas.getContext('2d');
  measuring.font = '600 32px sans-serif';
  const layout = createExportLayout(pattern, palette, { ...options, measure: value => measuring.measureText(value).width });
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext('2d');
  const { grid, cellSize, legend } = layout;
  context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, layout.width, layout.height);
  context.textAlign = 'left'; context.textBaseline = 'top'; context.fillStyle = '#202420'; context.font = '600 32px sans-serif';
  layout.titleLines.forEach((line, index) => context.fillText(line, 48, 40 + index * 42));
  context.font = '22px sans-serif'; context.fillStyle = '#61675F';
  if (layout.block) context.fillText(`分块 ${layout.block.row + 1}-${layout.block.column + 1} / 全图 ${layout.block.totalWidth} × ${layout.block.totalHeight} 格`, 48, grid.y - 100);
  context.fillText(pattern.width + ' × ' + pattern.height + ' 格 / ' + layout.colors.length + ' 色 / 共 ' + layout.total + ' 颗 / ' + (layout.mirror ? '左右镜像' : '正面图纸'), 48, grid.y - 68);
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = `500 ${Math.max(8, Math.min(12, cellSize * .34))}px sans-serif`;
  for (let row = 0; row < pattern.height; row++) {
    for (let column = 0; column < pattern.width; column++) {
      const sourceColumn = layout.mirror && !layout.cellsMirrored ? pattern.width - 1 - column : column;
      const code = pattern.cells[row * pattern.width + sourceColumn];
      if (!code) continue;
      const color = lookup[code];
      const left = grid.x + column * cellSize; const top = grid.y + row * cellSize;
      context.fillStyle = color.hex; context.fillRect(left, top, cellSize, cellSize);
      context.fillStyle = textColor(color); context.fillText(code, left + cellSize / 2, top + cellSize / 2);
    }
  }
  function gridLine(position, length, vertical) {
    const coordinate = position + (vertical ? layout.block?.startColumn || 0 : layout.block?.startRow || 0);
    context.strokeStyle = coordinate % 5 === 0 ? '#DC5C58' : '#D5D7D3';
    context.lineWidth = coordinate % 10 === 0 ? 2 : coordinate % 5 === 0 ? 1.3 : 0.6;
    context.beginPath();
    context.moveTo(grid.x + (vertical ? position * cellSize : 0), grid.y + (vertical ? 0 : position * cellSize));
    context.lineTo(grid.x + (vertical ? position * cellSize : length), grid.y + (vertical ? length : position * cellSize));
    context.stroke();
  }
  for (let column = 0; column <= pattern.width; column++) gridLine(column, grid.height, true);
  for (let row = 0; row <= pattern.height; row++) gridLine(row, grid.width, false);
  context.strokeStyle = '#D44D49'; context.lineWidth = 2; context.strokeRect(grid.x, grid.y, grid.width, grid.height);
  context.fillStyle = '#666B63'; context.font = `${Math.max(8, Math.min(14, cellSize * .38))}px sans-serif`;
  for (let column = 0; column < pattern.width; column++) {
    const left = grid.x + (column + 0.5) * cellSize;
    context.fillText(String(column + 1 + (layout.block?.startColumn || 0)), left, grid.y - 22);
    context.fillText(String(column + 1 + (layout.block?.startColumn || 0)), left, grid.y + grid.height + 22);
  }
  for (let row = 0; row < pattern.height; row++) {
    const top = grid.y + (row + 0.5) * cellSize;
    context.fillText(String(row + 1 + (layout.block?.startRow || 0)), grid.x - 24, top);
    context.fillText(String(row + 1 + (layout.block?.startRow || 0)), grid.x + grid.width + 24, top);
  }
  context.textAlign = 'left'; context.fillStyle = '#202420'; context.font = '600 22px sans-serif';
  context.fillText('MARD 色号 / 用量', legend.x, legend.y - 28);
  layout.colors.forEach((color, index) => {
    const left = legend.x + index % legend.columns * legend.columnWidth;
    const top = legend.y + Math.floor(index / legend.columns) * legend.rowHeight;
    context.fillStyle = color.hex; context.fillRect(left, top, 30, 30);
    context.strokeStyle = '#C9CCC5'; context.lineWidth = 0.8; context.strokeRect(left, top, 30, 30);
    context.fillStyle = '#202420'; context.font = '18px sans-serif'; context.fillText(color.code + ' · ' + color.count, left + 40, top + 15);
  });
  context.fillStyle = '#737A6F'; context.font = '18px sans-serif';
  context.fillText('颜色以实物为准 · ' + pattern.beadSize + ' mm · BEAD ISLAND', 48, layout.height - 36);
  return layout;
}

async function savePngToAlbum(filePath, options = {}) {
  if (options.openSettings) {
    const settings = await new Promise((resolve, reject) => uni.openSetting({ success: resolve, fail: reject }));
    if (!settings.authSetting?.['scope.writePhotosAlbum']) {
      const error = new Error('尚未允许保存到相册，可稍后重试'); error.code = 'ALBUM_PERMISSION'; error.retryPath = filePath; throw error;
    }
  }
  try { await new Promise((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject })); }
  catch (cause) {
    const denied = /auth deny|auth denied|authorize|permission/i.test(cause?.errMsg || '');
    const error = new Error(denied ? '需要相册权限，请点击下方按钮打开设置并重试' : '保存相册未完成，可以重试已生成的图片');
    error.code = denied ? 'ALBUM_PERMISSION' : 'ALBUM_SAVE_FAILED'; error.retryPath = filePath; throw error;
  }
  return filePath;
}

async function waitForCanvas(canvas) {
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 80);
    if (typeof canvas.requestAnimationFrame === 'function') canvas.requestAnimationFrame(() => { clearTimeout(timeout); resolve(); });
    else { clearTimeout(timeout); setTimeout(resolve, 16); }
  });
}

async function renderPatternPreview(canvas, pattern, options = {}) {
  if (!canvas || !pattern?.cells) throw new Error('图纸预览暂不可用');
  const cellSize = 320 / Math.max(pattern.width, pattern.height);
  canvas.width = Math.ceil(pattern.width * cellSize);
  canvas.height = Math.ceil(pattern.height * cellSize);
  drawPattern(canvas.getContext('2d'), pattern, { cellSize, mode: 'beads', background: '#F4F3EB' });
  if (isWorkingCanvas(canvas)) return writeCanvasPng(canvas);
  await waitForCanvas(canvas);
  const result = await new Promise((resolve, reject) => uni.canvasToTempFilePath({
    canvas, x: 0, y: 0, width: canvas.width, height: canvas.height,
    destWidth: canvas.width, destHeight: canvas.height, fileType: 'png', success: resolve, fail: reject
  }, options.scope));
  if (!result.tempFilePath) throw new Error('图纸预览暂不可用');
  return result.tempFilePath;
}

async function encodeExport(canvas, pattern, options = {}) {
  options.onPhase?.('drawing');
  const layout = drawExport(canvas, pattern, options);
  await waitForCanvas(canvas);
  options.onPhase?.('encoding');
  let result;
  try {
    result = isWorkingCanvas(canvas) ? { tempFilePath: await writeCanvasPng(canvas) } : await new Promise((resolve, reject) => uni.canvasToTempFilePath({
      canvas, x: 0, y: 0, width: layout.width, height: layout.height,
      destWidth: layout.width, destHeight: layout.height, fileType: 'png', success: resolve, fail: reject
    }, options.scope));
    if (!result.tempFilePath) throw new Error();
  } catch { throw new Error('高清 PNG 生成失败，请重新导出或选择较小图纸'); }
  finally { canvas.width = 1; canvas.height = 1; }
  return result.tempFilePath;
}
async function saveExport(canvas, pattern, options = {}) { const path = await encodeExport(canvas, pattern, options); options.onPhase?.('saving'); return savePngToAlbum(path); }
export { drawPattern, drawExport, saveExport, encodeExport, savePngToAlbum, renderPatternPreview };
