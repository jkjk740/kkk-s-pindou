import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.DESIGN_RUNTIME ? `${process.env.DESIGN_RUNTIME}/playwright` : 'playwright');
const output=fileURLToPath(new URL('../exports/',import.meta.url));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.DESIGN_URL || 'http://localhost:4173';

async function waitForScreen(page){await page.waitForFunction(()=>window.__beadPreview);await page.waitForTimeout(350);}
try {
  const screenContext=await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:3});
  for(const [route,filename] of [['home','01-home'],['editor','02-editor'],['palette','03-palette'],['making','04-making'],['works','05-works']]){
    const page=await screenContext.newPage();await page.goto(`${base}/index.html?screen=1&page=${route}&demo=1`);await waitForScreen(page);
    await page.screenshot({path:`${output}${filename}.png`});await page.close();console.log(`Exported ${filename}.png`);
  }
  for(const [route,panel,filename] of [['editor','materials','06-materials'],['palette','color','07-color-detail']]){
    const page=await screenContext.newPage();await page.goto(`${base}/index.html?screen=1&page=${route}&panel=${panel}`);await waitForScreen(page);await page.screenshot({path:`${output}${filename}.png`});await page.close();console.log(`Exported ${filename}.png`);
  }
  const context=await browser.newContext({viewport:{width:2200,height:1320},deviceScaleFactor:1.5});
  const page=await context.newPage();
  for(const [file,width,height,filename] of [['board.html',2200,1320,'design-overview'],['ux.html',1900,1300,'ux-flow']]){
    await page.setViewportSize({width,height});await page.goto(`${base}/${file}`);
    await Promise.all(page.frames().filter(frame=>frame!==page.mainFrame()).map(frame=>frame.waitForFunction(()=>window.__beadPreview)));
    await page.waitForTimeout(500);await page.screenshot({path:`${output}${filename}.png`,fullPage:true});console.log(`Exported ${filename}.png`);
  }
  await page.setViewportSize({width:1440,height:1100});await page.goto(base);await waitForScreen(page);await page.screenshot({path:`${output}interactive-preview.png`,fullPage:true});console.log('Exported interactive-preview.png');
} finally {await browser.close();}
