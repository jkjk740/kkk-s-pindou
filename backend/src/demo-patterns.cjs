'use strict';

const crypto = require('node:crypto');
const { pattern: validatePattern } = require('./validation.cjs');

const SYSTEM_AUTHOR = Object.freeze({
  id: 's_' + crypto.createHash('sha256').update('bead-island:original-community-patterns:v1').digest('hex'),
  appId: 'bead-island-system',
  displayName: '豆屿图纸'
});

function drawing(width, height) {
  const cells = Array(width * height).fill(null);
  function paint(color, includes) {
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        if (includes(column + 0.5, row + 0.5)) cells[row * width + column] = color;
      }
    }
  }
  function rect(left, top, span, depth, color) {
    paint(color, (column, row) => column >= left && column < left + span && row >= top && row < top + depth);
  }
  function ellipse(centerX, centerY, radiusX, radiusY, color) {
    paint(color, (column, row) => ((column - centerX) / radiusX) ** 2 + ((row - centerY) / radiusY) ** 2 <= 1);
  }
  function oval(centerX, centerY, radiusX, radiusY, fill, border = 'G8') {
    ellipse(centerX, centerY, radiusX, radiusY, border);
    ellipse(centerX, centerY, radiusX - 1.2, radiusY - 1.2, fill);
  }
  function polygon(points, color) {
    paint(color, (column, row) => {
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const [startX, startY] = points[index], [endX, endY] = points[previous];
        if ((startY > row) !== (endY > row) && column < (endX - startX) * (row - startY) / (endY - startY) + startX) inside = !inside;
      }
      return inside;
    });
  }
  function line(startX, startY, endX, endY, color, thickness = 1) {
    const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY), 1);
    for (let step = 0; step <= steps; step += 1) {
      const column = Math.round(startX + (endX - startX) * step / steps);
      const row = Math.round(startY + (endY - startY) * step / steps);
      rect(column - Math.floor(thickness / 2), row - Math.floor(thickness / 2), thickness, thickness, color);
    }
  }
  function face(centerX, top, spacing = 5) {
    rect(centerX - spacing, top, 2, 3, 'G8');
    rect(centerX + spacing - 2, top, 2, 3, 'G8');
    rect(centerX - spacing, top, 1, 1, 'H1');
    rect(centerX + spacing - 2, top, 1, 1, 'H1');
    ellipse(centerX - spacing - 2, top + 4, 2, 1, 'E18');
    ellipse(centerX + spacing + 2, top + 4, 2, 1, 'E18');
    line(centerX - 1, top + 4, centerX, top + 5, 'G8');
    line(centerX, top + 5, centerX + 1, top + 4, 'G8');
  }
  return { cells, rect, ellipse, oval, polygon, line, face };
}

const designs = [
  {
    slug: 'mint-scarf-cat', title: '薄荷围巾小猫', width: 36, height: 40,
    draw({ oval, polygon, rect, line, face }) {
      oval(28, 29, 5, 8, 'A11');
      oval(18, 29, 10, 9, 'A11');
      polygon([[5, 17], [6, 4], [16, 12], [22, 12], [30, 4], [31, 17]], 'G8');
      polygon([[7, 16], [8, 7], [15, 13], [23, 13], [28, 7], [29, 16]], 'A11');
      polygon([[9, 9], [10, 15], [14, 14]], 'E18');
      polygon([[27, 9], [26, 15], [22, 14]], 'E18');
      oval(18, 17, 13, 10, 'A11');
      rect(16, 9, 2, 4, 'G10'); rect(20, 9, 2, 3, 'G10');
      face(18, 16);
      line(6, 20, 10, 21, 'G8'); line(26, 21, 30, 20, 'G8');
      rect(8, 25, 20, 4, 'B7'); rect(9, 26, 18, 2, 'B10');
      rect(23, 28, 4, 8, 'B7'); rect(24, 29, 2, 5, 'B10');
      oval(13, 35, 4, 3, 'H12'); oval(22, 35, 4, 3, 'H12');
    }
  },
  {
    slug: 'carrot-hug-bunny', title: '抱胡萝卜的小兔', width: 32, height: 48,
    draw({ oval, ellipse, polygon, line, face }) {
      oval(11, 12, 4, 10, 'H12'); oval(21, 12, 4, 10, 'H12');
      ellipse(11, 11, 1.5, 6, 'E18'); ellipse(21, 11, 1.5, 6, 'E18');
      oval(16, 36, 9, 10, 'H12'); oval(16, 24, 12, 10, 'H12');
      face(16, 23);
      oval(10, 44, 5, 3, 'H12'); oval(22, 44, 5, 3, 'H12');
      polygon([[12, 33], [23, 31], [20, 44]], 'G8');
      polygon([[14, 34], [21, 33], [19, 41]], 'A7');
      line(17, 36, 19, 36, 'A10'); line(17, 39, 19, 39, 'A10');
      line(18, 32, 16, 28, 'B7', 2); line(19, 32, 22, 28, 'B7', 2);
      oval(10, 35, 3, 4, 'H12'); oval(24, 35, 3, 4, 'H12');
    }
  },
  {
    slug: 'picnic-puppy', title: '野餐面包小狗', width: 44, height: 36,
    draw({ oval, ellipse, rect, polygon, line, face }) {
      rect(3, 28, 38, 6, 'C21');
      for (const column of [5, 13, 21, 29, 37]) rect(column, 28, 3, 6, 'H12');
      rect(3, 30, 38, 2, 'C13');
      oval(22, 24, 11, 8, 'G3');
      oval(10, 14, 5, 10, 'G14'); oval(34, 14, 5, 10, 'G14');
      oval(22, 15, 13, 11, 'G3');
      ellipse(16, 12, 5, 6, 'G14'); ellipse(22, 19, 7, 5, 'H12');
      face(22, 14, 6); rect(21, 18, 2, 2, 'G8');
      polygon([[16, 24], [28, 24], [22, 30]], 'C7');
      oval(32, 29, 8, 5, 'A11');
      line(28, 27, 30, 29, 'G10'); line(32, 26, 34, 28, 'G10');
      oval(14, 29, 4, 3, 'H12');
    }
  },
  {
    slug: 'honey-pot-bear', title: '蜂蜜罐小熊', width: 40, height: 40,
    draw({ oval, ellipse, rect, line, face }) {
      oval(11, 9, 5, 5, 'G9'); oval(29, 9, 5, 5, 'G9');
      ellipse(11, 9, 2, 2, 'G14'); ellipse(29, 9, 2, 2, 'G14');
      oval(20, 29, 11, 9, 'G9'); oval(20, 17, 14, 12, 'G9');
      ellipse(20, 22, 6, 4, 'H12'); face(20, 16, 6);
      rect(19, 20, 2, 2, 'G8');
      oval(20, 31, 8, 7, 'A6'); rect(13, 26, 14, 4, 'G8'); rect(14, 27, 12, 2, 'A11');
      rect(17, 29, 3, 4, 'A11'); rect(20, 29, 3, 2, 'A11');
      oval(10, 30, 4, 4, 'G9'); oval(30, 30, 4, 4, 'G9');
      line(17, 34, 23, 34, 'G8');
      oval(9, 36, 4, 3, 'G9'); oval(31, 36, 4, 3, 'G9');
    }
  },
  {
    slug: 'flower-cactus', title: '开花仙人掌', width: 32, height: 44,
    draw({ oval, ellipse, rect, polygon, line, face }) {
      oval(7, 22, 4, 8, 'B10', 'B9'); oval(25, 20, 4, 8, 'B10', 'B9');
      rect(6, 24, 10, 4, 'B9'); rect(7, 24, 8, 2, 'B10');
      rect(17, 22, 9, 4, 'B9'); rect(18, 22, 7, 2, 'B10');
      oval(16, 21, 6, 15, 'B10', 'B9');
      line(13, 11, 13, 27, 'B7'); line(18, 11, 18, 27, 'B7');
      face(16, 19, 3);
      polygon([[5, 31], [27, 31], [24, 41], [8, 41]], 'G8');
      polygon([[7, 32], [25, 32], [22, 39], [10, 39]], 'A12');
      rect(4, 29, 24, 4, 'G8'); rect(6, 30, 20, 2, 'G1');
      for (const [centerX, centerY] of [[13, 5], [17, 3], [21, 5], [14, 8], [20, 8]]) ellipse(centerX, centerY, 3, 3, 'E12');
      ellipse(17, 6, 2, 2, 'A5');
    }
  },
  {
    slug: 'strawberry-sweetheart', title: '草莓甜心', width: 36, height: 40,
    draw({ ellipse, polygon, rect, face }) {
      polygon([[4, 11], [10, 7], [26, 7], [32, 11], [33, 21], [28, 29], [18, 37], [8, 29], [3, 21]], 'G8');
      polygon([[6, 12], [11, 9], [25, 9], [30, 12], [31, 20], [26, 28], [18, 34], [10, 28], [5, 20]], 'F9');
      ellipse(12, 15, 5, 5, 'E18');
      polygon([[7, 8], [13, 6], [17, 2], [21, 6], [30, 8], [24, 12], [21, 10], [18, 14], [14, 10], [10, 12]], 'B9');
      polygon([[10, 8], [15, 8], [18, 5], [21, 8], [27, 8], [23, 10], [20, 8], [18, 11], [15, 8], [11, 10]], 'B10');
      face(18, 19, 5);
      for (const [column, row] of [[8, 17], [26, 15], [9, 25], [26, 25], [14, 29], [21, 30], [18, 15]]) rect(column, row, 1, 2, 'A11');
    }
  },
  {
    slug: 'cloud-pudding', title: '云朵焦糖布丁', width: 40, height: 32,
    draw({ oval, ellipse, polygon, rect, line, face }) {
      oval(20, 26, 18, 4, 'C21', 'C7'); ellipse(20, 25, 15, 2, 'H12');
      polygon([[11, 9], [29, 9], [33, 25], [7, 25]], 'G8');
      polygon([[13, 10], [27, 10], [30, 23], [10, 23]], 'A11');
      ellipse(20, 10, 10, 4, 'G8'); ellipse(20, 10, 8, 2, 'G10');
      rect(13, 11, 4, 5, 'G10'); rect(24, 11, 3, 3, 'G10');
      face(20, 17, 5);
      ellipse(19, 7, 4, 3, 'H12'); ellipse(22, 5, 3, 3, 'H12'); ellipse(24, 7, 3, 2, 'H12');
      line(23, 4, 25, 2, 'B7'); ellipse(24, 4, 2, 2, 'F9');
    }
  },
  {
    slug: 'mushroom-cottage', title: '蘑菇小屋', width: 40, height: 36,
    draw({ oval, ellipse, polygon, rect, line }) {
      ellipse(20, 32, 18, 3, 'B20');
      polygon([[10, 16], [30, 16], [29, 31], [11, 31]], 'G8');
      rect(12, 17, 16, 13, 'H12');
      oval(20, 25, 4, 6, 'G9'); rect(17, 25, 6, 6, 'G9'); rect(22, 26, 1, 1, 'G8');
      rect(12, 21, 4, 4, 'G8'); rect(13, 22, 2, 2, 'C21');
      rect(25, 21, 3, 4, 'G8'); rect(26, 22, 1, 2, 'C21');
      polygon([[3, 19], [4, 13], [9, 7], [15, 3], [25, 3], [31, 7], [36, 13], [37, 19]], 'G8');
      polygon([[5, 17], [6, 13], [11, 8], [16, 5], [24, 5], [29, 8], [34, 13], [35, 17]], 'F9');
      ellipse(13, 11, 3, 3, 'H12'); ellipse(24, 8, 3, 2, 'H12'); ellipse(29, 14, 3, 2, 'H12');
      for (const column of [5, 33]) {
        line(column, 31, column, 27, 'B7');
        ellipse(column, 26, 2, 2, 'A11'); rect(column, 26, 1, 1, 'A6');
      }
    }
  },
  {
    slug: 'sprout-teacup', title: '茶杯里的小芽', width: 44, height: 32,
    draw({ oval, ellipse, polygon, rect, line, face }) {
      oval(35, 21, 7, 6, 'C21', 'C7'); ellipse(35, 21, 4, 3, null);
      oval(21, 29, 17, 2, 'C21', 'C7');
      polygon([[6, 14], [34, 14], [31, 27], [9, 27]], 'C7');
      polygon([[8, 15], [32, 15], [29, 25], [11, 25]], 'C21');
      oval(20, 15, 14, 4, 'G14', 'C7'); ellipse(20, 15, 11, 2, 'G3');
      line(20, 15, 20, 7, 'B9', 2);
      polygon([[20, 10], [10, 9], [7, 3], [14, 3], [20, 7]], 'B9');
      polygon([[18, 8], [12, 7], [10, 5], [14, 5]], 'B10');
      polygon([[21, 8], [25, 2], [35, 2], [31, 8], [21, 11]], 'B9');
      polygon([[23, 8], [27, 4], [32, 4], [29, 7]], 'B10');
      face(20, 19, 5); rect(10, 19, 2, 4, 'H12');
    }
  },
  {
    slug: 'sleepy-bread', title: '午睡吐司枕头', width: 48, height: 32,
    draw({ oval, ellipse, rect, polygon, line }) {
      oval(24, 27, 21, 3, 'D8', 'D7');
      rect(5, 14, 38, 12, 'G8');
      oval(15, 13, 11, 9, 'G10'); oval(33, 13, 11, 9, 'G10');
      rect(7, 13, 34, 12, 'G10');
      ellipse(15, 13, 8, 6, 'A11'); ellipse(33, 13, 8, 6, 'A11');
      rect(10, 13, 28, 10, 'A11');
      line(15, 16, 17, 18, 'G8'); line(17, 18, 19, 16, 'G8');
      line(29, 16, 31, 18, 'G8'); line(31, 18, 33, 16, 'G8');
      ellipse(12, 20, 2, 1, 'E18'); ellipse(36, 20, 2, 1, 'E18');
      rect(23, 20, 2, 2, 'G8');
      polygon([[19, 23], [24, 20], [29, 23], [29, 28], [19, 28]], 'D7');
      rect(21, 24, 6, 3, 'D8');
      line(38, 4, 42, 4, 'D7'); line(42, 4, 38, 8, 'D7'); line(38, 8, 42, 8, 'D7');
    }
  }
];

function publicIdFor(slug) {
  const bytes = crypto.createHash('sha256').update('bead-island:community-demo:v1:' + slug).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getDemoPatterns() {
  return designs.map(design => {
    const canvas = drawing(design.width, design.height);
    design.draw(canvas);
    const clientId = 'system-demo-v1:' + design.slug;
    const pattern = validatePattern({ version: 1, paletteId: 'mard-221', name: design.title,
      width: design.width, height: design.height, beadSize: 2.6, cells: canvas.cells });
    return { slug: design.slug, title: design.title, clientId, publicId: publicIdFor(design.slug),
      sourceWorkId: crypto.createHash('sha256').update(JSON.stringify([SYSTEM_AUTHOR.id, clientId])).digest('hex'), pattern };
  });
}

module.exports = { SYSTEM_AUTHOR, getDemoPatterns };
