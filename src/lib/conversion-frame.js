import { gridDimensions } from './pattern.js';
export function conversionFrame(pixels, size) {
  const { width, height, data } = pixels;
  let left = width; let top = height; let right = -1; let bottom = -1; let transparent = false;
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const alpha = data[(row * width + column) * 4 + 3];
    if (alpha < 100) { transparent = true; continue; }
    left = Math.min(left, column); right = Math.max(right, column); top = Math.min(top, row); bottom = Math.max(bottom, row);
  }
  if (right < left) throw new Error('选区为空，请保留需要的主体');
  const padding = transparent ? 1 : 0;
  const cropWidth = right - left + 1; const cropHeight = bottom - top + 1;
  const inner = gridDimensions(cropWidth, cropHeight, size - padding * 2);
  return { left, top, cropWidth, cropHeight, padding, width: inner.width + padding * 2, height: inner.height + padding * 2, innerWidth: inner.width, innerHeight: inner.height };
}
