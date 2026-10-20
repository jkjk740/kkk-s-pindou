import { boardOrigin } from './viewport.js';

export function drawViewport(context, pattern, pose, board, ratio, drawPattern, options = {}) {
  const origin = boardOrigin(pose, board);
  const cellSize = board.cellSize * pose.scale;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, board.viewportWidth, board.viewportHeight);
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, board.viewportWidth, board.viewportHeight);
  context.save();
  context.beginPath();
  context.rect(board.padding, board.padding, board.viewportWidth - board.padding * 2, board.viewportHeight - board.padding * 2);
  context.clip();
  context.translate(origin.x, origin.y);
  context.scale(pose.scale, pose.scale);
  const visible = { left: Math.max(0, Math.floor((board.padding - origin.x) / cellSize)), right: Math.min(pattern.width - 1, Math.ceil((board.viewportWidth - board.padding - origin.x) / cellSize)), top: Math.max(0, Math.floor((board.padding - origin.y) / cellSize)), bottom: Math.min(pattern.height - 1, Math.ceil((board.viewportHeight - board.padding - origin.y) / cellSize)) };
  drawPattern(context, pattern, { ...options, visible, mode: 'codes', cellSize: board.cellSize, codeScale: pose.scale });
  context.restore();
  context.fillStyle = '#7b8478';
  context.font = '10px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const labelVisible = (index, length) => cellSize >= 22 || index === 0 || (index + 1) % 5 === 0 || index === length - 1 && length % 5 * cellSize >= 20;
  for (let column = 0; column < pattern.width; column++) {
    const left = origin.x + (column + 0.5) * cellSize;
    if (left >= board.padding && left <= board.viewportWidth - board.padding && labelVisible(column, pattern.width)) context.fillText(String(column + 1), left, 12);
  }
  for (let row = 0; row < pattern.height; row++) {
    const top = origin.y + (row + 0.5) * cellSize;
    if (top >= board.padding && top <= board.viewportHeight - board.padding && labelVisible(row, pattern.height)) context.fillText(String(row + 1), 12, top);
  }
}
