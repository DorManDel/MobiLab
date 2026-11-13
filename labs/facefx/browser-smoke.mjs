import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
const base='http://127.0.0.1:8123/labs/facefx/';
const FACE_OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const fakeModule=`
const ids=${JSON.stringify(FACE_OVAL)};
const vertices=Array.from({length:478},(_,i)=>({x:.5+.18*Math.sin(i*12.83),y:.5+.25*Math.cos(i*5.83),z:0}));
ids.forEach((id,i)=>{const angle=2*Math.PI*i/ids.length;vertices[id]={x:.5+.3*Math.sin(angle),y:.5-.37*Math.cos(angle),z:0}});
const instance={ async setOptions(){}, detect(){return {faceLandmarks:[vertices]}},detectForVideo(){return {faceLandmarks:[vertices]}} };
export const FilesetResolver={async forVisionTasks(){return {}}};
export const FaceLandmarker={async createFromOptions(){return instance}};
`;
const browser=await chromium.launch({headless:true});
try{
 for(const failJsdelivr of [false,true]){
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/vision_bundle.mjs',route=>{
    if(failJsdelivr && route.request().url().includes('cdn.jsdelivr.net')) return route.abort('failed');
    return route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fakeModule});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('[data-preset]').count(),3,'three preset buttons');
  assert.equal(await page.locator('#viewerGrid').getAttribute('data-view'),'mobile');
  await page.locator('[data-preset="studio-curly"]').click();
  await page.waitForFunction(()=>document.querySelector('#sourceStatus')?.textContent?.startsWith('SOURCE VERIFIED'),{timeout:15000});
  const ready=await page.locator('#sourceStatus').textContent();
  assert.match(ready,/triangles/);
  assert.equal(await page.locator('#sourcePreview').isVisible(),true,'photo preview');
  assert.equal(await page.locator('[data-preset="studio-curly"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#remoteState').textContent(),'OFFLINE','RTX remains unused');
  assert.equal(await page.locator('#peekOriginal').count(),1,'momentary original button');
  assert.equal(await page.locator('#trackingFps').count(),1,'tracking FPS visible');
  assert.equal(await page.locator('#swapFps').count(),1,'swap FPS visible');
  assert.equal(await page.locator('#expressionValue').textContent(),'45%');
  await page.locator('#expression').fill('20');
  assert.equal(await page.locator('#expressionValue').textContent(),'20%');
  await page.locator('#swapQuality').selectOption('fast');
  assert.equal(await page.locator('#swapQuality').inputValue(),'fast');
  await page.locator('#peekOriginal').dispatchEvent('pointerdown');
  assert.equal(await page.locator('#peekOriginal').getAttribute('aria-pressed'),'true');
  await page.locator('#peekOriginal').dispatchEvent('pointerup');
  assert.equal(await page.locator('#peekOriginal').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#pipelineStatus').count(),1,'real-time pipeline health stage');
  await page.locator('#sourcePhoto').setInputFiles(path.resolve('labs/facefx/presets/studio-bangs.webp'));
  await page.waitForFunction(()=>document.querySelector('#sourceStatus')?.textContent?.startsWith('SOURCE VERIFIED'));
  assert.equal(await page.locator('[data-preset="studio-curly"]').getAttribute('aria-pressed'),'false');
  await page.locator('#clearSource').click();
  assert.equal(await page.locator('#sourcePreview').isVisible(),false,'remove source');
  const overflows=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
  assert.equal(overflows,false,'no unexpected horizontal scrolling');
  assert.deepEqual(errors,[],'no uncaught page errors');
  console.log((failJsdelivr?'fallback':'primary')+' source and gallery smoke passed');
  await page.close();
 }
} finally {await browser.close();}
