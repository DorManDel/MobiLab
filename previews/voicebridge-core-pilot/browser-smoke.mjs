import assert from "node:assert/strict";
import http from "node:http";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const file=new URL("./index.html",import.meta.url);
const html=await readFile(file);
const server=http.createServer((req,res)=>{
  res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(html);
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
          this.onresult?.({results:[{isFinal:true,0:{transcript:"שלום אני בודק את התרגום בזמן אמת"}}]});
        });
      }
      stop(){queueMicrotask(()=>this.onend?.())}
      abort(){queueMicrotask(()=>this.onend?.())}
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
      body:JSON.stringify({responseStatus:200,responseData:{translatedText:"Hello, this is a test of live translation."}})
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
  await page.locator("#start").click();
  assert.match(await page.locator("#top").innerText(),/VU OFF/);
  await page.waitForFunction(()=>document.querySelector("#translatedText")?.textContent?.includes("Hello, this is a test"),null,{timeout:5000});
  assert.match(await page.locator("#translateStatus").innerText(),/COMPLETE/);
  for(let i=0;i<3;i++){
    await page.locator("#next").click();
    if(i<2)await page.waitForFunction(n=>document.querySelector("#position")?.textContent?.startsWith(String(n)),i+2,{timeout:5000});
    else await page.locator("#report").waitFor({state:"visible",timeout:5000});
    if(i<2)await page.waitForFunction(()=>document.querySelector("#translateStatus")?.textContent?.startsWith("COMPLETE"),null,{timeout:5000});
  }
  assert.ok(apiCalls>=4,"preflight and 3 live case calls were expected");
  const txt=await page.locator("#translationResults").innerText();
  assert.match(txt,/3\/3 translated/);
  const d=page.waitForEvent("download");
  await page.locator("#json").click();
  const downloaded=await d;
  const json=JSON.parse(await readFile(await downloaded.path(),"utf8"));
  assert.equal(json.schema,"voicebridge.pilot.report.preview.v2");
  assert.equal(json.pilot.rows.length,3);
  assert.ok(json.pilot.rows.every(r=>r.translationStatus==="success"));
  assert.ok(json.pilot.rows.every(r=>Number.isFinite(r.translationMs)));
  assert.ok(json.pilot.rows.every(r=>r.translatedText.startsWith("Hello")));
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
  await page.waitForFunction(()=>document.querySelector("#translateStatus")?.textContent==="FAILED",null,{timeout:5000});
  await page.locator("#next").click();
  await page.waitForFunction(()=>{
    const value=localStorage.getItem("voicebridge.pilot.https-preview.v2");
    return value&&JSON.parse(value).rows.length>=1;
  },null,{timeout:5000});
  const pilot429=await page.evaluate(()=>JSON.parse(localStorage.getItem("voicebridge.pilot.https-preview.v2")));
  assert.equal(pilot429.rows[0].translationStatus,"error");
  assert.equal(pilot429.rows[0].translationError,"rate_limit_429");
  assert.equal(errors.length,0,"browser JavaScript errors: "+errors.join("; "));
  console.log("PASS: preflight, live final STT translation, automatic Next, report, JSON privacy, and 429 failure");
  await ctx.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
