/**
 * VoiceBridge mobile-first 4-tab shell.
 * Does not clone or mutate the canonical SessionLedger. All transcript rows are
 * rendered from it, and telemetry contains event names/times only (no speech).
 */
import {SettingsRegistry, SettingsStore} from "../../settings/engine.js";
const APPEARANCE_KEY="mobilab.voicebridge.appearance.v08";
const TABS=["live","transcript","diagnostics","settings"];
const now=()=>performance.now();
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const p=(arr,q)=>{
  if(!arr.length)return null;
  const x=[...arr].sort((a,b)=>a-b);
  return Math.round(x[Math.ceil(q*x.length)-1]??x[0]);
};
export class VoiceBridgeTelemetry {
  constructor(){this.events=[];this.t0=now();this.counts={};this.onChange=()=>{};this.disconnectedAt=null;this.gaps=[];}
  mark(type,detail="",rowId=null){
    if(type==="recognizer-ended")this.disconnectedAt=now();
    if(type==="recognizer-start" && this.disconnectedAt!==null){
      const delay=now()-this.disconnectedAt;
      this.gaps.push(delay);
      if(this.gaps.length>100)this.gaps.shift();
      this.disconnectedAt=null;
    }
    const event={at:Math.round(now()-this.t0),type:String(type),detail:String(detail).slice(0,85),rowId};
    this.events.push(event);
    if(this.events.length>220)this.events.shift();
    this.counts[type]=(this.counts[type]||0)+1;
    this.onChange();
  }
  reset(){this.events=[];this.t0=now();this.counts={};this.disconnectedAt=null;this.gaps=[];this.onChange();}
  export(){return {schema:"voicebridge.telemetry.v1",timeBasis:"relative performance.now milliseconds",
    events:[...this.events],counts:{...this.counts},reconnectGapsMs:[...this.gaps]};}
}
function loadAppearance(){
  try {const x=JSON.parse(localStorage.getItem(APPEARANCE_KEY)||"{}");
    return {background:["midnight","sky","aurora","plain"].includes(x.background)?x.background:"midnight",
      frost:clamp(Number(x.frost??12),0,75),blur:clamp(Number(x.blur??12),0,24),
      radius:clamp(Number(x.radius??24),8,50),refraction:clamp(Number(x.refraction??80),0,280)};
  }catch{return {background:"midnight",frost:12,blur:12,radius:24,refraction:80};}
}
export function createMobileWorkspace({ledger,floating}){
  const shell=document.querySelector(".shell"),header=shell.querySelector("header");
  const nav=document.createElement("nav");
  nav.id="vbMobileTabs";nav.className="vb-mobile-tabs";nav.setAttribute("aria-label","VoiceBridge workspace");
  for(const [id,title] of [["live","Live"],["transcript","Transcript"],["diagnostics","Diagnostics"],["settings","Settings"]]){
    const button=document.createElement("button");
    button.className="vb-tab-button";button.type="button";button.dataset.vbTab=id;
    button.setAttribute("aria-selected",String(id==="live"));button.textContent=title;
    nav.append(button);
  }
  header.after(nav);
  const pane=(id,title)=>{
    const el=document.createElement("section");
    el.className="vb-dashboard-surface";el.id=id;el.hidden=true;
    el.setAttribute("aria-label",title);return el;
  };
  const transcript=pane("vbTranscriptPane","Searchable saved transcript");
  transcript.innerHTML='<span class="vb-tab-label">CANONICAL SESSION</span><h2>Transcript history</h2>'+
    '<div class="vb-transcript-tools"><input type="search" id="vbSearch" placeholder="Search original or translation" aria-label="Search transcript">'+
    '<button type="button" id="vbCopy">Copy</button><button type="button" id="vbExport">TXT</button><button type="button" id="vbOpenCurtain">Curtain</button></div>'+
    '<div id="vbTranscriptList" class="vb-transcript-list" role="log" aria-live="off"></div>'+
    '<p>Saved words stay in the canonical log. Missing translations remain visible and can be retried in Settings.</p>';
  const diagnostics=pane("vbDiagnosticsPane","Speech and translation diagnostics");
  diagnostics.innerHTML='<span class="vb-tab-label">BACKGROUND TELEMETRY · DEVICE ONLY</span>'+
    '<h2>Pipeline diagnostics</h2>'+
    '<p>Event timings below are relative to this page session. No raw audio or recognized text is stored in telemetry.</p>'+
    '<div id="vbDiagStats" class="vb-diagnostic-stats"></div>'+
    '<div class="row" style="margin-bottom:10px"><button type="button" id="vbExportEvents">Export JSON</button>'+
    '<button type="button" id="vbClearEvents">Clear telemetry</button></div>'+
    '<div id="vbEventTimeline" class="vb-timeline"></div>';
  const settings=pane("vbSettingsPane","Studio settings and appearance");
  settings.innerHTML='<span class="vb-tab-label">WEBFORGE / VISUAL ENGINE</span><h2>Studio appearance</h2>'+
    '<label class="vb-design-row" for="vbBackground">Background preset'+
    '<select id="vbBackground"><option value="midnight">Midnight Ocean</option>'+
    '<option value="sky">Portfolio Sky</option><option value="aurora">Northern Lights</option>'+
    '<option value="plain">Deep Navy · lightweight</option></select></label>'+
    '<div id="vbGlassSliders"></div>'+
    '<p>The refractive SVG lens is used on the floating controls where supported. All other bordered surfaces use a common frosted glass and specular-edge fallback to avoid heavy redraw costs.</p>'+
    '<button type="button" id="vbResetAppearance">Reset appearance</button>'+
    '<p>Recording, TTS, provider credentials, local media and benchmark tools remain in the Advanced workbench below.</p>';
  nav.after(transcript,diagnostics,settings);
  // Reuse the actual headless Settings Lab engine, not a new ad-hoc audio store.
  const audioRegistry=new SettingsRegistry();
  audioRegistry.registerModule({
    id:"audio",title:"Analog VU + waveform",icon:"🎚",public:true,status:"mobile-test",
    fields:[
      {id:"enabled",title:"Real audio meter",type:"toggle",default:true,
        help:"Analyzes a separate local microphone stream only while recording."},
      {id:"wave",title:"Show waveform",type:"toggle",default:true,
        help:"Real sampled signal, not an animation or speech confidence."},
      {id:"sensitivity",title:"VU sensitivity",type:"range",min:30,max:400,default:100,unit:"%",
        help:"Needle response to quieter/louder input."},
      {id:"inertia",title:"Needle damping",type:"range",min:3,max:85,default:22,unit:"%",
        help:"Higher response speed, lower value = heavier spring."},
      {id:"gain",title:"Waveform gain",type:"range",min:25,max:500,default:100,unit:"%",
        help:"Changes drawing scale only, not what recognition hears."}
    ]
  });
  const audioStore=new SettingsStore(audioRegistry,"mobilab.voicebridge.audio.v08");
  const audioSection=document.createElement("details");
  audioSection.open=true;audioSection.className="vb-audio-module";
  const audioTitle=document.createElement("summary");audioTitle.textContent="🎚 Audio monitor / VU";
  audioSection.append(audioTitle);
  const audioOptions=()=>({
    enabled:audioStore.get("audio","enabled"),
    showWave:audioStore.get("audio","wave"),
    sensitivity:audioStore.get("audio","sensitivity")/100,
    inertia:audioStore.get("audio","inertia")/100,
    gain:audioStore.get("audio","gain")/100
  });
  for(const f of audioRegistry.get("audio").fields){
    const line=document.createElement("div");line.className="vb-design-row";
    const label=document.createElement("label");label.htmlFor="vbAudio-"+f.id;
    const name=document.createElement("span");name.textContent=f.title;
    const current=document.createElement("output");
    const format=v=>f.type==="toggle"?(v?"On":"Off"):v+(f.unit||"");
    current.textContent=format(audioStore.get("audio",f.id));
    label.append(name,current);
    const input=document.createElement("input");input.id="vbAudio-"+f.id;
    input.type=f.type==="toggle"?"checkbox":"range";
    if(f.type==="toggle")input.checked=audioStore.get("audio",f.id);
    else{input.min=f.min;input.max=f.max;input.step=1;input.value=audioStore.get("audio",f.id);}
    input.addEventListener("input",()=>{
      const value=audioStore.set("audio",f.id,f.type==="toggle"?input.checked:Number(input.value));
      current.textContent=format(value);
      if(typeof workspaceAPI.onAudioSettingsChange==="function")
        workspaceAPI.onAudioSettingsChange(audioOptions());
    });
    const help=document.createElement("p");help.textContent=f.help||"";
    line.append(label,input,help);audioSection.append(line);
  }
  settings.append(audioSection);
  const workspaceAPI={getAudioOptions:audioOptions,onAudioSettingsChange:null};
  // Advanced paragraph and provider settings belong to Settings, not Live.
  const advancedTiming=document.getElementById("liveSettings");
  if(advancedTiming)settings.append(advancedTiming);
  const $=id=>document.getElementById(id);
  const telemetry=new VoiceBridgeTelemetry();
  const appearance=loadAppearance();
  function applyAppearance(){
    document.body.dataset.vbBackground=appearance.background;
    const root=document.documentElement;
    root.style.setProperty("--vb-glass-frost",String(appearance.frost/100));
    root.style.setProperty("--vb-glass-blur",appearance.blur+"px");
    root.style.setProperty("--vb-glass-radius",appearance.radius+"px");
    floating._glass?.setRefraction?.(appearance.refraction);
    try{localStorage.setItem(APPEARANCE_KEY,JSON.stringify(appearance));}catch{}
  }
  $("vbBackground").addEventListener("change",e=>{
    appearance.background=e.target.value;applyAppearance();
  });
  for(const [key,title,min,max,unit] of [["frost","Frost",0,75,"%"],["blur","Blur",0,24,"px"],["radius","Corner Radius",8,50,"px"],["refraction","Optical Refraction",0,280,""]]){
    const wrap=document.createElement("div");wrap.className="vb-design-row";
    const label=document.createElement("label");label.htmlFor="vbAppearance"+key;
    const name=document.createElement("span");name.textContent=title;
    const value=document.createElement("output");value.id="vbValue"+key;
    value.textContent=appearance[key]+unit;label.append(name,value);
    const input=document.createElement("input");input.type="range";input.id="vbAppearance"+key;
    input.min=min;input.max=max;input.step=1;input.value=appearance[key];
    input.addEventListener("input",()=>{
      appearance[key]=Number(input.value);value.textContent=input.value+unit;applyAppearance();
    });
    wrap.append(label,input);$("vbGlassSliders").append(wrap);
  }
  function syncAppearance(){
    $("vbBackground").value=appearance.background;
    for(const key of ["frost","blur","radius","refraction"]){
      $("vbAppearance"+key).value=appearance[key];
      $("vbValue"+key).textContent=appearance[key]+({frost:"%",blur:"px",radius:"px",refraction:""}[key]);
    }
    applyAppearance();
  }
  $("vbResetAppearance").addEventListener("click",()=>{
    Object.assign(appearance,{background:"midnight",frost:12,blur:12,radius:24,refraction:80});
    syncAppearance();
  });
  syncAppearance();
  let tab="live",query="";
  function selectTab(next){
    tab=TABS.includes(next)?next:"live";document.body.dataset.vbTab=tab;
    for(const id of TABS)nav.querySelector('[data-vb-tab="'+id+'"]').setAttribute("aria-selected",String(tab===id));
    transcript.hidden=tab!=="transcript";
    diagnostics.hidden=tab!=="diagnostics";
    settings.hidden=tab!=="settings";
    if(tab==="transcript")refreshTranscript();
    if(tab==="diagnostics")renderDiagnostics();
    window.scrollTo({top:0,behavior:"instant"});
  }
  for(const b of nav.querySelectorAll("button"))b.addEventListener("click",()=>selectTab(b.dataset.vbTab));
  function refreshTranscript(){
    if(tab!=="transcript")return;
    const rows=ledger.entries;
    const list=$("vbTranscriptList");const frag=document.createDocumentFragment();
    const matches=rows.filter(r=>!query || (r.text+" "+(r.displayText||"")).toLocaleLowerCase().includes(query));
    for(const r of matches.slice(-180)){
      const entry=document.createElement("article");entry.className="vb-transcript-entry";
      const info=document.createElement("small");info.textContent="#"+r.id+" · "+r.source+" → "+r.target+
        " · "+(r.displayText?"translated":r.queueStatus||"saved");
      const original=document.createElement("p");original.dir="auto";original.textContent=r.text;
      const translation=document.createElement("strong");translation.dir="auto";
      translation.textContent=r.displayText||"Translation pending / unavailable";
      const focus=document.createElement("button");focus.type="button";focus.textContent="Focus sentence";
      focus.addEventListener("click",()=>floating.dispatchEvent(new CustomEvent("speech:history-focus",
        {detail:{id:r.id},bubbles:true,composed:true})));
      entry.append(info,original,translation,focus);frag.append(entry);
    }
    if(!frag.childNodes.length){const empty=document.createElement("p");empty.textContent="No matching transcript entries yet.";frag.append(empty);}
    const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<55;
    list.replaceChildren(frag);
    if(nearBottom)list.scrollTop=list.scrollHeight;
    $("vbSearch").placeholder="Search "+rows.length+" paragraphs";
  }
  $("vbSearch").addEventListener("input",e=>{query=e.target.value.trim().toLocaleLowerCase();refreshTranscript();});
  $("vbCopy").addEventListener("click",()=>document.getElementById("copyTranscript").click());
  $("vbExport").addEventListener("click",()=>document.getElementById("exportTxt").click());
  $("vbOpenCurtain").addEventListener("click",()=>floating.toggleHistory(true));
  function metric(label,val){
    const cell=document.createElement("div");cell.className="vb-diagnostic-stat";
    const span=document.createElement("span");span.textContent=label;
    const strong=document.createElement("strong");strong.textContent=val;cell.append(span,strong);
    return cell;
  }
  function renderDiagnostics(){
    if(tab!=="diagnostics")return;
    const rows=ledger.entries;
    const nums=(fn)=>rows.map(fn).filter(Number.isFinite);
    const stt=nums(r=>r.sttMs),total=nums(r=>r.finalToSubtitleMs);
    const gap=telemetry.gaps;
    const missed=rows.filter(r=>["skipped","canceled"].includes(r.queueStatus)).length;
    const stats=$("vbDiagStats");
    stats.replaceChildren(metric("Speech → final estimate · p50",p(stt,.5)===null?"—":p(stt,.5)+" ms"),
      metric("Final → subtitle · p50",p(total,.5)===null?"—":p(total,.5)+" ms"),
      metric("Final → subtitle · p90",p(total,.9)===null?"—":p(total,.9)+" ms"),
      metric("Reconnect gap · last",gap.length?Math.round(gap.at(-1))+" ms":"—"),
      metric("Guarded duplicated finals",String(telemetry.counts["duplicate-suppressed"]||0)),
      metric("Skipped / canceled rows",String(missed)));
    const timeline=$("vbEventTimeline");const frag=document.createDocumentFragment();
    for(const e of telemetry.events.slice(-65).reverse()){
      const line=document.createElement("div");line.className="vb-timeline-row";
      const time=document.createElement("time");time.textContent=(e.at/1000).toFixed(2)+"s";
      const name=document.createElement("span");name.textContent=e.type+(e.rowId?" · #"+e.rowId:"");
      const detail=document.createElement("em");detail.textContent=e.detail;
      line.append(time,name,detail);frag.append(line);
    }
    if(!frag.childNodes.length){const empty=document.createElement("p");empty.textContent="Press record or translate text to collect event timings.";frag.append(empty);}
    timeline.replaceChildren(frag);
  }
  telemetry.onChange=renderDiagnostics;
  $("vbClearEvents").addEventListener("click",()=>telemetry.reset());
  $("vbExportEvents").addEventListener("click",()=>{
    const blob=new Blob([JSON.stringify(telemetry.export(),null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="voicebridge-telemetry.json";document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  selectTab("live");
  // Separate legacy workbench path for regression tests / debugging.
  // Normal visitors always start with compact Live mode.
  if(new URLSearchParams(location.search).has("legacy")){
    document.body.dataset.vbTab="legacy";settings.hidden=false;
  }
  return {...workspaceAPI,telemetry,selectTab,refreshTranscript,renderDiagnostics};
}
