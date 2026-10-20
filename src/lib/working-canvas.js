import { Zlib } from 'fflate';

const workingCanvases = new WeakSet();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit++) checksum = checksum & 1 ? 0xedb88320 ^ checksum >>> 1 : checksum >>> 1;
  return checksum >>> 0;
});
let fileSequence = 0;

export function createWorkingCanvas(width = 1, height = 1, platform = typeof uni !== 'undefined' ? uni : null) {
  if (!platform?.createOffscreenCanvas) throw new Error('请更新微信后重新打开图片工具');
  const canvas = platform.createOffscreenCanvas({ type: '2d', width, height });
  if (!canvas?.getContext || !canvas.createImage) throw new Error('图片工具暂不可用，请更新微信');
  workingCanvases.add(canvas);
  return canvas;
}

export function isWorkingCanvas(canvas) { return workingCanvases.has(canvas); }

function pngChunk(name, data) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) bytes[index + 4] = name.charCodeAt(index);
  bytes.set(data, 8);
  let checksum = 0xffffffff;
  for (let index = 4; index < bytes.length - 4; index++) checksum = crcTable[(checksum ^ bytes[index]) & 255] ^ checksum >>> 8;
  view.setUint32(bytes.length - 4, (checksum ^ 0xffffffff) >>> 0);
  return bytes;
}

export async function encodeRgbaPng({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 12000000 || data.length !== width * height * 4) throw new Error('图片尺寸超出处理范围');
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width); headerView.setUint32(4, height); header[8] = 8; header[9] = 6;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header)];
  const compressor = new Zlib({ level: 1, mem: 8 }, bytes => { if (bytes.length) parts.push(pngChunk('IDAT', bytes)); });
  const stride = width * 4;
  const row = new Uint8Array(stride + 1); row[0] = 1;
  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    const start = rowIndex * stride;
    for (let index = 0; index < stride; index++) row[index + 1] = (data[start + index] - (index >= 4 ? data[start + index - 4] : 0)) & 255;
    compressor.push(row, rowIndex === height - 1);
    if (rowIndex % 64 === 63) await new Promise(resolve => setTimeout(resolve, 0));
  }
  parts.push(pngChunk('IEND', new Uint8Array(0)));
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function dataDirectory(platform) { return platform?.env?.USER_DATA_PATH || (typeof wx !== 'undefined' ? wx.env?.USER_DATA_PATH : null); }

export async function writeCanvasPng(canvas, platform = typeof uni !== 'undefined' ? uni : null) {
  const directory = dataDirectory(platform);
  if (!directory || !platform?.getFileSystemManager) throw new Error('图片文件暂时无法生成，请重新打开小程序');
  const bytes = await encodeRgbaPng(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
  const filePath = `${directory}/bead-render-${Date.now()}-${(++fileSequence).toString(36)}.png`;
  try { await new Promise((resolve, reject) => platform.getFileSystemManager().writeFile({ filePath, data: bytes.buffer, success: resolve, fail: reject })); }
  catch { await releaseCanvasFile(filePath, platform); throw new Error('图片存储空间不足，请释放空间后重试'); }
  return filePath;
}

export async function releaseCanvasFile(filePath, platform = typeof uni !== 'undefined' ? uni : null) {
  const directory = dataDirectory(platform);
  const prefix = directory + '/bead-render-';
  if (!directory || !filePath?.startsWith(prefix) || !/^\d+-[0-9a-z]+\.png$/.test(filePath.slice(prefix.length))) return;
  await new Promise(resolve => { try { platform.getFileSystemManager().unlink({ filePath, success: resolve, fail: resolve }); } catch { resolve(); } });
}
