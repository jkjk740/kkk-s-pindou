import { countColors, validatePattern } from './pattern.js';

function wrapTitle(title, available, measure) {
  const lines = [];
  let line = '';
  for (const character of Array.from(title)) {
    if (line && measure(line + character) > available) { lines.push(line); line = ''; }
    line += character;
  }
  if (line) lines.push(line);
  if (lines.length > 3) {
    lines.length = 3;
    let last = lines[2];
    while (last && measure(last + '…') > available) last = Array.from(last).slice(0, -1).join('');
    lines[2] = last + '…';
  }
  return lines;
}
export function createExportLayout(pattern, palette, options = {}) {
  validatePattern(pattern, palette);
  const colors = countColors(pattern, palette);
  const measure = options.measure || (value => Array.from(value).reduce((total, character) => total + (/[\u0000-\u00ff]/.test(character) ? 18 : 32), 0));
  for (let cellSize = options.cellSize || 40; cellSize >= 16; cellSize--) {
    const minimumWidth = Math.max(720, pattern.width * cellSize + 128);
    for (let width = minimumWidth; width <= 4096; width += 180) {
      const titleLines = wrapTitle('豆屿 · ' + pattern.name, width - 96, measure);
      const grid = { x: (width - pattern.width * cellSize) / 2, y: 48 + titleLines.length * 42 + (options.block ? 112 : 80), width: pattern.width * cellSize, height: pattern.height * cellSize };
      const legendColumns = Math.max(2, Math.floor((width - 96) / 180));
      const legend = { x: 48, y: grid.y + grid.height + 90, columns: legendColumns, columnWidth: (width - 96) / legendColumns, rowHeight: 48 };
      const height = legend.y + Math.ceil(colors.length / legendColumns) * legend.rowHeight + 80;
      if (width <= 4096 && height <= 4096 && width * height <= 12000000) return { width, height, cellSize, grid, colors, total: colors.reduce((total, color) => total + color.count, 0), titleLines, legend, mirror: Boolean(options.mirror), block: options.block || null, cellsMirrored: Boolean(options.cellsMirrored) };
    }
    if (options.cellSize) break;
  }
  throw new Error('整图过大，请选择分块导出');
}
