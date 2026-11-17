import assert from "node:assert/strict";
import http from "node:http";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const file=new URL("./index.html",import.meta.url);
const html=await readFile(file);
const stable=await readFile(new URL("./stable-interim.mjs",import.meta.url));
const server=http.createServer((req,res)=>{
  const modulePath=req.url?.split("?")[0]==="/stable-interim.mjs";
  res.writeHead(200,{"Content-Type":modulePath?"text/javascript; charset=utf-8":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(modulePath?stable:html);
});
await new Promise(resolve=>server.listen(8766,"127.0.0.1",resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const ctx=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2,acceptDownloads:true
  });
  await ctx.addInitScript(()=>{
    class MockRecognition {
      constructor(){this.onresult=null;this.onstart=null;this.onend=null;this.onerror=null;
        this.lang="he-IL";this.interimResults=true;this.continuous=true;}
      start(){
        window.__lastSpeech=this;
        queueMicrotask(()=>{
          this.onstart?.();
          this.onresult?.({results:[{
            isFinal:false,0:{transcript:"שלום אני בודק את התרגום בזמן"}
          }]});
          this._next=setTimeout(()=>this.onresult?.({results:[{
            isFinal:false,0:{transcript:"שלום אני בודק את התרגום בזמן אמת"}
          }]}),65);
        });
      }
      stop(){
        clearTimeout(this._next);
        queueMicrotask(()=>{
          this.onresult?.({results:[{
            isFinal:true,0:{transcript:"שלום אני בודק את התרגום בזמן אמת"}
          }]});
          this.onend?.();
        });
      }
      abort(){clearTimeout(this._next);queueMicrotask(()=>this.onend?.())}
    }
    Object.defineProperty(window,"SpeechRecognition",{configurable:true,value:MockRecognition});
    Object.defineProperty(window,"webkitSpeechRecognition",{configurable:true,value:MockRecognition});
  });
  const page=await ctx.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  let apiCalls=0;
  await page.route("https://api.mymemory.translated.net/get?**",async route=>{
    apiCalls++;
    const url=new URL(route.request().url());
    assert.equal(url.searchParams.get("langpair"),"he|en");
    await route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({responseStatus:200,responseData:{
        translatedText:(url.searchParams.get("q")||"").trim().split(/\\s+/).length<7
          ?"DRAFT preview translation":"FINAL verified translation"
      }})
    });
  });
  await page.goto("http://127.0.0.1:8766/");
  await page.locator("#probe").click();
  await assert.doesNotReject(async()=>{
    await page.waitForFunction(()=>document.querySelector("#probeStatus")?.textContent?.startsWith("✓ Connected"),null,{timeout:5000});
  });
  await page.locator("#script").selectOption("quick");
  await page.locator("#on").uncheck();
  await page.locator("#translator").selectOption("mymemory");
  await page.locator("#captionMode").selectOption("incremental");
  await page.locator("#draftLimit").selectOption("1");
  await page.locator("#start").click();
  assert.match(await page.locator("#top").innerText(),/VU OFF/);
  await page.waitForFunction(()=>document.querySelector("#translateStatus")?.textContent?.includes("LIVE DRAFT"),null,{timeout:5000});
  assert.match(await page.locator("#translatedText").innerText(),/DRAFT preview/);
  assert.match(await page.locator("#recognized").innerText(),/שלום/);
  for(let i=0;i<3;i++){
    await page.locator("#next").click();
    if(i<2)await page.waitForFunction(n=>document.querySelector("#position")?.textContent?.startsWith(String(n)),i+2,{timeout:5000});
    else await page.locator("#report").waitFor({state:"visible",timeout:5000});
    if(i<2)await page.waitForFunction(()=>document.querySelector("#translateStatus")?.textContent?.includes("LIVE DRAFT"),null,{timeout:5000});
  }
  assert.ok(apiCalls>=7,"preflight, live interim drafts and final translation calls were expected");
  const txt=await page.locator("#translationResults").innerText();
  assert.match(txt,/3\/3 translated/);
  assert.equal(await page.locator("#includeWords").isChecked(),false,"speech text export must be opt-in");
  await page.locator("#includeWords").check();
  const d=page.waitForEvent("download");
  await page.locator("#json").click();
  const downloaded=await d;
  const json=JSON.parse(await readFile(await downloaded.path(),"utf8"));
  assert.equal(json.schema,"voicebridge.pilot.report.preview.v3");
  assert.equal(json.pilot.captionMode,"incremental");
  assert.equal(json.pilot.rows.length,3);
  assert.ok(json.pilot.rows.every(r=>r.translationStatus==="success"));
  assert.ok(json.pilot.rows.every(r=>Number.isFinite(r.translationMs)));
  assert.ok(json.pilot.rows.every(r=>r.translatedText.startsWith("FINAL")));
  assert.ok(json.pilot.rows.every(r=>r.liveDraftCalls===1));
  assert.ok(json.pilot.rows.every(r=>Number.isFinite(r.firstDraftMs)));
  assert.ok(json.pilot.rows.every(r=>r.firstDraftMs<r.finalCaptionMs));
  assert.ok(json.pilot.rows.every(r=>r.livePreviewVersions===1));
  assert.equal(json.summary[0].translationSuccesses,3);
  assert.equal(json.privacy.includesSpeechText,true);

  // Redaction: text content must not leak if unchecked.
  await page.locator("#includeWords").uncheck();
  const d2=page.waitForEvent("download");
  await page.locator("#json").click();
  const redacted=JSON.parse(await readFile(await (await d2).path(),"utf8"));
  assert.equal(redacted.privacy.includesSpeechText,false);
  assert.ok(redacted.pilot.rows.every(r=>r.recognized===undefined&&r.translatedText===undefined));
  assert.ok(redacted.pilot.tests.every(c=>c.txt===undefined));

  // Rate limited: status shows failure and report tracks 429.
  await page.unroute("https://api.mymemory.translated.net/get?**");
  await page.route("https://api.mymemory.translated.net/get?**",route=>
    route.fulfill({status:429,contentType:"text/plain",body:"Too many requests"}));
  await page.locator("#new").click();
  await page.locator("#probe").click();
  await page.waitForFunction(()=>document.querySelector("#probeStatus")?.textContent?.includes("rate_limit_429"),null,{timeout:5000});
  await page.locator("#script").selectOption("quick");
  await page.locator("#on").uncheck();
  await page.locator("#start").click();
  await page.waitForFunction(()=>document.querySelector("#draftInfo")?.textContent?.includes("Draft unavailable"),null,{timeout:5000});
  await page.locator("#next").click();
  await page.waitForFunction(()=>{
    const value=localStorage.getItem("voicebridge.pilot.https-preview.v3");
    return value&&JSON.parse(value).rows.length>=1;
  },null,{timeout:5000});
  const pilot429=await page.evaluate(()=>JSON.parse(localStorage.getItem("voicebridge.pilot.https-preview.v2")));
  assert.equal(pilot429.rows[0].translationStatus,"error");
  assert.equal(pilot429.rows[0].translationError,"rate_limit_429");
  assert.equal(errors.length,0,"browser JavaScript errors: "+errors.join("; "));
  console.log("PASS: stable-interim live drafts before final STT, authoritative correction, Next, metrics, privacy, 429");
  await ctx.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
