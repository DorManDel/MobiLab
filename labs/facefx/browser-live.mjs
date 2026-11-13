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
  await page.locator('[data-preset="studio-ginger"]').click();
  try{
    await page.waitForFunction(()=>document.querySelector('#sourceStatus')?.textContent?.startsWith('Ready:'),null,{timeout:90000});
  }catch(e){
    console.error('Real model status:',await page.locator('#modelStatus').textContent());
    console.error('Photo status:',await page.locator('#sourceStatus').textContent());
    console.error('Local note:',await page.locator('#localNote').textContent());
    console.error('Diagnostics:',(await page.locator('#log').textContent()).slice(0,2000));
    console.error('Browser requests:',events.slice(-12));
    throw e;
  }
  console.log('Real MediaPipe loaded and detected studio-ginger face:',await page.locator('#sourceStatus').textContent());
  console.log('Engine:',await page.locator('#modelStatus').textContent());
}finally { await browser.close(); }
