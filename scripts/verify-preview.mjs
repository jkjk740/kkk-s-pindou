import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const require=createRequire(import.meta.url);
const { chromium }=require(process.env.DESIGN_RUNTIME ? `${process.env.DESIGN_RUNTIME}/playwright` : 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:393,height:852},acceptDownloads:true});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const base=process.env.DESIGN_URL || 'http://localhost:4173';
const state=()=>page.evaluate(()=>window.__beadPreview.getState());
const stats=()=>page.evaluate(()=>window.__beadPreview.stats());
let checks=0;
function checked(name){checks++;console.log(`PASS ${name}`);}

try {
  await page.goto(`${base}/?screen=1`);
  await page.waitForFunction(()=>window.__beadPreview);
  assert.equal(await page.evaluate(()=>window.__beadPreview.getPalette().length),221);
  assert.equal(new Set(await page.evaluate(()=>window.__beadPreview.getPalette().map(color=>color.code))).size,221);
  assert.ok((await stats()).total>0);
  checked('Local palette loads with 221 unique real codes');

  await page.locator('[data-action="example"]').click();
  await page.locator('[data-size="48"]').click();
  assert.equal((await state()).pattern.width,48);
  await page.locator('[data-colors="8"]').click();
  assert.ok((await stats()).colors.length<=8);
  assert.equal((await stats()).colors.reduce((sum,color)=>sum+color.count,0),(await state()).pattern.cells.filter(Boolean).length);
  checked('Grid resizing, maximum colors and material totals update');

  await page.evaluate(()=>window.__beadPreview.navigate('palette'));
  await page.locator('#palette-search').fill('B12');
  assert.equal(await page.locator('#color-grid .color-card').count(),1);
  await page.locator('[data-color="B12"]').click();
  assert.equal(await page.locator('[role="dialog"]').count(),1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.color),'B12');
  await page.locator('#palette-search').fill('#1A6E3D');
  assert.equal(await page.locator('#color-grid .color-card').count(),1);
  assert.equal(await page.locator('#color-grid .color-card').getAttribute('data-color'),'B12');
  await page.locator('#palette-search').fill('ZZ999');
  assert.equal(await page.locator('#color-grid .color-card').count(),0);
  await page.locator('#palette-search').fill('B12');
  await page.locator('[data-color="B12"]').click();
  await page.locator('[data-action="use-color"]').click();
  const before=(await state()).pattern.cells.map(color=>color?.code||null);
  await page.locator('#pattern-canvas').click({position:{x:80,y:80}});
  assert.notDeepEqual((await state()).pattern.cells.map(color=>color?.code||null),before);
  await page.locator('[data-action="undo"]').click();
  assert.deepEqual((await state()).pattern.cells.map(color=>color?.code||null),before);
  checked('Search, color details, focus restoration, manual paint and undo');

  const portrait=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=200;const context=canvas.getContext('2d');context.fillStyle='#FFFFFF';context.fillRect(0,0,120,200);context.fillStyle='#355C48';context.fillRect(20,30,80,140);return canvas.toDataURL().split(',')[1];});
  await page.locator('#image-input').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(portrait,'base64')});
  await page.waitForFunction(()=>window.__beadPreview.getState().sourceName==='portrait');
  assert.equal((await state()).pattern.height,48);
  assert.equal((await state()).pattern.width,29);
  const totalWithBackground=(await stats()).total;
  await page.locator('[data-action="background"]').click();
  assert.ok((await stats()).total<totalWithBackground);
  checked('Portrait images preserve aspect ratio and remove uniform background');

  const currentName=(await state()).sourceName;
  await page.locator('#image-input').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});
  await page.waitForTimeout(200);
  assert.equal((await state()).sourceName,currentName);
  assert.match(await page.locator('.toast').textContent(),/没能打开/);
  checked('Invalid images preserve the previous valid design');

  const transparent=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;return canvas.toDataURL().split(',')[1];});
  await page.locator('#image-input').setInputFiles({name:'transparent.png',mimeType:'image/png',buffer:Buffer.from(transparent,'base64')});
  await page.waitForFunction(()=>window.__beadPreview.getState().sourceName==='transparent');
  assert.equal((await stats()).total,0);
  checked('Fully transparent input produces zero beads without errors');

  await page.evaluate(()=>window.__beadPreview.navigate('home'));
  await page.locator('[data-action="example"]').click();
  await page.locator('[data-action="save-make"]').click();
  await page.locator('[data-action="mark"]').click();
  await page.locator('[data-action="mark"]').click();
  assert.equal((await state()).completedRows.length,2);
  await page.goto(`${base}/?screen=1&page=works`);
  await page.waitForFunction(()=>window.__beadPreview);
  await page.locator('[data-work-open]').first().click();
  assert.equal((await state()).page,'making');
  assert.equal((await state()).completedRows.length,2);
  await page.locator('[data-highlight]').first().click();
  assert.ok((await state()).highlighted);
  await page.locator('[data-action="zoom"]').click();
  assert.ok((await state()).zoomed);
  await page.locator('[data-action="unmark"]').click();
  assert.equal((await state()).completedRows.length,1);
  checked('Saved designs restore exact progress; highlight, zoom and undo work');

  await page.locator('[data-action="materials"]').click();
  const expected=(await stats()).total;
  const displayed=await page.locator('.material-table tbody td:last-child').allTextContents();
  assert.equal(displayed.reduce((sum,text)=>sum+parseInt(text,10),0),expected);
  const downloadEvent=page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  const download=await downloadEvent;
  assert.match(download.suggestedFilename(),/\.png$/);
  const png=await readFile(await download.path());
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.ok(png.readUInt32BE(16)>1000);
  checked('Material sheet totals match and exported file is a full-size PNG');

  for(const width of [320,375,393,430]){
    await page.setViewportSize({width,height:852});
    for(const route of ['home','editor','palette','making','works']){
      await page.evaluate(route=>window.__beadPreview.navigate(route),route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflows at ${width}`);
    }
  }
  checked('All five screens fit 320, 375, 393 and 430 px widths');
  assert.deepEqual(errors,[]);
  checked('No uncaught browser errors throughout the workflow');
  console.log(`Verified ${checks} functional checks.`);
} finally {await browser.close();}
