import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1"],{
  cwd:process.cwd(),stdio:"ignore"
});
let browser;
try {
  let ready=false;
  for(let i=0;i<40;i++){
    try{const r=await fetch("http://127.0.0.1:8765/labs/speech/");if(r.ok){ready=true;break;}}
    catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error("Local HTTP server did not start.");
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.addInitScript(()=>{
    class MockSpeechRecognition {
      constructor(){this.continuous=true;this.interimResults=true;}
      start(){window.__recognition=this;this.onstart?.();}
      abort(){window.__aborted=(window.__aborted||0)+1;}
      emitFinal(transcript){
        const alternatives=[{transcript,confidence:0.95}];
        const results=[Object.assign(alternatives,{isFinal:true})];
        this.onresult?.({resultIndex:0,results});
      }
    }
    Object.defineProperty(window,"SpeechRecognition",{value:MockSpeechRecognition,configurable:true});
    const voice={name:"Test English",lang:"en-US",voiceURI:"test-en",localService:true};
    const synthesis={
      getVoices:()=>[voice],
      addEventListener:()=>{},
      cancel:()=>{},
      resume:()=>{},
      speak(utterance){
        window.__spoken=utterance.text;
        utterance.onstart?.();
        utterance.onend?.();
      }
    };
    Object.defineProperty(window,"speechSynthesis",{configurable:true,value:synthesis});
    Object.defineProperty(window,"SpeechSynthesisUtterance",{configurable:true,
      value:class {constructor(text){this.text=text;}}});
  });
  await page.route("https://api.mymemory.translated.net/get?**",async route=>{
    try{await route.fulfill({status:200,contentType:"application/json",
      headers:{"Access-Control-Allow-Origin":"*"},
      body:JSON.stringify({responseStatus:200,responseData:{translatedText:"Translation A"}})});}
    catch{/* aborted fetch may close route before fulfill */}
  });
  await page.route("https://translate.example.org/translate",async route=>{
    try{await route.fulfill({status:200,contentType:"application/json",
      headers:{"Access-Control-Allow-Origin":"*"},
      body:JSON.stringify({translatedText:"Translation B"})});}
    catch{}
  });
  await page.goto("http://127.0.0.1:8765/labs/speech/");
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"false");
  await page.locator("#testVoice").click();
  assert.equal(await page.evaluate(()=>window.__spoken),"Hello, this is a voice test.");
  await page.locator("#manualText").fill("שלום עולם");
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#cloudEngineResult")?.textContent==="Translation A");
  assert.equal(await page.locator("#captionTranslated").textContent(),"Translation A");
  await page.locator("#speakLast").click();
  assert.equal(await page.evaluate(()=>window.__spoken),"Translation A");

  await page.locator("#recordToggle").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"true");
  await page.evaluate(()=>window.__recognition.emitFinal("עוד משפט"));
  await page.locator("#recordToggle").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"false");
  assert.ok((await page.evaluate(()=>window.__aborted))>=1);

  // Optional second remote engine: same source input, real independent response.
  await page.locator(".provider-config summary").click();
  await page.locator("#compareLibre").check();
  await page.locator("#libreEndpoint").fill("https://translate.example.org");
  await page.locator("#manualText").fill("זאת בדיקה");
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#libreEngineResult")?.textContent==="Translation B");
  assert.equal(await page.locator("#cloudEngineResult").textContent(),"Translation A");
  await page.locator("#referenceTranslation").fill("Translation A");
  assert.match(await page.locator("#benchResults").textContent(),/MyMemory.*100%/);

  const dims=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth,
    width:innerWidth,
    dock:(()=>{const r=document.getElementById("recordDock").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};})()
  }));
  assert.ok(dims.doc <= dims.width+1,"Mobile document must not overflow horizontally: "+JSON.stringify(dims));
  assert.ok(dims.dock.left>=0&&dims.dock.right<=dims.width+1&&dims.dock.bottom<=844,
    "Mobile record dock must remain within screen: "+JSON.stringify(dims));
  assert.deepEqual(errors,[],"No uncaught browser JS exceptions allowed");
  console.log("Browser smoke passed: TTS, speech toggle/abort, manual text, cloud/local-server comparison, reference score and mobile viewport.");
} finally {
  if(browser) await browser.close();
  server.kill("SIGTERM");
}
