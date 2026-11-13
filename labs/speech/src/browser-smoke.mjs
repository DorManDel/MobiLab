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
      emitInterim(transcript) {
        const results=[Object.assign([{transcript,confidence:0.7}],{isFinal:false})];
        this.onresult?.({resultIndex:0,results});
      }
      emitFinal(transcript){
        this.onspeechstart?.();
        const alternatives=[{transcript,confidence:0.95}];
        this.entries ||= [];
        const index=this.entries.length;
        this.entries.push(Object.assign(alternatives,{isFinal:true}));
        this.onresult?.({resultIndex:index,results:this.entries});
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
  let cloudRequests=0,cloud429=false;
  await page.route("https://api.mymemory.translated.net/get?**",async route=>{
    cloudRequests++;
    try{await route.fulfill({status:cloud429?429:200,contentType:"application/json",
      headers:{"Access-Control-Allow-Origin":"*"},
      body:JSON.stringify(cloud429
        ? {responseStatus:429,responseDetails:"Daily limit reached"}
        : {responseStatus:200,responseData:{translatedText:"Translation A"}})});}
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
  assert.equal(await page.locator("#floatingControls #captionText").textContent(),"Translation A");
  assert.equal(await page.locator("#providerScoreRows .score-row").count(),3);
  assert.equal(await page.locator("#liveTranslation").textContent(),"Translation A");
  await page.locator('[data-caption-mode="roll"]').click();
  assert.equal(await page.locator("#liveDeck").getAttribute("data-mode"),"roll");
  assert.ok(await page.locator(".roll-entry").count());
  await page.locator('[data-caption-mode="ticker"]').click();
  assert.equal(await page.locator("#liveDeck").getAttribute("data-mode"),"ticker");
  assert.equal(await page.locator("#liveTicker").textContent(),"Translation A");
  await page.locator('[data-caption-mode="bottom"]').click();
  await page.locator("#speakLast").click();
  assert.equal(await page.evaluate(()=>window.__spoken),"Translation A");

  await page.locator("#floatingControls #record").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"true");
  await page.evaluate(()=>window.__recognition.emitInterim("אני מדבר עכשיו וזו בדיקה של כתוביות"));
  assert.match(await page.locator("#livePartial").textContent(),/אני מדבר עכשיו/);
  await page.evaluate(()=>window.__recognition.emitFinal("עוד משפט"));
  await page.locator("#floatingControls #record").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"false");
  assert.ok((await page.evaluate(()=>window.__aborted))>=1);

  // Floating UI and paragraph grouping: successive finals are one paragraph until pause.
  await page.locator("#floatingControls #langs").click();
  assert.equal(await page.locator("#floatingControls #panel").getAttribute("hidden"),null);
  await page.locator("#floatingControls #lines").selectOption("3");
  await page.locator("#floatingControls #provider").selectOption("fastest");
  const panelRect=await page.locator("#floatingControls #panel").boundingBox();
  assert.ok(panelRect&&panelRect.y>=0&&panelRect.y+panelRect.height<=844,
    "Floating settings should fit mobile viewport.");
  await page.locator("#floatingControls #apply").click();
  assert.equal(await page.locator("#captionLines").inputValue(),"3");
  assert.equal(await page.locator("#captionProvider").inputValue(),"fastest");
  await page.locator("#captionProvider").selectOption("cloud");
  await page.locator("#floatingControls #settings").click();
  await page.locator("#floatingControls #close").click();
  await page.locator("#liveSettings summary").click();
  await page.locator("#silenceDuration").selectOption("900");
  await page.locator("#floatingControls #record").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"true");
  const before=await page.locator("#segments article").count();
  await page.evaluate(()=>{
    window.__recognition.emitFinal("זאת פסקה אחת");
    window.__recognition.emitFinal("והיא ממשיכה לפני שהדובר עוצר");
  });
  assert.equal(await page.locator("#segments article").count(),before,"Must not commit a paragraph before silence");
  await page.waitForFunction((before)=>{
    return document.querySelectorAll("#segments article").length===before+1;
  },before);
  assert.match(await page.locator("#segments article .original").first().textContent(),
    /זאת פסקה אחת והיא ממשיכה לפני שהדובר עוצר/);
  await page.locator('[data-caption-mode="append"]').click();
  await page.waitForFunction(()=>document.querySelectorAll("#liveAppend .append-entry").length>0);
  assert.equal(await page.locator("#liveDeck").getAttribute("data-mode"),"append");
  await page.locator("#captionLines").selectOption("3");
  assert.equal(await page.locator("#liveDeck").evaluate(el=>el.style.getPropertyValue("--caption-lines")),"3");
  await page.locator("#floatingControls #record").click();
  assert.equal(await page.locator("#recordToggle").getAttribute("aria-pressed"),"false");
  assert.match(await page.locator("#liveSttMs").textContent(),/ms|—/);
  assert.match(await page.locator("#liveTotalMs").textContent(),/ms|—/);

  // Optional second remote engine: same source input, real independent response.
  await page.locator(".provider-config summary").click();
  await page.locator("#compareLibre").check();
  await page.locator("#libreEndpoint").fill("https://translate.example.org");
  await page.locator("#manualText").fill("זאת בדיקה");
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#libreEngineResult")?.textContent==="Translation B");
  assert.equal(await page.locator("#cloudEngineResult").textContent(),"Translation A");
  assert.equal(await page.locator("#liveTranslation").textContent(),"Translation A",
    "Late comparison provider must not overwrite selected MyMemory caption.");
  await page.locator("#referenceTranslation").fill("Translation A");
  assert.match(await page.locator("#benchResults").textContent(),/MyMemory.*100%/);
  assert.match(await page.locator("#providerScoreRows").textContent(),/MyMemory/);

  // One log cursor, many interchangeable views: manual focus must not overwrite source.
  assert.ok((await page.locator("#segments article").count())>=2);
  await page.locator("#focusPrev").click();
  assert.match(await page.locator("#focusIndicator").textContent(),/Reviewing saved log/);
  await page.locator("#focusLive").click();
  assert.match(await page.locator("#focusIndicator").textContent(),/Following live/);

  // Reproduce user's real-screen-recording failure: HTTP 429 quota should
  // stop further MyMemory requests, preserve original and use opted-in Libre.
  cloud429=true;
  await page.locator("#manualText").fill("משפט נוסף לבדוק את המכסה");
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#providerBanner")?.hidden===false);
  assert.match(await page.locator("#providerBannerText").textContent(),/429|limit/i);
  const countAfter429=cloudRequests;
  await page.waitForFunction(()=>document.querySelector("#liveTranslation")?.textContent==="Translation B");
  assert.equal(await page.locator("#floatingControls #captionText").textContent(),"Translation B");
  await page.locator("#manualText").fill("עוד משפט שנשמר ומועבר למנוע השני");
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#liveTranslation")?.textContent==="Translation B");
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(cloudRequests,countAfter429,"Circuit breaker must prevent repeated HTTP 429 calls");
  assert.ok((await page.locator("#segments article").first().textContent()).includes("עוד משפט"));

  // The focused source uses its last lines, not the start of a huge paragraph.
  const veryLong="start "+Array.from({length:110},(_,i)=>"word"+i).join(" ")+" last line finish";
  await page.locator("#manualText").fill(veryLong);
  await page.locator("#translateManual").click();
  await page.waitForFunction(()=>document.querySelector("#livePartial")?.textContent.includes("last line finish"));
  await page.waitForFunction(()=>{
    const el=document.getElementById("liveSourceWindow");
    return el.scrollHeight>el.clientHeight && el.scrollTop>0;
  });
  assert.ok((await page.locator("#liveSourceWindow").textContent()).includes("last line finish"));

  // User-selected privacy: local session data is saved only after opt-in.
  await page.locator("#saveLocal").check();
  await page.waitForFunction(()=>document.querySelector("#archiveStatus")?.textContent.includes("Saved locally"));
  const savedCount=Number(await page.locator("#phraseCount").textContent());
  await page.reload();
  await page.waitForFunction(count=>Number(document.querySelector("#phraseCount")?.textContent)>=count,savedCount);
  assert.equal(await page.locator("#saveLocal").isChecked(),true);
  assert.equal(Number(await page.locator("#phraseCount").textContent()),savedCount);
  await page.locator("#clearLocal").click();
  await page.waitForFunction(()=>document.querySelector("#saveLocal")?.checked===false);
  assert.equal(await page.locator("#saveLocal").isChecked(),false);

  const dims=await page.evaluate(()=>({
    doc:document.documentElement.scrollWidth,
    width:innerWidth,
    dock:(()=>{const r=document.getElementById("recordDock").getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};})()
  }));
  assert.ok(dims.doc <= dims.width+1,"Mobile document must not overflow horizontally: "+JSON.stringify(dims));
  assert.ok(dims.dock.left>=0&&dims.dock.right<=dims.width+1&&dims.dock.bottom<=844,
    "Mobile record dock must remain within screen: "+JSON.stringify(dims));
  assert.deepEqual(errors,[],"No uncaught browser JS exceptions allowed");
  console.log("Browser smoke passed: captions, canonical log/focus, floating text, rate-limit breaker/fallback, tail viewport, opt-in archive, TTS and mobile viewport.");
} finally {
  if(browser) await browser.close();
  server.kill("SIGTERM");
}
