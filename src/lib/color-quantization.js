export function colorLab(color) {
  const components = color.rgb || color.hex.slice(1).match(/../g).map(value => parseInt(value, 16));
  const linear = components.map(value => { const normalized = value / 255; return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; });
  const transform = value => value > .008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const coordinateX = transform((linear[0] * .4124564 + linear[1] * .3575761 + linear[2] * .1804375) / .95047);
  const coordinateY = transform(linear[0] * .2126729 + linear[1] * .7151522 + linear[2] * .072175);
  const coordinateZ = transform((linear[0] * .0193339 + linear[1] * .119192 + linear[2] * .9503041) / 1.08883);
  return [116 * coordinateY - 16, 500 * (coordinateX - coordinateY), 200 * (coordinateY - coordinateZ)];
}
export function labDistance(first, second) { return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2; }
export function paletteMatcher(palette) {
  const entries = palette.map(color => ({ color, lab: colorLab(color) }));
  return (red, green, blue) => {
    const target = colorLab({ rgb: [red, green, blue] });
    let best = entries[0], distance = Infinity;
    for (const entry of entries) { const candidate = labDistance(target, entry.lab); if (candidate < distance) { best = entry; distance = candidate; } }
    return best?.color;
  };
}
export function selectPalette(image, palette, maximum) {
  if (maximum >= palette.length) return palette;
  const match = paletteMatcher(palette), histogram = new Map(), cache = new Map();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] < 100) continue;
    const key = image.data[offset] * 65536 + image.data[offset + 1] * 256 + image.data[offset + 2];
    let color = cache.get(key);
    if (!color) { color = match(image.data[offset], image.data[offset + 1], image.data[offset + 2]); cache.set(key, color); }
    const previous = histogram.get(color.code);
    if (previous) previous.weight += image.data[offset + 3] / 255;
    else histogram.set(color.code, { color, weight: image.data[offset + 3] / 255, lab: colorLab(color) });
  }
  const entries = Array.from(histogram.values()).sort((first, second) => second.weight - first.weight);
  if (entries.length <= maximum) return entries.map(entry => entry.color);
  const selected = [entries[0]];
  while (selected.length < maximum) {
    let best, score = -1;
    for (const entry of entries) {
      if (selected.includes(entry)) continue;
      const candidate = Math.sqrt(entry.weight) * Math.min(...selected.map(other => labDistance(entry.lab, other.lab)));
      if (candidate > score) { best = entry; score = candidate; }
    }
    if (!best) break;
    selected.push(best);
  }
  for (let pass = 0; pass < 4; pass++) {
    const clusters = selected.map(() => []);
    for (const entry of entries) { let nearest = 0, distance = Infinity; selected.forEach((other, index) => { const candidate = labDistance(entry.lab, other.lab); if (candidate < distance) { distance = candidate; nearest = index; } }); clusters[nearest].push(entry); }
    let changed = false;
    clusters.forEach((cluster, index) => {
      if (!cluster.length) return;
      const total = cluster.reduce((sum, entry) => sum + entry.weight, 0);
      const center = [0, 1, 2].map(component => cluster.reduce((sum, entry) => sum + entry.lab[component] * entry.weight, 0) / total);
      const best = cluster.reduce((first, second) => labDistance(first.lab, center) <= labDistance(second.lab, center) ? first : second);
      if (best !== selected[index]) { selected[index] = best; changed = true; }
    });
    if (!changed) break;
  }
  return selected.map(entry => entry.color);
}
