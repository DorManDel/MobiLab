import { chromium } from 'playwright';
const target='http://127.0.0.1:8123/labs/facefx/';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
let page;
try {
  page=await browser.newPage({viewport:{width:390,height:844}});
  const events=[];
  page.on('pageerror',e=>events.push('pageerror: '+e.message));
  page.on('requestfailed',r=>events.push('requestfailed: '+r.url()+' / '+r.failure()?.errorText));
  page.on('console',m=>{if(m.type()==='error')events.push('console: '+m.text());});
  await page.goto(target,{waitUntil:'domcontentloaded'});
  if(await page.locator('#effect').inputValue()!=='mesh')throw new Error('Face mapping not the default');
  await page.locator('#effect').selectOption('swap');
  await page.locator('[data-preset="studio-ginger"]').click();
  try{
    await page.waitForFunction(()=>document.querySelector('#sourceStatus')?.textContent?.startsWith('SOURCE VERIFIED'),null,{timeout:90000});
  }catch(e){
    console.error('Real model status:',await page.locator('#modelStatus').textContent());
    console.error('Photo status:',await page.locator('#sourceStatus').textContent());
    console.error('Local note:',await page.locator('#localNote').textContent());
    console.error('Diagnostics:',(await page.locator('#log').textContent()).slice(0,2000));
    console.error('Browser requests:',events.slice(-12));
    throw e;
  }
  console.log('Real MediaPipe PHOTO detector loaded studio-ginger face:',await page.locator('#sourceStatus').textContent());
  console.log('Engine:',await page.locator('#modelStatus').textContent());
  // Browser-based live pipeline integration: use a synthetic portrait as a
  // camera stream. No real user's face/video is uploaded to Actions.
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
    const ctx=canvas.getContext('2d');
    const photo=new Image();photo.src=new URL('./presets/studio-ginger.webp',location.href).href;
    await photo.decode();
    let tick=0;
    const paint=()=>{ctx.fillStyle='#999';ctx.fillRect(0,0,640,480);
      const x=130+Math.sin(tick/45)*3;ctx.drawImage(photo,x,45,380,380);
      tick++;requestAnimationFrame(paint);};
    paint();
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>canvas.captureStream(24)}});
  });
  await page.locator('#cameraStart').click();
  try{
    await page.waitForFunction(()=>document.querySelector('#faceCount')?.textContent==='1' && Number(document.querySelector('#swapFps')?.textContent)>0,null,{timeout:75000});
  }catch(error){
    console.error('Live face count:',await page.locator('#faceCount').textContent());
    console.error('Live pipeline:',await page.locator('#pipelineStatus').textContent());
    console.error('Swap FPS:',await page.locator('#swapFps').textContent());
    console.error('Diagnostics:',(await page.locator('#log').textContent()).slice(0,2500));
    throw error;
  }
  console.log('Real MediaPipe LIVE local swap:',await page.locator('#pipelineStatus').textContent());
  if((await page.locator('#pipelineStatus').textContent()).includes('SWAP SUCCESS'))throw Error('Misleading success banner');
  if(!(await page.locator('#pipelineStatus').evaluate(el=>el.classList.contains('is-rendered')&&!el.classList.contains('is-ok'))))throw Error('2D texture should have neutral rendered indicator, not green success');
  await page.locator('#effect').selectOption('mesh');
  await page.waitForFunction(()=>document.querySelector('#pipelineStatus')?.textContent==='FACE MAPPING ACTIVE',null,{timeout:15000});
  console.log('Real 478-point face mapping:',await page.locator('#pipelineStatus').textContent());
  await page.locator('#effect').selectOption('contours');
  await page.waitForFunction(()=>document.querySelector('#pipelineStatus')?.textContent==='FACE MAPPING ACTIVE',null,{timeout:15000});
  await page.locator('#effect').selectOption('points');
  await page.waitForFunction(()=>document.querySelector('#pipelineStatus')?.textContent==='FACE MAPPING ACTIVE',null,{timeout:15000});
  await page.locator('#cameraStop').click();

}finally { await browser.close(); }
