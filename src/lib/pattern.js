import { MAX_GRID_EDGE, MAX_PALETTE_COLORS } from './conversion-limits.js';
import { paletteMatcher, selectPalette } from './color-quantization.js';

function gridDimensions(sourceWidth,sourceHeight,size){
  if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||sourceWidth<=0||sourceHeight<=0||!Number.isInteger(size)||size<1||size>MAX_GRID_EDGE)throw new Error('图片尺寸无效');
  return sourceWidth>=sourceHeight?{width:size,height:Math.max(1,Math.round(size*sourceHeight/sourceWidth))}:{width:Math.max(1,Math.round(size*sourceWidth/sourceHeight)),height:size};
}

function nearestColor(red,green,blue,palette){
  let best=palette[0],distance=Infinity;
  palette.forEach(color=>{const mean=(red+color.rgb[0])/2;const candidate=(2+mean/256)*(red-color.rgb[0])**2+4*(green-color.rgb[1])**2+(2+(255-mean)/256)*(blue-color.rgb[2])**2;if(candidate<distance){distance=candidate;best=color;}});
  return best;
}

function convertRgba(image,palette,options){
  options=options||{};
  if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width>MAX_GRID_EDGE||image.height>MAX_GRID_EDGE||image.data.length!==image.width*image.height*4||!palette.length)throw new Error('图片像素无效');
  const maximum=options.maxColors||12;
  if(!Number.isInteger(maximum)||maximum<1||maximum>MAX_PALETTE_COLORS)throw new Error('颜色数量无效');
  const reduced=selectPalette(image,palette,maximum),match=paletteMatcher(reduced),pixels=[],cache=new Map();
  for(let index=0;index<image.data.length;index+=4){
    const data=image.data;
    if(data[index+3]<100){pixels.push(null);continue;}
    const key=data[index]*65536+data[index+1]*256+data[index+2];
    let color=cache.get(key);if(!color){color=match(data[index],data[index+1],data[index+2]);cache.set(key,color);}
    pixels.push(color.code);
  }
  return {version:1,paletteId:'mard-221',name:options.name||'我的拼豆图纸',width:image.width,height:image.height,beadSize:options.beadSize||2.6,cells:pixels};
}

function countColors(pattern,palette){
  const lookup={};palette.forEach(color=>{lookup[color.code]=color;});
  const counts={};pattern.cells.forEach(code=>{if(code){if(!lookup[code])throw new Error('图纸包含未知色号');counts[code]=(counts[code]||0)+1;}});
  return Object.keys(counts).map(code=>Object.assign({},lookup[code],{count:counts[code]})).sort((first,second)=>second.count-first.count);
}

function validatePattern(pattern,palette){
  const codes=new Set(palette.map(color=>color.code));
  if(!pattern||pattern.version!==1||pattern.paletteId!=='mard-221'||typeof pattern.name!=='string'||!pattern.name.trim()||Array.from(pattern.name).length>60||![2.6,5].includes(pattern.beadSize)||!Number.isInteger(pattern.width)||!Number.isInteger(pattern.height)||pattern.width<1||pattern.height<1||pattern.width>MAX_GRID_EDGE||pattern.height>MAX_GRID_EDGE||!Array.isArray(pattern.cells)||pattern.cells.length!==pattern.width*pattern.height||pattern.cells.some(code=>code!==null&&!codes.has(code)))throw new Error('图纸数据无效');
  if(new Set(pattern.cells.filter(code=>code!==null)).size>MAX_PALETTE_COLORS)throw new Error('图纸颜色超出色卡范围');
  return true;
}

function replaceCell(pattern,index,code,palette){
  if(!Number.isInteger(index)||index<0||index>=pattern.cells.length||!palette.some(color=>color.code===code))throw new Error('画笔位置或色号无效');
  const cells=pattern.cells.slice();cells[index]=code;
  return Object.assign({},pattern,{cells});
}

function nextIncompleteRow(height,completedRows){
  for(let row=0;row<height;row++)if(!completedRows.includes(row))return row;
  return null;
}

function samplePixels(source,width,height){
  const data=new Uint8ClampedArray(width*height*4);
  for(let row=0;row<height;row++)for(let column=0;column<width;column++){
    const sourceColumn=Math.min(source.width-1,Math.floor((column+.5)*source.width/width));
    const sourceRow=Math.min(source.height-1,Math.floor((row+.5)*source.height/height));
    const color=source.cells[sourceRow*source.width+sourceColumn];
    if(color){const index=(row*width+column)*4;const rgb=color.match(/\w\w/g).map(value=>parseInt(value,16));data[index]=rgb[0];data[index+1]=rgb[1];data[index+2]=rgb[2];data[index+3]=255;}
  }
  return {width,height,data};
}

export {gridDimensions,nearestColor,convertRgba,countColors,validatePattern,replaceCell,nextIncompleteRow,samplePixels};
