import { nextIncompleteRow } from './pattern.js';

export function applyRowProgress(work, row) {
  if (!Number.isInteger(row) || row < 0 || row >= work.pattern.height) throw new Error('跟拼行号无效');
  const completedRows = work.completedRows.includes(row) ? work.completedRows.filter(value => value !== row) : work.completedRows.concat(row).sort((first, second) => first - second);
  return { completedRows, nextRow: nextIncompleteRow(work.pattern.height, completedRows) };
}
