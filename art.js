export function sampleArt(kind = 'cat') {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  const rectangle = (left, top, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(left, top, width, height);
  };
  const polygon = (points, color) => {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([horizontal, vertical], index) => index ? context.lineTo(horizontal, vertical) : context.moveTo(horizontal, vertical));
    context.closePath();
    context.fill();
  };
  const ellipse = (horizontal, vertical, radiusX, radiusY, color) => {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(horizontal, vertical, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
  };
  if (kind === 'cat') {
    const outline = '#654B3D';
    ellipse(23, 24, 6, 4, outline);
    ellipse(23, 23, 5, 3, '#DBA16B');
    ellipse(17, 22, 8, 8, outline);
    ellipse(17, 22, 7, 7, '#EAC295');
    polygon([[7,12],[7,3],[10,3],[14,8],[20,8],[25,3],[27,3],[27,13]], outline);
    polygon([[8,12],[8,5],[10,5],[13,9],[21,9],[25,5],[26,5],[26,13]], '#EAC295');
    polygon([[9,9],[9,6],[12,10]], '#E4A08F');
    polygon([[23,10],[25,6],[25,10]], '#E4A08F');
    ellipse(17, 13, 11, 8, outline);
    ellipse(17, 13, 10, 7, '#EAC295');
    polygon([[16,7],[18,7],[18,13],[20,15],[19,19],[13,19],[13,15],[16,13]], '#FFF2DC');
    rectangle(10, 12, 2, 3, outline);
    rectangle(22, 12, 2, 3, outline);
    rectangle(9, 15, 3, 1, '#E4A08F');
    rectangle(22, 15, 3, 1, '#E4A08F');
    rectangle(16, 14, 2, 1, outline);
    rectangle(17, 15, 1, 2, outline);
    rectangle(15, 16, 2, 1, outline);
    rectangle(18, 16, 2, 1, outline);
    rectangle(10, 20, 14, 2, '#47705C');
    rectangle(11, 22, 12, 5, '#87A58A');
    rectangle(14, 22, 2, 4, '#47705C');
    rectangle(10, 28, 5, 2, '#FFF2DC');
    rectangle(19, 28, 5, 2, '#FFF2DC');
    rectangle(12, 25, 2, 3, '#EAC295');
    rectangle(21, 25, 2, 3, '#EAC295');
    rectangle(3, 22, 1, 7, '#47705C');
    rectangle(1, 23, 2, 2, '#87A58A');
    rectangle(4, 25, 2, 2, '#87A58A');
    rectangle(2, 17, 3, 6, '#FFF2DC');
    rectangle(0, 19, 7, 2, '#FFF2DC');
    rectangle(2, 19, 3, 2, '#E5B15D');
  } else if (kind === 'flower') {
    rectangle(15, 14, 2, 15, '#47705C');
    polygon([[15,23],[8,18],[8,23],[15,26]], '#91A98B');
    polygon([[17,20],[25,17],[24,22],[17,24]], '#91A98B');
    [[11,8],[20,8],[9,15],[22,15],[16,19]].forEach(([horizontal,vertical])=>ellipse(horizontal,vertical,6,6,'#D99179'));
    [[11,8],[20,8],[9,15],[22,15],[16,19]].forEach(([horizontal,vertical])=>ellipse(horizontal,vertical,5,5,'#EEBAA4'));
    ellipse(16,13,5,5,'#D5A056');
    ellipse(16,13,4,4,'#F4DA92');
    rectangle(15,11,2,2,'#FFEFBC');
  } else {
    rectangle(7, 27, 22, 2, '#B49B7D');
    rectangle(8, 13, 17, 13, '#654B3D');
    rectangle(9, 14, 15, 11, '#FAF0D9');
    rectangle(24, 15, 6, 8, '#654B3D');
    rectangle(24, 17, 4, 4, '#FAF0D9');
    rectangle(12, 18, 3, 4, '#47705C');
    rectangle(11, 19, 5, 2, '#47705C');
    rectangle(17, 18, 3, 4, '#47705C');
    rectangle(16, 19, 5, 2, '#47705C');
    rectangle(13, 22, 6, 1, '#47705C');
    rectangle(12, 7, 2, 4, '#B49B7D');
    rectangle(14, 5, 2, 3, '#B49B7D');
    rectangle(20, 7, 2, 4, '#B49B7D');
    rectangle(18, 5, 2, 3, '#B49B7D');
  }
  const pixels = context.getImageData(0, 0, 32, 32);
  for (let index = 0; index < pixels.data.length; index += 4) pixels.data[index + 3] = pixels.data[index + 3] < 128 ? 0 : 255;
  context.putImageData(pixels, 0, 0);
  return canvas;
}

export function nearestColor(red, green, blue, palette) {
  let selected = palette[0];
  let bestDistance = Infinity;
  for (const color of palette) {
    const redMean = (red + color.rgb[0]) / 2;
    const distance = (2 + redMean / 256) * (red - color.rgb[0]) ** 2 + 4 * (green - color.rgb[1]) ** 2 + (2 + (255 - redMean) / 256) * (blue - color.rgb[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      selected = color;
    }
  }
  return selected;
}

export function convertImage(source, palette, { size = 32, maxColors = 12, removeBackground = false } = {}) {
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const width = sourceWidth >= sourceHeight ? size : Math.max(1, Math.round(size * sourceWidth / sourceHeight));
  const height = sourceHeight >= sourceWidth ? size : Math.max(1, Math.round(size * sourceHeight / sourceWidth));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const corner = Array.from(imageData.slice(0, 3));
  const pixels = [];
  const frequency = new Map();
  for (let index = 0; index < imageData.length; index += 4) {
    const transparent = imageData[index + 3] < 100;
    const background = removeBackground && Math.sqrt(corner.reduce((sum, value, component) => sum + (value - imageData[index + component]) ** 2, 0)) < 36;
    if (transparent || background) {
      pixels.push(null);
      continue;
    }
    const color = nearestColor(imageData[index], imageData[index + 1], imageData[index + 2], palette);
    pixels.push(color);
    frequency.set(color.code, (frequency.get(color.code) || 0) + 1);
  }
  const reducedPalette = palette.filter(color => frequency.has(color.code)).sort((first, second) => frequency.get(second.code) - frequency.get(first.code)).slice(0, maxColors);
  const cells = pixels.map((color, index) => color ? nearestColor(imageData[index * 4], imageData[index * 4 + 1], imageData[index * 4 + 2], reducedPalette) : null);
  return { width, height, cells, name: '我的拼豆图纸' };
}

export function countColors(pattern) {
  const counts = new Map();
  for (const color of pattern.cells) if (color) counts.set(color.code, { ...color, count: (counts.get(color.code)?.count || 0) + 1 });
  return Array.from(counts.values()).sort((first, second) => second.count - first.count);
}

export function drawPattern(canvas, pattern, { beads = false, grid = false, codes = false, highlighted = null, completedRows = [], cellSize = 14, background = null } = {}) {
  canvas.width = pattern.width * cellSize;
  canvas.height = pattern.height * cellSize;
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
  pattern.cells.forEach((color, index) => {
    const horizontal = index % pattern.width;
    const vertical = Math.floor(index / pattern.width);
    const left = horizontal * cellSize;
    const top = vertical * cellSize;
    if (!color) return;
    context.globalAlpha = highlighted && color.code !== highlighted ? 0.15 : completedRows.includes(vertical) ? 0.32 : 1;
    context.fillStyle = color.hex;
    if (beads) {
      const inset = Math.max(0.3, cellSize * 0.055);
      context.beginPath();
      context.roundRect(left + inset, top + inset, cellSize - inset * 2, cellSize - inset * 2, cellSize * 0.15);
      context.fill();
      context.fillStyle = 'rgba(55,42,25,0.20)';
      context.beginPath();
      context.arc(left + cellSize / 2, top + cellSize / 2, cellSize * 0.17, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.32)';
      context.fillRect(left + inset * 2, top + inset * 2, cellSize * 0.45, cellSize * 0.055);
    } else {
      context.fillRect(left, top, cellSize, cellSize);
    }
    if (codes && cellSize >= 16) {
      context.fillStyle = color.rgb.reduce((sum, value) => sum + value, 0) > 430 ? '#273128' : '#FFFFFF';
      context.font = `500 ${Math.max(7, cellSize * 0.29)}px system-ui`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(color.code, left + cellSize / 2, top + cellSize / 2);
    }
  });
  context.globalAlpha = 1;
  if (grid) {
    for (let column = 0; column <= pattern.width; column++) {
      context.strokeStyle = column % 5 === 0 ? 'rgba(56,69,49,.27)' : 'rgba(56,69,49,.10)';
      context.lineWidth = column % 5 === 0 ? 1.2 : 0.5;
      context.beginPath(); context.moveTo(column * cellSize, 0); context.lineTo(column * cellSize, canvas.height); context.stroke();
    }
    for (let row = 0; row <= pattern.height; row++) {
      context.strokeStyle = row % 5 === 0 ? 'rgba(56,69,49,.27)' : 'rgba(56,69,49,.10)';
      context.lineWidth = row % 5 === 0 ? 1.2 : 0.5;
      context.beginPath(); context.moveTo(0, row * cellSize); context.lineTo(canvas.width, row * cellSize); context.stroke();
    }
  }
}
