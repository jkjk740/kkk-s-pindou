'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const colors = new Map(require('./mard-palette.json').map(color => [color.code, color.hex]));
function createCommunityImages(directory) {
  function filename(key) { if (!/^[a-f0-9]{32}\.png$/.test(key)) throw new Error('无效的衍生图标识'); return path.join(directory, key); }
  return {
    async create(pattern) {
      const cell = 12, margin = 12;
      let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + (pattern.width * cell + margin * 2) + '" height="' + (pattern.height * cell + margin * 2) + '"><rect width="100%" height="100%" fill="#F4F3EA"/>';
      pattern.cells.forEach((code, index) => {
        if (!code) return;
        const hex = colors.get(code);
        if (!hex) throw new Error('无效色号');
        const left = margin + index % pattern.width * cell, top = margin + Math.floor(index / pattern.width) * cell;
        svg += '<rect x="' + left + '" y="' + top + '" width="11.6" height="11.6" rx="2" fill="' + hex + '"/><circle cx="' + (left + 6) + '" cy="' + (top + 6) + '" r="1.5" fill="#29372E" opacity=".17"/>';
      });
      svg += '</svg>';
      await fs.mkdir(directory, { recursive: true });
      const storageKey = crypto.randomBytes(16).toString('hex') + '.png';
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      await fs.writeFile(filename(storageKey), png, { flag: 'wx' });
      return { storageKey };
    },
    read(key) { return fs.readFile(filename(key)); },
    async removeTemporary(key) { await fs.unlink(filename(key)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  };
}
module.exports = { createCommunityImages };
