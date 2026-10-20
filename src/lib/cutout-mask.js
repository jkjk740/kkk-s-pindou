export function createMaskEditor({ width, height, values, historySteps = 20, historyBytes = 8388608 }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1024 || height > 1024 || values && values.length !== width * height) throw new Error('选区尺寸无效');
  const mask = values ? Uint8Array.from(values) : new Uint8Array(width * height).fill(255);
  const undoStack = []; const redoStack = [];
  let stroke = null; let lastPoint = null; let revision = 0;
  function set(index, value) { if (mask[index] === value) return; if (!stroke.has(index)) stroke.set(index, mask[index]); mask[index] = value; }
  function beginStroke() { if (stroke) endStroke(); stroke = new Map(); lastPoint = null; }
  function endStroke() {
    if (!stroke) return;
    if (stroke.size) {
      const indexes = Uint32Array.from(stroke.keys());
      const before = Uint8Array.from(stroke.values());
      const after = Uint8Array.from(indexes, index => mask[index]);
      undoStack.push({ indexes, before, after }); redoStack.length = 0; revision++;
      let bytes = undoStack.reduce((sum, entry) => sum + entry.indexes.byteLength + entry.before.byteLength + entry.after.byteLength, 0);
      while (undoStack.length > historySteps || bytes > historyBytes) { const removed = undoStack.shift(); bytes -= removed.indexes.byteLength + removed.before.byteLength + removed.after.byteLength; }
    }
    stroke = null; lastPoint = null;
  }
  function dab(point, radius, keep) {
    const left = Math.max(0, Math.floor(point.x - radius)); const right = Math.min(width - 1, Math.ceil(point.x + radius));
    const top = Math.max(0, Math.floor(point.y - radius)); const bottom = Math.min(height - 1, Math.ceil(point.y + radius));
    for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) if ((column + .5 - point.x) ** 2 + (row + .5 - point.y) ** 2 <= radius ** 2) set(row * width + column, keep ? 255 : 0);
  }
  function paint(points, radius, keep) {
    if (!stroke) beginStroke();
    radius = Math.max(.5, Math.min(128, radius));
    for (const point of points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const previous = lastPoint || point;
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / Math.max(1, radius / 2)));
      for (let step = 1; step <= steps; step++) dab({ x: previous.x + (point.x - previous.x) * step / steps, y: previous.y + (point.y - previous.y) * step / steps }, radius, keep);
      lastPoint = point;
    }
  }
  function apply(next) { if (next.length !== mask.length) throw new Error('选区尺寸不匹配'); beginStroke(); for (let index = 0; index < mask.length; index++) set(index, next[index]); endStroke(); }
  function lasso(points) {
    if (points.length < 3) return false;
    const selection = new Uint8Array(mask.length);
    for (let row = 0; row < height; row++) {
      const crossings = []; const scan = row + .5;
      for (let index = 0; index < points.length; index++) {
        const start = points[index]; const end = points[(index + 1) % points.length];
        if ((start.y <= scan && end.y > scan) || (end.y <= scan && start.y > scan)) crossings.push(start.x + (scan - start.y) * (end.x - start.x) / (end.y - start.y));
      }
      crossings.sort((first, second) => first - second);
      for (let index = 0; index + 1 < crossings.length; index += 2) for (let column = Math.max(0, Math.ceil(crossings[index] - .5)); column < Math.min(width, Math.ceil(crossings[index + 1] - .5)); column++) selection[row * width + column] = 255;
    }
    if (!selection.some(Boolean)) return false;
    apply(selection); return true;
  }
  function travel(from, to, field) { endStroke(); const entry = from.pop(); if (!entry) return false; entry.indexes.forEach((index, offset) => { mask[index] = entry[field][offset]; }); to.push(entry); revision++; return true; }
  return { values: () => mask, beginStroke, paint, endStroke, apply, lasso, undo: () => travel(undoStack, redoStack, 'before'), redo: () => travel(redoStack, undoStack, 'after'), status: () => ({ undo: undoStack.length > 0, redo: redoStack.length > 0, revision, visible: mask.some(value => value >= 100) }) };
}
