const test = require('node:test');
const assert = require('node:assert/strict');
const { gridDimensions, convertRgba, countColors, validatePattern, replaceCell, nextIncompleteRow } = require('../src/lib/pattern.js');
const palette = [{code:'H1',hex:'#FFFFFF',rgb:[255,255,255]},{code:'H2',hex:'#000000',rgb:[0,0,0]},{code:'B1',hex:'#008000',rgb:[0,128,0]}];
const pattern = {version:1,paletteId:'mard-221',name:'小猫',width:2,height:2,beadSize:2.6,cells:['H1',null,'B1','H1']};

test('preserves extreme and portrait aspect ratios without zero dimensions',()=>{
  assert.deepEqual(gridDimensions(120,200,32),{width:19,height:32});
  assert.deepEqual(gridDimensions(3000,1,64),{width:64,height:1});
  assert.throws(()=>gridDimensions(0,200,32));
});
test('ignores transparent pixels and counts only actual bead codes',()=>{
  const converted=convertRgba({width:2,height:2,data:Uint8ClampedArray.from([255,255,255,255,0,0,0,0,0,128,0,255,255,255,255,255])},palette,{maxColors:2});
  assert.deepEqual(converted.cells,pattern.cells);
  assert.equal(countColors(converted,palette).reduce((sum,color)=>sum+color.count,0),3);
  assert.equal(countColors(converted,palette).length,2);
});
test('legacy background flag no longer erases white pixels and still honors color maximum',()=>{
  const converted=convertRgba({width:2,height:2,data:Uint8ClampedArray.from([255,255,255,255,0,0,0,255,0,128,0,255,255,255,255,255])},palette,{maxColors:1,removeBackground:true});
  assert.notEqual(converted.cells[0],null);
  assert.notEqual(converted.cells[3],null);
  assert.equal(new Set(converted.cells.filter(Boolean)).size,1);
});
test('rejects invalid cells, unknown codes and mismatched dimensions',()=>{
  assert.ok(validatePattern(pattern,palette));
  assert.throws(()=>validatePattern({...pattern,cells:['H1']},palette));
  assert.throws(()=>validatePattern({...pattern,cells:['ZZZ',null,'B1','H1']},palette));
  assert.throws(()=>validatePattern({...pattern,width:65},palette));
});
test('editing does not mutate original cells and next row skips completed rows',()=>{
  const edited=replaceCell(pattern,1,'H2',palette);
  assert.equal(edited.cells[1],'H2');
  assert.equal(pattern.cells[1],null);
  assert.equal(nextIncompleteRow(4,[0,2]),1);
  assert.equal(nextIncompleteRow(2,[0,1]),null);
});
