export function clampScale(value) { return Math.max(1, Math.min(6, Number.isFinite(value) ? value : 1)); }
export function normalizePose(pose) {
  return { x: Number.isFinite(pose?.x) ? pose.x : 0, y: Number.isFinite(pose?.y) ? pose.y : 0, scale: clampScale(pose?.scale) };
}
export function samePose(first, second) {
  return Math.abs(first.x - second.x) < 0.1 && Math.abs(first.y - second.y) < 0.1 && Math.abs(first.scale - second.scale) < 0.001;
}
export function zoomAround(pose, nextScale, anchor) {
  const scale = clampScale(nextScale);
  const ratio = scale / clampScale(pose.scale);
  return { x: anchor.x - (anchor.x - pose.x) * ratio, y: anchor.y - (anchor.y - pose.y) * ratio, scale };
}
export function hitCell(point, pose, geometry, pattern) {
  const localX = (point.x - pose.x) / clampScale(pose.scale) - geometry.x;
  const localY = (point.y - pose.y) / clampScale(pose.scale) - geometry.y;
  if (localX < 0 || localY < 0 || localX >= geometry.width || localY >= geometry.height) return null;
  const column = Math.floor(localX / geometry.width * pattern.width);
  const row = Math.floor(localY / geometry.height * pattern.height);
  return { row, column, index: row * pattern.width + column };
}

export function fitBoard(pattern, width, height) {
  const padding = 24;
  const cellSize = Math.max(1, Math.min((width - padding * 2) / pattern.width, (height - padding * 2) / pattern.height));
  return { width: cellSize * pattern.width, height: cellSize * pattern.height, cellSize, viewportWidth: width, viewportHeight: height, padding };
}

export function constrainPose(value, board) {
  const pose = normalizePose(value);
  const horizontal = Math.max(0, (board.width * pose.scale - board.viewportWidth + board.padding * 2) / 2);
  const vertical = Math.max(0, (board.height * pose.scale - board.viewportHeight + board.padding * 2) / 2);
  return { x: Math.max(-horizontal, Math.min(horizontal, pose.x)), y: Math.max(-vertical, Math.min(vertical, pose.y)), scale: pose.scale };
}

export function boardOrigin(pose, board) {
  return { x: (board.viewportWidth - board.width * pose.scale) / 2 + pose.x, y: (board.viewportHeight - board.height * pose.scale) / 2 + pose.y, scale: pose.scale };
}

export function zoomViewport(pose, scale, anchor, board, movement = { x: 0, y: 0 }) {
  const relativeAnchor = { x: anchor.x - board.viewportWidth / 2, y: anchor.y - board.viewportHeight / 2 };
  const next = zoomAround(pose, scale, relativeAnchor);
  return constrainPose({ ...next, x: next.x + movement.x, y: next.y + movement.y }, board);
}
