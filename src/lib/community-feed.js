export function createFeedState() {
  let scopeId = 0, columns = [[], []], heights = [0, 0], cursor = null, seen = new Set();
  const animated = new Set();
  return {
    get scopeId() { return scopeId; }, get cursor() { return cursor; },
    reset() { scopeId++; columns = [[], []]; heights = [0, 0]; cursor = null; seen = new Set(); return scopeId; },
    updateCount(id, count) { columns = columns.map(column => column.map(item => item.id === id ? { ...item, downloadCount: count } : item)); return columns.map(column => column.slice()); },
    append(scope, items, next) {
      if (scope !== scopeId) return null;
      items.forEach((item, index) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        const column = heights[0] <= heights[1] ? 0 : 1;
        const ratio = Math.min(1.6, Math.max(.65, item.height / item.width));
        columns[column].push({ ...item, entering: !animated.has(item.id), imageHeight: Math.round(320 * ratio), delay: Math.min(index * 45, 200) });
        animated.add(item.id);
        heights[column] += 320 * ratio + 130 + (item.title.length > 10 ? 30 : 0);
      });
      cursor = next;
      return columns.map(column => column.slice());
    }
  };
}
