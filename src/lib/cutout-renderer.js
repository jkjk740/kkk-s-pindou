export function maskRgba(original, values) {
  const output = new Uint8ClampedArray(original);
  for (let index = 0; index < values.length; index++) output[index * 4 + 3] = Math.round(original[index * 4 + 3] * values[index] / 255);
  return output;
}
export function maskOutline(values, width, height) {
  if (values.every(value => value >= 128)) return [];
  const edges = []; const stride = Math.max(1, Math.ceil(Math.max(width, height) / 512));
  const inside = (column, row) => column >= 0 && row >= 0 && column < width && row < height && values[row * width + column] >= 128;
  for (let row = 0; row < height; row += stride) for (let column = 0; column < width; column += stride) {
    if (!inside(column, row)) continue;
    if (!inside(column - stride, row)) edges.push([column, row, column, Math.min(height, row + stride)]);
    if (!inside(column + stride, row)) edges.push([Math.min(width, column + stride), row, Math.min(width, column + stride), Math.min(height, row + stride)]);
    if (!inside(column, row - stride)) edges.push([column, row, Math.min(width, column + stride), row]);
    if (!inside(column, row + stride)) edges.push([column, Math.min(height, row + stride), Math.min(width, column + stride), Math.min(height, row + stride)]);
  }
  return edges;
}
export function drawCutout(context, source, geometry, pose, { outline = [], phase = 0, lasso = [], pointer, brushRadius = 0, original } = {}) {
  const width = geometry.viewportWidth; const height = geometry.viewportHeight;
  context.fillStyle = '#fffefa'; context.fillRect(0, 0, width, height);
  context.fillStyle = '#e9eadf';
  for (let row = 0; row < height; row += 16) for (let column = 0; column < width; column += 16) if ((row / 16 + column / 16) % 2 === 0) context.fillRect(column, row, 16, 16);
  context.save(); context.beginPath(); context.rect(0, 0, width, height); context.clip();
  context.translate(width / 2 + pose.x, height / 2 + pose.y); context.scale(geometry.ratio * pose.scale, geometry.ratio * pose.scale); context.translate(-geometry.imageWidth / 2, -geometry.imageHeight / 2);
  context.drawImage(source, 0, 0, geometry.imageWidth, geometry.imageHeight);
  const ratio = geometry.ratio * pose.scale;
  context.lineWidth = 1.2 / ratio;
  if (outline.length) {
    context.beginPath(); outline.forEach(edge => { context.moveTo(edge[0], edge[1]); context.lineTo(edge[2], edge[3]); });
    context.strokeStyle = '#fff'; context.setLineDash([]); context.stroke();
    context.strokeStyle = '#355c48'; context.setLineDash([4 / ratio, 4 / ratio]); context.lineDashOffset = -phase / ratio; context.stroke();
  }
  context.setLineDash([]);
  if (lasso.length) { context.strokeStyle = '#355c48'; context.lineWidth = 2 / ratio; context.beginPath(); lasso.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.stroke(); }
  if (pointer && brushRadius) { context.strokeStyle = '#fff'; context.lineWidth = 3 / ratio; context.beginPath(); context.arc(pointer.x, pointer.y, brushRadius, 0, Math.PI * 2); context.stroke(); context.strokeStyle = '#355c48'; context.lineWidth = 1 / ratio; context.stroke(); }
  context.restore();
  if (pointer && original) {
    const centerX = pointer.x * ratio + width / 2 + pose.x - geometry.imageWidth * ratio / 2;
    const centerY = pointer.y * ratio + height / 2 + pose.y - geometry.imageHeight * ratio / 2;
    const loupeX = Math.max(48, Math.min(width - 48, centerX)); const loupeY = centerY > 115 ? centerY - 75 : centerY + 75;
    const area = 90 / (ratio * 2);
    context.save(); context.beginPath(); context.arc(loupeX, loupeY, 43, 0, Math.PI * 2); context.clip(); context.fillStyle = '#e9eadf'; context.fillRect(loupeX - 45, loupeY - 45, 90, 90);
    context.drawImage(source, Math.max(0, pointer.x - area / 2), Math.max(0, pointer.y - area / 2), Math.min(area, geometry.imageWidth), Math.min(area, geometry.imageHeight), loupeX - 45, loupeY - 45, 90, 90);
    context.restore(); context.strokeStyle = '#355c48'; context.lineWidth = 2; context.beginPath(); context.arc(loupeX, loupeY, 43, 0, Math.PI * 2); context.stroke();
  }
}
