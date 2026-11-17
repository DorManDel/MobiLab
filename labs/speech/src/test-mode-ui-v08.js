/**
 * VoiceBridge mobile Test Mode controls.
 * Start/finish controls are scoped to one run; ZIP/JSON/CSV are generated on
 * the device. Microphone and translation provider actions stay in app.js.
 */
import {TestSessionRecorder,makeBundleZip,segmentsCsv} from "./test-session-v08.js";
const SCENARIOS={
  live:"Live translation",
  "stt-only":"Speech recognition only",
  "long-speech":"Long speech · continuity",
  compare:"Enabled engine comparison"
};
function download(name,data,mime){
  const blob=data instanceof Blob?data:new Blob([data],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function browserFamily(){
  const ua=navigator.userAgent||"";
  if(/SamsungBrowser/i.test(ua))return "Samsung Internet";
  if(/EdgA|Edg\//i.test(ua))return "Edge";
  if(/Chrome|CriOS/i.test(ua))return "Chrome";
  if(/Firefox|FxiOS/i.test(ua))return "Firefox";
  if(/Safari/i.test(ua))return "Safari";
  return "Other";
}
function deviceContext(){
  return {browser:browserFamily(),
    viewportWidth:Math.round(window.innerWidth),viewportHeight:Math.round(window.innerHeight),
    language:navigator.language||null,
    online:navigator.onLine,
    effectiveNetworkType:navigator.connection?.effectiveType||null};
}
function element(tag,props={},children=[]){
  const el=document.createElement(tag);
  for(const [key,val] of Object.entries(props)){
    if(key==="textContent")el.textContent=val;
    else if(key==="className")el.className=val;
    else if(key==="id")el.id=val;
    else el.setAttribute(key,String(val));
  }
  for(const child of children)el.append(child);
  return el;
}
const measure=value=>value===null||value===undefined?"—":value+" ms";
export function createTestModeUI({ledger,telemetry,nav,diagnostics}){
  let hooks={};
  let savedAutoTranslate=null;
  let timer=null;
  const recorder=new TestSessionRecorder({
    ledger,
    onChange:()=>{render();if(recorder.ready)restoreAutoTranslate();}
  });
  telemetry.onEvent=event=>recorder.onEvent(event);
  const card=element("section",{id:"vbTestPanel",className:"vb-dashboard-surface vb-test-panel",
    "aria-label":"Test Mode recorder"});
  const kicker=element("span",{className:"vb-tab-label",textContent:"TEST MODE · LOCAL ANALYTICS"});
  const heading=element("div",{className:"vb-test-head"},[
    element("strong",{textContent:"One-tap pipeline test"}),
    element("span",{id:"vbTestState",className:"vb-test-badge",textContent:"READY"})
  ]);
  const scenarioLabel=element("label",{"for":"vbTestScenario",textContent:"Scenario"});
  const scenarioSelect=element("select",{id:"vbTestScenario","aria-label":"Test scenario"});
  for(const [id,title] of Object.entries(SCENARIOS))
    scenarioSelect.append(element("option",{value:id,textContent:title}));
  const scenarioWrap=element("div",{className:"vb-test-scenario"},[scenarioLabel,scenarioSelect]);
  const notes=element("input",{id:"vbTestLabel",type:"text",maxlength:"100",
    placeholder:"Optional run label, e.g. VU off / MyMemory",
    "aria-label":"Run label"});
  const start=element("button",{id:"vbStartTest",type:"button",textContent:"● Start Test"});
  const finish=element("button",{id:"vbFinishTest",type:"button",textContent:"■ Finish"});
  const showReport=element("button",{id:"vbViewTest",type:"button",textContent:"View report"});
  const controls=element("div",{className:"vb-test-actions"},[start,finish,showReport]);
  const status=element("p",{id:"vbTestStatus",role:"status",
    textContent:"Start a test to capture real speech, translation and errors."});
  const helper=element("p",{className:"vb-test-helper",textContent:
    "STT-only temporarily disables automatic translation. Compare uses only the providers you already enabled. No extra engine is contacted silently."});
  card.append(kicker,heading,scenarioWrap,notes,controls,status,helper);
  nav.after(card);
  const result=element("section",{id:"vbTestReport",className:"vb-test-report",
    "aria-label":"Test session analytics report"});
  const title=element("h3",{textContent:"Test Session Report"});
  const metrics=element("div",{className:"vb-test-metrics",id:"vbTestMetrics"});
  const privacy=element("label",{className:"vb-test-privacy"});
  const includeText=element("input",{id:"vbIncludeText",type:"checkbox",
    "aria-label":"Include original and translated words in exports"});
  privacy.append(includeText,document.createTextNode(" Include transcript words in exported files (optional)"));
  const zip=element("button",{id:"vbDownloadBundle",type:"button",textContent:"↓ Export Test Bundle ZIP"});
  const json=element("button",{id:"vbDownloadTestJson",type:"button",textContent:"JSON"});
  const csv=element("button",{id:"vbDownloadTestCsv",type:"button",textContent:"CSV"});
  const exports=element("div",{className:"vb-test-actions"},[zip,json,csv]);
  const disclaimer=element("p",{className:"vb-test-helper",textContent:
    "Default exports have no spoken text, raw audio, API keys or full provider error messages. ZIP contains summary.json + segments.csv + events.csv. STT timing is an estimate."});
  result.append(title,metrics,privacy,exports,disclaimer);
  diagnostics.prepend(result);
  const textId=()=>(recorder.id||"run").slice(0,8);
  const name=ext=>"voicebridge-"+(recorder.scenario||"test")+"-"+textId()+"."+ext;
  const selected=()=>recorder.bundle({includeText:includeText.checked});
  function restoreAutoTranslate(){
    if(savedAutoTranslate===null)return;
    const auto=document.getElementById("autoTranslate");
    if(auto)auto.checked=savedAutoTranslate;
    savedAutoTranslate=null;
  }
  function finalizeTimer(){
    clearInterval(timer);timer=null;
  }
  function render(){
    const phase=recorder.phase;
    const active=phase==="recording"||phase==="finishing";
    start.disabled=active;
    finish.disabled=phase!=="recording";
    showReport.disabled=!recorder.ready;
    zip.disabled=json.disabled=csv.disabled=!recorder.ready;
    scenarioSelect.disabled=notes.disabled=active;
    result.hidden=!recorder.ready;
    card.dataset.state=phase;
    const words={idle:"READY",recording:"RECORDING",finishing:"FINALIZING",ready:"REPORT READY"};
    document.getElementById("vbTestState").textContent=words[phase];
    if(phase==="recording")status.textContent="Recording · "+recorder.events.length+
      " timeline events · mic and translator use your current Settings.";
    if(phase==="finishing")status.textContent="Recording stopped. Collecting final translation results…";
    if(phase==="ready"){
      finalizeTimer();
      const b=recorder.bundle();
      const s=b.summary;
      const warn=s.capturedSegments===0?" No finalized speech detected. Check microphone / STT.":"";
      status.textContent="Run "+textId()+" · "+s.capturedSegments+" paragraphs · "+
        (s.completionPercent===null?"STT-only / no translation score":s.completionPercent+"% translated")+
        " · "+b.run.finishReason+"."+warn;
      const boxes=[
        ["Finalized paragraphs",String(s.capturedSegments)],
        ["Translated",String(s.translatedSegments)],
        ["STT → Final p50",measure(s.stt.p50Ms)],
        ["Queue p50",measure(s.queueWait.p50Ms)],
        ["Provider p50",measure(
          Object.values(s.providerPerformance).flatMap(p=>p.latency.p50Ms===null?[]:[p.latency.p50Ms])[0]??null)],
        ["Final → Caption p90",measure(s.finalToCaption.p90Ms)],
        ["Duplicate finals",String(s.duplicatedFinalsSuppressed)],
        ["Recognizer errors",String(s.recognizerErrors)]
      ];
      const frag=document.createDocumentFragment();
      for(const [name,value] of boxes){
        frag.append(element("div",{className:"vb-test-stat"},[
          element("span",{textContent:name}),element("strong",{textContent:value})]));
      }
      metrics.replaceChildren(frag);
    }
    if(phase==="idle")status.textContent="Start a test to capture real speech, translation and errors.";
  }
  start.addEventListener("click",()=>{
    if(recorder.recording||recorder.pending)return;
    const scenario=scenarioSelect.value;
    const auto=document.getElementById("autoTranslate");
    if(scenario==="stt-only"&&auto){
      savedAutoTranslate=auto.checked;
      auto.checked=false;
    }
    let config={};
    try{config=hooks.getConfig?.()||{};}catch{}
    recorder.begin({scenario,label:notes.value,metadata:config,environment:deviceContext()});
    includeText.checked=false;
    if(!hooks.isRecording?.()){
      try{hooks.startRecording?.();}
      catch(error){recorder.seal("microphone_start_failed");}
    }
    if(!hooks.isRecording?.() && recorder.recording)recorder.requestStop("microphone_unavailable");
    if(timer===null)timer=setInterval(render,1000);
    render();
  });
  finish.addEventListener("click",()=>{
    if(!recorder.recording)return;
    if(hooks.isRecording?.()){
      try{hooks.finishRecording?.();}catch{recorder.requestStop("stop_failed");}
    }else recorder.requestStop();
    // Final paragraph flush uses current autoTranslate setting. Restore only
    // once the call returns (or after a manual mic Stop has fully returned).
    queueMicrotask(restoreAutoTranslate);
    render();
  });
  showReport.addEventListener("click",()=>{
    nav.querySelector('[data-vb-tab="diagnostics"]')?.click();
    result.scrollIntoView({block:"start",behavior:"smooth"});
  });
  function exportFile(format){
    if(!recorder.ready)return;
    const bundle=selected();
    if(format==="zip")download(name("zip"),makeBundleZip(bundle),"application/zip");
    else if(format==="json")download(name("json"),JSON.stringify(bundle,null,2),"application/json");
    else download(name("csv"),segmentsCsv(bundle),"text/csv;charset=utf-8");
  }
  zip.addEventListener("click",()=>exportFile("zip"));
  json.addEventListener("click",()=>exportFile("json"));
  csv.addEventListener("click",()=>exportFile("csv"));
  function setTab(tab){card.hidden=tab!=="live";result.hidden=tab!=="diagnostics"||!recorder.ready;}
  function onMicStop(){
    if(recorder.recording){
      recorder.requestStop("mic_stopped");
      queueMicrotask(restoreAutoTranslate);
    }
  }
  render();
  return {
    recorder,
    configureHooks(options){hooks={...options};},
    setTab,onMicStop,
    invalidate(reason){
      recorder.invalidate(reason);
      restoreAutoTranslate();render();
    },
    onEvent(event){recorder.onEvent(event);if(event?.type==="mic-stop")onMicStop();},
    get ready(){return recorder.ready;}
  };
}
