import { validatePattern } from './pattern.js';
import { createExportLayout } from './export-layout.js';
export function createExportPlan(pattern, palette, { mirror = false, format = 'full' } = {}) {
  validatePattern(pattern, palette);
  if (!['full', 'tiles'].includes(format)) throw new Error('导出方式无效');
  if (format === 'full') return [{ pattern: { ...pattern, cells: pattern.cells.slice() }, layout: createExportLayout(pattern, palette, { mirror }), mirror, block: null }];
  const columns = Math.ceil(pattern.width / 64); const rows = Math.ceil(pattern.height / 64); const pages = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const startRow = row * 64; const startColumn = column * 64; const width = Math.min(64, pattern.width - startColumn); const height = Math.min(64, pattern.height - startRow);
    const cells = [];
    for (let localRow = 0; localRow < height; localRow++) for (let localColumn = 0; localColumn < width; localColumn++) {
      const outputColumn = startColumn + localColumn;
      const originalColumn = mirror ? pattern.width - 1 - outputColumn : outputColumn;
      cells.push(pattern.cells[(startRow + localRow) * pattern.width + originalColumn]);
    }
    const tile = { ...pattern, width, height, cells };
    const block = { row, column, rows, columns, startRow, startColumn, totalWidth: pattern.width, totalHeight: pattern.height };
    pages.push({ pattern: tile, layout: createExportLayout(tile, palette, { cellSize: 40, mirror, cellsMirrored: true, block }), mirror, cellsMirrored: true, block });
  }
  return pages;
}
