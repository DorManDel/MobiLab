import { createChromeTranslatorAdapter, lexicalAgreement } from "./engine-compare.js";
import { TranslationQueue, wordErrorRate, characterSimilarity, safeLibreEndpoint } from "./bench-core.js";
import { ParagraphBuilder } from "./paragraph-builder.js";
import {SessionLedger,ProviderCircuit} from "./session-ledger.js";
import {LocalTranscriptArchive} from "./local-archive.js";
import {summarizeProviders} from "./provider-stats.js";
import { acceptCaption } from "./caption-selection.js";
import "./speech-floating-controls.js";
import { LiveCaptionView } from "./live-view.js";

const $ = (id) => document.getElementById(id);
const ledger=new SessionLedger();
const circuit=new ProviderCircuit();
const archive=new LocalTranscriptArchive();
const liveView = new LiveCaptionView(document);
liveView.bindLedger(ledger);
const floating = $("floatingControls");
let archiveTimer=null;
let displayLimit=40;
function focusedState() {
  return ledger.focused||ledger.latest;
}
function syncFloating(row=focusedState(),meta={}) {
  if(!ledger.followLive && row?.id!==ledger.cursor) return;
  if(row) {
    const chosen=row.displayProvider||row.captionProvider||"cloud";
    const problem=row.results?.[chosen]?.error||circuit.reason("cloud");
    floating.setCaption({
      text:row.displayText||row.text,
      source:row.source,target:row.target,translated:Boolean(row.displayText),
      status:row.displayText?(row.fallbackUsed?"FALLBACK · ":"")+chosen:
        problem?"Translation unavailable":"Waiting for translation"
    });
  } else floating.setCaption({text:meta.text||"Start speaking…",
    translated:Boolean(meta.translated),status:meta.status||"Ready"});
}
function focusView(row) {
  if(!row)return;
  liveView.focus(row);
  syncFloating(row);
  $("referenceTranslation").value=row.translationReference||"";
  updateReferenceScores();
}
$("focusPrev").addEventListener("click",()=>focusView(ledger.step(-1)));
$("focusNext").addEventListener("click",()=>focusView(ledger.step(1)));
$("focusLive").addEventListener("click",()=>focusView(ledger.resumeLive()));
function showProviderProblem(message,blocked=false) {
  const box=$("providerBanner");
  box.hidden=false;
  $("providerBannerText").textContent=message;
  $("retryCloud").hidden=!blocked;
}
function hideProviderProblem() { $("providerBanner").hidden=true; }
$("providerSetup").addEventListener("click",()=>{
  const advanced=document.querySelector(".provider-config");
  if(advanced){advanced.open=true;advanced.scrollIntoView({behavior:"smooth",block:"center"});}
});
$("retryCloud").addEventListener("click",()=>{
  circuit.reset("cloud");hideProviderProblem();
  status("MyMemory retry enabled. If its daily quota is still exhausted, it will be blocked again.");
});
function saveLocalSoon() {
  if(!$("saveLocal").checked)return;
  clearTimeout(archiveTimer);
  archiveTimer=setTimeout(async()=>{
    try {
      await archive.save(rows.map(row=>({...row,results:{...row.results}})));
      $("archiveStatus").textContent="Saved locally on this device · "+rows.length+" transcript paragraphs. No audio saved.";
    }catch(e){$("archiveStatus").textContent="Local save failed: "+e.message;}
  },650);
}
let translateOnFinish=false;
const paragraphs = new ParagraphBuilder({
  silenceMs:1600,
  onPreview(text){
    if(micActive&&text){
      liveView.pendingParagraph(text);
      if(ledger.followLive)floating.setCaption({text,translated:false,
        source:$("sourceLang").value,target:$("targetLang").value,status:"Building source paragraph"});
    }
  },
  onParagraph(data){
    interimActive=false;
    cancelDraft();
    if(translateOnFinish)queue.start();
    addPhrase(data.text,data.source,data.target,data.candidates||[],
      $("autoTranslate").checked && (micActive || translateOnFinish),
      data.sttMs??null,data.finalPerf??performance.now());
  }
});
liveView.setVisibleLines(2);
floating.setLineCount(2);
floating.addEventListener("speech:toggle",()=>$("recordToggle").click());
floating.addEventListener("speech:language-change",(event)=>{
  if(micActive){
    status("Finish recording before changing languages.",true);
    refreshRecordingUI();
    return;
  }
  $("sourceLang").value=event.detail.source;
  $("targetLang").value=event.detail.target;
  refreshRecordingUI();
});
floating.addEventListener("speech:display-change",(event)=>liveView.setMode(event.detail.mode));
floating.addEventListener("speech:lines-change",(event)=>{
  $("captionLines").value=String(event.detail.lines);
  liveView.setVisibleLines(event.detail.lines);
  floating.setLineCount(event.detail.lines);
});
floating.addEventListener("speech:provider-change",(event)=>{
  $("captionProvider").value=event.detail.provider;
  if(event.detail.provider==="cloud"&&!circuit.canCall("cloud"))
    showProviderProblem(circuit.reason("cloud"),true);
  status("Caption engine selected for new paragraphs. Saved results are not overwritten.");
});
for(const btn of document.querySelectorAll("[data-caption-mode]"))
  btn.addEventListener("click",()=>floating.setState({mode:btn.dataset.captionMode}));
$("sourceLang").addEventListener("change",()=>refreshRecordingUI());
$("targetLang").addEventListener("change",()=>refreshRecordingUI());
$("captionLines").addEventListener("change",()=>{
  liveView.setVisibleLines($("captionLines").value);
  floating.setLineCount($("captionLines").value);
});
$("silenceDuration").addEventListener("change",()=>paragraphs.setSilence($("silenceDuration").value));
$("captionProvider").addEventListener("change",()=>{
  floating.setState({provider:$("captionProvider").value});
});
$("chunkMode").addEventListener("change",()=>paragraphs.flush("settings-change"));
let draftTimer=null, draftAbort=null, draftVersion=0, lastDraftRequest=-Infinity;
function cancelDraft() {
  draftVersion++;
  clearTimeout(draftTimer);
  if(draftAbort){draftAbort.abort();draftAbort=null;}
}
function scheduleDraft(text) {
  clearTimeout(draftTimer);
  const version=++draftVersion;
  const trimmed=text.trim();
  if(!$("earlyPreview").checked || !circuit.canCall("cloud") ||
    trimmed.split(/\s+/u).length<4 || !micActive)return;
  // Extra translation requests are opt-in; cap text size and global call rate.
  const delay=Math.max(650,3600-(performance.now()-lastDraftRequest));
  draftTimer=setTimeout(async()=>{
    if(version!==draftVersion || !micActive)return;
    draftAbort?.abort();
    const controller=new AbortController();
    draftAbort=controller;
    const began=performance.now();
    lastDraftRequest=began;
    try{
      const out=await translateMyMemory(Array.from(trimmed).slice(0,180).join(""),
        $("sourceLang").value,$("targetLang").value,controller.signal);
      if(version===draftVersion && micActive && !controller.signal.aborted){
        liveView.early(out,performance.now()-began);
        if(ledger.followLive)floating.setCaption({text:out,translated:true,status:"EARLY DRAFT",
          source:$("sourceLang").value,target:$("targetLang").value});
      }
    }catch(error){
      if(version===draftVersion && micActive && !controller.signal.aborted){
        $("liveNotice").textContent="Early draft unavailable: "+(error.message||"translation error");
      }
    }
  },delay);
}
$("quickSpeak").addEventListener("click",()=>{
  $("speakLast").click();
});
const locale = {he:"he-IL",en:"en-US",es:"es-ES",fr:"fr-FR",de:"de-DE",ar:"ar-SA",ru:"ru-RU",it:"it-IT"};
const langNames = {he:"Hebrew",en:"English",es:"Spanish",fr:"French",de:"German",ar:"Arabic",ru:"Russian",it:"Italian"};
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;
const localTranslator = createChromeTranslatorAdapter(window);
const translationCache = new Map();
let rows = ledger.entries;
let rowId = 0;
let sessionStart = Date.now();
let recordingStart = Date.now();
let recognize = null;
let micActive = false;
let micToken = 0;
let restartTimeout = null;
let restartTimes = [];
let sessionTimer = null;
let interimActive = false;
let currentUtterance = null;
let voiceChoices = [];
let lastSubtitleShownId=0;
const MAX_PHRASES = 3000;

function status(message, warning = false) {
  $("status").textContent = message;
  $("stateDot").classList.toggle("busy", warning || micActive);
}
function ttsStatus(message, warning = false) {
  $("voiceSupport").textContent = message;
  $("voiceSupport").classList.toggle("warn", warning);
}
function refreshRecordingUI() {
  $("recordToggle").textContent = micActive ? "■ Finish recording" : "🎙 Start recording";
  $("recordToggle").classList.toggle("is-recording", micActive);
  $("recordToggle").setAttribute("aria-pressed", String(micActive));
  $("recordToggle").disabled = !micActive && (!Recognition || !isSecureContext);
  $("sourceLang").disabled = micActive;
  $("recordState").textContent = micActive ? "● REC" : "OFFLINE";
  $("recordState").classList.toggle("live", micActive);
  floating.setState({listening:micActive,source:$("sourceLang").value,
    target:$("targetLang").value,mode:liveView.mode,
    lines:Number($("captionLines").value),provider:$("captionProvider").value});
}
function clockText(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
function updateTimer() {
  $("recordTime").textContent = micActive ? clockText(Date.now() - recordingStart) : $("recordTime").textContent;
}
function stopMic(translateLast=false) {
  micActive = false;
  micToken++;
  clearTimeout(restartTimeout);
  clearInterval(sessionTimer);
  const old = recognize;
  recognize = null;
  if (old) {
    old.onend = null;
    old.onresult = null;
    old.onerror = null;
    try { old.abort(); } catch {}
  }
  cancelDraft();
  queue.stop(); // cancellation for all prior translation work
  interimActive = false;
  // Explicit Finish may translate only its final unfinished paragraph.
  // Background/error Stop never initiates new network requests.
  translateOnFinish=Boolean(translateLast);
  paragraphs.flush("stop");
  translateOnFinish=false;
  refreshRecordingUI();
  status(translateLast
    ? "Mic off. Earlier pending translations canceled; only the last unfinished paragraph may finish translating."
    : "Mic off. Transcript remains in this page; translations canceled.");
  if(rows.length){
    const latest=rows[rows.length-1];
    showCaption(latest);showComparison(latest);focusView(ledger.focused||latest);
  }
}
function activateRecognizer(token) {
  if (!micActive || micToken !== token) return;
  const instance = new Recognition();
  recognize = instance;
  const finalized = new Set();
  let speechStartPerf=null;
  instance.onspeechstart=()=>{speechStartPerf=performance.now();};
  instance.lang = locale[$("sourceLang").value];
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 3;
  instance.onstart = () => {
    if (micActive && token === micToken) status("Listening in " + langNames[$("sourceLang").value] + "…");
  };
  instance.onresult = (event) => {
    if (!micActive || token !== micToken || instance !== recognize) return;
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const phrase = result[0]?.transcript?.trim();
      if (!phrase) continue;
      if (result.isFinal && !finalized.has(i)) {
        finalized.add(i);
        restartTimes = [];
        const candidates = Array.from(result, (value) => ({
          text: value.transcript?.trim() || "",
          confidence: Number.isFinite(value.confidence) && value.confidence > 0 ? value.confidence : null
        })).filter(x => x.text);
        cancelDraft();
        const finalPerf=performance.now();
        const speechDuration=speechStartPerf===null?null:Math.max(0,finalPerf-speechStartPerf);
        paragraphs.addFinal(phrase,{
          source:$("sourceLang").value,target:$("targetLang").value,
          candidates,sttMs:speechDuration,finalPerf
        });
        if($("chunkMode").value==="immediate")paragraphs.flush("immediate");
        speechStartPerf=null;
      } else if (!result.isFinal) interim += " " + phrase;
    }
    if (interim.trim()) {
      interimActive = true;
      $("captionOriginal").textContent = interim.trim() + " …";
      $("captionTranslated").textContent = "Listening for the end of this phrase…";
      // Interim updates mean speech is still ongoing; don't close the paragraph mid-sentence.
      if(paragraphs.pending)paragraphs.arm();
      const preview=[paragraphs.pending,interim.trim()].filter(Boolean).join(" ");
      liveView.interim(preview);
      scheduleDraft(interim.trim());
    } else interimActive = false;
  };
  instance.onerror = (event) => {
    if (!micActive || token !== micToken) return;
    const fatal = ["not-allowed","service-not-allowed","audio-capture","language-not-supported","network"];
    if (fatal.includes(event.error)) {
      stopMic();
      status("Microphone error: " + event.error + ". Check permission, network and speech service.",true);
    } else if (event.error !== "no-speech" && event.error !== "aborted") {
      status("Speech recognizer: " + event.error + ". Retrying only while recording is active.",true);
    }
  };
  instance.onend = () => {
    if (!micActive || token !== micToken || recognize !== instance) return;
    const now = Date.now();
    restartTimes = restartTimes.filter(t => now - t < 30000);
    restartTimes.push(now);
    if (restartTimes.length > 5) {
      stopMic();
      status("Speech service stopped repeatedly. Recording paused to avoid an endless loop.",true);
      return;
    }
    status("Speech recognizer paused; reconnecting while REC is enabled…");
    restartTimeout = setTimeout(() => {
      if (micActive && token === micToken) {
        try { activateRecognizer(token); }
        catch (error) { stopMic();status("Recognizer could not restart: "+error.message,true); }
      }
    },800);
  };
  instance.start();
}
function startMic() {
  if (!Recognition || !isSecureContext) {
    status("Microphone needs an HTTPS browser with SpeechRecognition support.",true);
    return;
  }
  if ($("sourceLang").value === "auto") {
    status("Choose a spoken language. Auto applies to typed text only.",true);
    return;
  }
  window.speechSynthesis?.cancel(); // no voice-feedback loop
  recordingStart = Date.now(); // session timestamps remain monotonic across multiple recordings
  micActive = true;
  micToken++;
  restartTimes = [];
  paragraphs.clear();
  queue.start();
  refreshRecordingUI();
  $("recordTime").textContent = "00:00";
  sessionTimer = setInterval(updateTimer,1000);
  try { activateRecognizer(micToken); }
  catch (error) { stopMic();status("Microphone failed: "+error.message,true); }
}
$("recordToggle").addEventListener("click", () => micActive ? stopMic(true) : startMic());

function timeoutSignal(parentSignal, timeoutMs = 12000) {
  const controller = new AbortController();
  const abortParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortParent();
  else parentSignal.addEventListener("abort",abortParent,{once:true});
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout","TimeoutError")),timeoutMs);
  return {
    signal:controller.signal,
    release() { clearTimeout(timer);parentSignal.removeEventListener("abort",abortParent); }
  };
}
function splitText(text) {
  const parts = [], tokens = text.match(/\S+\s*/gu) || [];
  const length = s => new TextEncoder().encode(s).length;
  let current = "";
  for (const token of tokens) {
    if (length(token) > 450) throw new Error("A word exceeds the translation service length limit.");
    if (length(current + token) > 450 && current) {
      parts.push(current.trim());current = "";
    }
    current += token;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
async function translateMyMemory(text, source, target, signal) {
  if (source === target) return text;
  if(!circuit.canCall("cloud"))throw new Error(circuit.reason("cloud"));
  const key = source+"|"+target+"|"+text;
  if (translationCache.has(key)) return translationCache.get(key);
  const out = [];
  const timeout = timeoutSignal(signal);
  try {
    for (const chunk of splitText(text)) {
      const q = new URLSearchParams({q:chunk,langpair:source+"|"+target});
      const response = await fetch("https://api.mymemory.translated.net/get?"+q,{signal:timeout.signal});
      if(response.status===429){
        const msg="MyMemory rate limit (HTTP 429): its free anonymous quota has been exhausted. Original text is safe in the log. Enable a different translation engine or retry after the quota resets.";
        circuit.block("cloud",msg);
        showProviderProblem(msg,true);
        throw new Error(msg);
      }
      if (!response.ok) throw new Error("MyMemory HTTP "+response.status);
      const data = await response.json();
      if (Number(data.responseStatus)===429 || /quota|rate.limit|too many requests/i.test(String(data.responseDetails||""))){
        const msg="MyMemory daily usage limit reached. Transcript saved. Select another provider to keep translating.";
        circuit.block("cloud",msg);showProviderProblem(msg,true);throw new Error(msg);
      }
      if (Number(data.responseStatus) !== 200 || !data.responseData?.translatedText) {
        throw new Error(data.responseDetails || "MyMemory returned no translation.");
      }
      out.push(data.responseData.translatedText);
    }
    const result = out.join(" ");
    if (!signal.aborted) translationCache.set(key,result);
    return result;
  } finally {timeout.release();}
}
async function translateLibre(text, source, target, signal, endpoint, key="",token="") {
  if (source === target) return text;
  const timeout = timeoutSignal(signal,15000);
  try {
    const response = await fetch(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},
      body:JSON.stringify({...{q:text,source,target,format:"text"},...(key?{api_key:key}:{})}),
      signal:timeout.signal
    });
    if (!response.ok) throw new Error("LibreTranslate HTTP "+response.status);
    const data = await response.json();
    if (typeof data.translatedText !== "string" || !data.translatedText.trim()) {
      throw new Error("LibreTranslate returned no translatedText.");
    }
    return data.translatedText;
  } finally {timeout.release();}
}
function activeProviders() {
  const list=[];
  // Selecting a local translator must NOT silently consume the daily
  // MyMemory quota. Opt in to cloud benchmarking explicitly.
  const selected=$("captionProvider").value;
  const cloudRequested=selected==="cloud" || $("compareCloud").checked ||
    (selected==="fastest" && !$("compareLibre").checked && !$("compareLocal").checked);
  if(cloudRequested && circuit.canCall("cloud"))list.push({
    id:"cloud",label:"MyMemory (cloud)",
    run:(text,source,target,signal) => translateMyMemory(text,source,target,signal)
  });
  if ($("compareLocal").checked && localTranslator.supported()) {
    list.push({
      id:"local",label:"Chrome on-device Translator",
      run:async(text,source,target,signal,onStatus) => {
        if (signal.aborted) throw new Error("Stopped");
        const translated = await localTranslator.translate(text,source,target,onStatus);
        if (signal.aborted) throw new Error("Stopped");
        return translated;
      }
    });
  }
  if ($("compareLibre").checked) {
    // Only the user-approved LibreTranslate endpoint may receive these texts.
    let endpoint, configurationError;
    try { endpoint = safeLibreEndpoint($("libreEndpoint").value.trim()); }
    catch(error) { configurationError = error.message; }
    const key=$("libreKey").value.trim(); // in-memory only, never in exports
    const nodeToken=$("nodeToken").value.trim(); // optional bearer token, also RAM only
    list.push({id:"libre",label:"Your LibreTranslate server",
      run:(text,source,target,signal)=>{
        if (configurationError) throw new Error(configurationError);
        return translateLibre(text,source,target,signal,endpoint,key,nodeToken);
      }});
  }
  return list;
}
function updateRow(row,id,patch) {
  if(!row)return;
  if(id==="queue") {
    row.queueStatus=patch.status;
  }else{
    row.results[id]={...(row.results[id]||{}),...patch};
    const now=performance.now();
    if(patch.status==="running" && row.queueWaitMs===null)
      row.queueWaitMs=Math.max(0,now-row.finalPerf);
    if(patch.status==="error" && id===row.captionProvider && !row.displayText){
      // A user-enabled alternate engine can take over ONLY after the selected
      // provider has failed. No unapproved endpoint is contacted.
      const alternatives=Object.entries(row.results).filter(([pid,info])=>pid!==id &&
        ["running","success","queued"].includes(info.status));
      const configured=Object.keys(row.results).some(pid=>pid!==id);
      if(alternatives.length||configured) {
        row.captionProvider="fastest";
        row.fallbackUsed=true;
        const completed=alternatives.find(([,info])=>info.status==="success"&&info.text);
        if(completed)acceptCaption(row,completed[0],completed[1].text,now);
      }
    }
    if(patch.status==="success" && patch.text &&
      acceptCaption(row,id,patch.text,now)){
      if(row.fromSpeech)liveView.latencies.push(row.finalToSubtitleMs);
      if(liveView.latencies.length>60)liveView.latencies.shift();
    }
  }
  const focused=ledger.focused?.id===row.id;
  if(patch.status!=="running"||id==="queue")renderRows();
  if(rows.at(-1)?.id===row.id)showComparison(row);
  if(focused && !interimActive)showCaption(row);
  liveView.drawHistory();
  if(row.displayText && !row.displayShown){
    row.displayShown=true;
    const provider={cloud:"MyMemory",local:"Chrome",libre:"LibreTranslate"}[row.displayProvider]||row.displayProvider;
    liveView.translated(row,row.displayText,provider,interimActive);
    if(focused)syncFloating(row);
  }else if(id==="queue" && patch.status==="completed" && !row.displayText){
    const firstError=Object.values(row.results).find(v=>v.status==="error");
    const problem=firstError?.error||"No provider returned a completed translation.";
    if(focused) {
      liveView.failed(row,problem);
      syncFloating(row);
      showProviderProblem(problem,Boolean(circuit.reason("cloud")));
    }
  }else if(id==="queue" && patch.status==="skipped"){
    liveView.skipped(row);
    if(focused)syncFloating(row);
  }else if(focused && !interimActive){
    liveView.showQueue(row);
    syncFloating(row);
  }
  if(patch.status!=="running"){renderScoreboard();saveLocalSoon();}
}
const queue = new TranslationQueue({onChange:updateRow,maxPending:8});
function addPhrase(text,source,target,candidates=null,automatic=true,sttMs=null,finalPerf=performance.now()) {
  text=text.trim();
  if (!text || rows.length >= MAX_PHRASES) {
    if (rows.length >= MAX_PHRASES) { if(micActive)stopMic();status("Session reached the 3,000-paragraph safety cap. Export the log before starting a new session.",true);}
    return;
  }
  const previous = rows[rows.length-1];
  if (candidates && previous && previous.text.toLocaleLowerCase() === text.toLocaleLowerCase()
    && Date.now()-previous.at < 1500) return;
  const row = { id:++rowId,at:Date.now(),offset:Date.now()-sessionStart,text,source,target,
    candidates,results:{},queueStatus:"saved",sttMs,finalPerf,
    fromSpeech:Array.isArray(candidates),queueWaitMs:null,finalToSubtitleMs:null,
    captionProvider:$("captionProvider").value,displayText:"",displayProvider:null,displayShown:false,
    fallbackUsed:false };
  ledger.append(row);
  interimActive=false;
  renderRows();renderScoreboard();showCaption(row);showComparison(row);showCandidates(row);
  liveView.final(row);
  syncFloating(row);
  saveLocalSoon();
  if (automatic) translateRow(row);
  else status("Phrase saved. Tap 'Translate saved' whenever you're ready.");
}
function translateRow(row) {
  try {
    const providers=activeProviders();
    if(!providers.length){
      row.queueStatus="unavailable";
      const reason=circuit.reason("cloud")||
        "No translation engine is available. Configure and enable your own HTTPS LibreTranslate server or a supported on-device translator.";
      row.results.cloud={status:"error",error:reason};
      showProviderProblem(reason,Boolean(circuit.reason("cloud")));
      liveView.failed(row,reason);
      renderRows();saveLocalSoon();return;
    }
    if(row.captionProvider!=="fastest" && !providers.some(x=>x.id===row.captionProvider)){
      row.captionProvider="fastest";row.fallbackUsed=true;
    }
    const realtime=micActive && $("subtitlePriority").value==="live";
    const accepted=realtime
      ? queue.enqueueRealtime(row,providers,2)
      : queue.enqueue(row,providers);
    if(!accepted)status("Translation backlog is full. Original saved; retry that paragraph later.",true);
  } catch (error) {
    row.queueStatus="skipped";
    status("Comparison setting: "+error.message,true);
    renderRows();
  }
}
function translateSaved() {
  queue.start();
  const targets=rows.filter(row =>
    (["saved","canceled","skipped","unavailable"].includes(row.queueStatus) ||
      (row.queueStatus==="completed"&&!row.displayText))
    && Object.values(row.results).every(x=>x.status!=="running"))
    .slice(0,8); // deliberate batch: do not silently enqueue hundreds of quota-consuming calls
  if(targets.length)status("Translating up to 8 stored paragraphs. Repeat after completion for more.");
  if (!targets.length) {
    const latest=rows[rows.length-1];
    if(latest) {
      // Explicit re-run of the latest phrase against newly enabled engines.
      latest.results={};latest.queueStatus="saved";
      latest.captionProvider=$("captionProvider").value;
      latest.displayText="";latest.displayProvider=null;latest.displayShown=false;
      latest.finalToSubtitleMs=null;
      translateRow(latest);
      status("Re-running the latest phrase through the selected engines.");
    } else status("No saved phrases to translate yet.",true);
    return;
  }
  for(const row of targets){
    row.results={};row.queueStatus="saved";
    row.captionProvider=$("captionProvider").value;row.fallbackUsed=false;
    row.displayText="";row.displayProvider=null;row.displayShown=false;
    row.finalToSubtitleMs=null;row.finalPerf=performance.now();
    translateRow(row);
  }
}
$("translateSaved").addEventListener("click",translateSaved);
$("showMoreRows").addEventListener("click",()=>{
  displayLimit=Math.min(3000,displayLimit+40);
  renderRows();
});

async function detectTypedLanguage(text) {
  if (/[א-ת]/u.test(text)) return "he";
  if (/[\u0600-\u06ff]/u.test(text)) return "ar";
  if (/[\u0400-\u04ff]/u.test(text)) return "ru";
  if (window.LanguageDetector?.create) {
    try {
      const detector=await window.LanguageDetector.create();
      const predictions=await detector.detect(text);
      const top=predictions?.[0];
      const code=top?.detectedLanguage?.split("-")[0];
      if (top?.confidence>0.55 && locale[code]) return code;
    } catch {}
  }
  return null;
}
$("translateManual").addEventListener("click",async()=>{
  const text=$("manualText").value.trim();
  if(!text){status("Type a phrase first.",true);return;}
  let source=$("sourceLang").value;
  if(source==="auto"){
    status("Detecting typed language…");
    source=await detectTypedLanguage(text);
    if(!source){status("Could not detect reliably. Choose the source language.",true);return;}
  }
  queue.start();
  addPhrase(text,source,$("targetLang").value,null,true);
});
$("clearAll").addEventListener("click",()=>{
  if(micActive) stopMic();
  queue.stop();
  translationCache.clear();
  paragraphs.clear();
  ledger.clear();rowId=0;lastSubtitleShownId=0;sessionStart=Date.now();recordingStart=sessionStart;
  interimActive=false;
  $("recordTime").textContent="00:00";
  $("wer").textContent="—";
  $("captionOriginal").textContent="Waiting for input…";
  $("captionTranslated").textContent="Translation will appear here.";
  $("speechCandidates").replaceChildren();
  renderRows();showComparison(null);renderScoreboard();
  cancelDraft();liveView.reset();
  syncFloating();
  if($("saveLocal").checked)archive.clear().catch(e=>status("Local archive deletion failed: "+e.message,true));
  hideProviderProblem();
  status("Session cleared. Nothing is uploaded by the app itself.");
});
$("compareLocal").disabled=!localTranslator.supported();
$("localStatus").textContent=localTranslator.supported()
  ? "Available · opt-in download of model may be required."
  : "Not available in this browser. Chrome Translator currently supports desktop, not Android.";
$("compareLocal").addEventListener("change",()=>status($("compareLocal").checked
  ? "Second translation engine enabled for new phrases." : "On-device comparison disabled."));
$("compareLibre").addEventListener("change",()=>status($("compareLibre").checked
  ? "Custom server enabled. Finalized text will be sent to your HTTPS endpoint."
  : "Custom server disabled."));
$("browserSupport").textContent=Recognition?"Browser STT detected":"STT unavailable";
if(!Recognition || !isSecureContext) status("Use HTTPS in a supporting browser for recording. Text and TTS still work.",true);

function showCaption(row) {
  if (!row) return;
  $("captionOriginal").textContent=row.text;
  requestAnimationFrame(()=>{$("captionOriginal").scrollTop=$("captionOriginal").scrollHeight;});
  const result = row.displayText;
  const finished = ["stopped","saved","skipped","canceled","completed"].includes(row.queueStatus)
    || Object.values(row.results).some(x=>x.status==="canceled");
  $("captionTranslated").textContent=result || (finished
    ? "Chosen caption engine has no completed translation; inspect comparison or re-run."
    : "Translating paragraph…");
  requestAnimationFrame(()=>{$("captionTranslated").scrollTop=$("captionTranslated").scrollHeight;});
  $("detectedLang").textContent=row.source.toUpperCase()+" → "+row.target.toUpperCase();
}
function showCandidates(row) {
  const list=$("speechCandidates");list.replaceChildren();
  const arr=row?.candidates || [];
  if(!arr.length){
    const li=document.createElement("li");
    li.textContent=row?.candidates===null?"Typed text · no speech candidates":"No alternatives provided.";
    list.append(li);return;
  }
  for(const candidate of arr) {
    const li=document.createElement("li");
    li.textContent=candidate.text+(candidate.confidence!==null?" · engine estimate "+Math.round(candidate.confidence*100)+"%":"");
    list.append(li);
  }
}
function showComparison(row) {
  for (const id of ["cloud","local","libre"]) {
    const state=row?.results[id];
    const box=$(id+"EngineResult");
    const time=$(id+"EngineTime");
    box.textContent=state?.text || (state?.status==="error"?"Error: "+state.error:
      state?.status==="canceled"?"Stopped by user":
      state?.status==="running"?"Translating…":"Not run on this phrase.");
    time.textContent=typeof state?.ms==="number" ? state.ms+" ms" : "—";
  }
  const a=row?.results.cloud?.text,b=row?.results.local?.text;
  const overlap=a&&b?lexicalAgreement(a,b):null;
  $("agreement").textContent=overlap===null
    ? "Different models can disagree and both be valid. Add a reference below to measure text similarity."
    : "MyMemory ↔ Chrome word overlap: "+Math.round(100*overlap)+"% (not a quality score).";
  updateReferenceScores();
}
function renderRows() {
  const container=$("segments");container.replaceChildren();
  if(!rows.length){
    const empty=document.createElement("p");empty.className="hint";
    empty.textContent="No saved speech yet. Tap Start recording, or type a sentence.";
    container.append(empty);
  }
  for(const row of rows.slice(-displayLimit).reverse()){
    const card=document.createElement("article");card.className="segment";
    const meta=document.createElement("div");meta.className="meta";
    const label=document.createElement("span");label.textContent=new Date(row.at).toLocaleTimeString();
    const lang=document.createElement("span");lang.textContent=row.source.toUpperCase()+" → "+row.target.toUpperCase();
    meta.append(label,lang);
    const orig=document.createElement("p");orig.className="original";orig.textContent=row.text;
    card.append(meta,orig);
    const actions=document.createElement("div");actions.className="row";
    const focus=document.createElement("button");
    focus.type="button";focus.className="read-entry";
    focus.textContent="⌖ Focus paragraph #"+row.id;
    focus.addEventListener("click",()=>focusView(ledger.focus(row.id)));
    actions.append(focus);
    const info=document.createElement("span");info.className="log-info";
    info.textContent=row.displayText?"Caption: "+(row.displayProvider||"translator"):
      "State: "+(row.queueStatus||"saved");
    actions.append(info);card.append(actions);
    let count=0;
    for(const id of ["cloud","local","libre"]){
      const result=row.results[id];
      if(!result || result.status==="running"&&count>0)continue;
      const p=document.createElement("p");p.className="translated";
      p.textContent=(id==="cloud"?"MyMemory":id==="local"?"Chrome":"LibreTranslate")+": "+
        (result.text || (result.status==="canceled"?"Stopped":
          result.status==="error"?"Error: "+result.error:"Working…"));
      if(result.status==="error")p.classList.add("error");
      card.append(p);
      if(result.status==="success" && result.text){
        const speak=document.createElement("button");
        speak.className="speak-row";speak.type="button";speak.textContent="🔊 Speak this";
        speak.addEventListener("click",()=>speakText(result.text,row.target));
        card.append(speak);
      }
      count++;
    }
    if(!count){
      const state=document.createElement("small");
      state.textContent=row.queueStatus==="saved"?"Saved transcript · not translated":
        row.queueStatus==="queued"?"Waiting in translation queue":
        row.queueStatus==="skipped"?"Skipped (queue or provider setting)":row.queueStatus==="stopped"?"Stopped":"";
      card.append(state);
    }
    container.append(card);
  }
  $("phraseCount").textContent=String(rows.length);
  $("showMoreRows").disabled=displayLimit>=rows.length;
  $("latency").textContent=(()=>{for(let i=rows.length-1;i>=0;i--){
    if(typeof rows[i].results.cloud?.ms==="number")return rows[i].results.cloud.ms+"ms";
  }return "—";})();
}
function latestOutput(){
  for(let i=rows.length-1;i>=0;i--)for(const id of ["cloud","local","libre"]){
    if(rows[i].results[id]?.text)return {text:rows[i].results[id].text,lang:rows[i].target};
  }
  return null;
}

function refreshVoices(){
  if(!synthesis)return;
  const selected=$("voiceSelect").value;
  voiceChoices=synthesis.getVoices() || [];
  const sel=$("voiceSelect");sel.replaceChildren();
  const option=document.createElement("option");option.value="auto";option.textContent="Auto · match target language";sel.append(option);
  for(const v of voiceChoices){
    const opt=document.createElement("option");opt.value=v.voiceURI;
    opt.textContent=v.name+" ("+v.lang+")"+(v.localService?" · local":"");
    sel.append(opt);
  }
  if([...sel.options].some(o=>o.value===selected))sel.value=selected;
  ttsStatus(voiceChoices.length
    ? voiceChoices.length+" voices found · select a voice or try Auto."
    : "No voices reported yet. Test Voice can still try the system default.",!voiceChoices.length);
}
if (synthesis) {
  refreshVoices();
  synthesis.addEventListener?.("voiceschanged",refreshVoices);
  $("speakLast").disabled=false;
  $("testVoice").disabled=false;
} else {
  $("speakLast").disabled=true;
  $("testVoice").disabled=true;
  ttsStatus("Speech synthesis is unsupported in this browser.",true);
}
function speakText(text,lang){
  if(micActive){ttsStatus("Finish recording before playing audio to prevent microphone feedback.",true);return;}
  if(!synthesis || !window.SpeechSynthesisUtterance){ttsStatus("No speech synthesis available.",true);return;}
  if(!text?.trim()){ttsStatus("Nothing to read yet. Use Test voice first.",true);return;}
  try {
    synthesis.cancel();
    synthesis.resume();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=locale[lang]||"en-US";
    utterance.rate=Number($("speechRate").value);
    utterance.volume=Number($("speechVolume").value);
    const chosen=$("voiceSelect").value;
    const voice=voiceChoices.find(v=>v.voiceURI===chosen) ||
      voiceChoices.find(v=>v.lang.toLowerCase()===utterance.lang.toLowerCase()) ||
      voiceChoices.find(v=>v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if(voice)utterance.voice=voice;
    currentUtterance=utterance; // keep a live reference for mobile browser engines
    utterance.onstart=()=>ttsStatus("▶ Speaking with "+(voice?.name||"system voice")+"…");
    utterance.onend=()=>{ttsStatus("✓ Playback finished.");currentUtterance=null;};
    utterance.onerror=(event)=>{
      ttsStatus("Playback failed ("+(event.error||"unknown")+
        "). Check phone media volume, TTS engine/voice and browser settings.",true);
      currentUtterance=null;
    };
    ttsStatus("Audio queued. If silent, choose an installed voice and check media volume.");
    synthesis.speak(utterance); // must be called directly from user tap
  } catch(error) { ttsStatus("Could not start voice: "+error.message,true); }
}
$("testVoice").addEventListener("click",()=>{
  const lang=$("targetLang").value;
  const samples={he:"שלום, זאת בדיקת הקראה.",en:"Hello, this is a voice test.",
    ar:"مرحباً، هذا اختبار للصوت.",es:"Hola, esto es una prueba de voz.",
    fr:"Bonjour, ceci est un test vocal.",de:"Hallo, dies ist ein Sprachtest.",
    ru:"Привет, это проверка голоса.",it:"Ciao, questa è una prova vocale."};
  const sample=samples[lang] || samples.en;
  speakText(sample,lang);
});
$("speakLast").addEventListener("click",()=>{
  const phrase=latestOutput();
  if(!phrase){ttsStatus("No translation available. Use Test voice to verify audio first.",true);return;}
  speakText(phrase.text,phrase.lang);
});
$("stopVoice").addEventListener("click",()=>{
  synthesis?.cancel();currentUtterance=null;ttsStatus("Voice stopped.");
});
$("speechRate").addEventListener("input",()=>{$("speechRateValue").textContent=Number($("speechRate").value).toFixed(1)+"×";});
$("speechVolume").addEventListener("input",()=>{$("speechVolumeValue").textContent=Math.round(Number($("speechVolume").value)*100)+"%";});

function renderScoreboard(){
  const target=$("providerScoreRows");target.replaceChildren();
  const summary=summarizeProviders(rows);
  const names={cloud:"MyMemory",local:"Chrome local",libre:"LibreTranslate"};
  for(const item of summary){
    const div=document.createElement("div");div.className="score-row";
    const name=document.createElement("strong");name.textContent=names[item.id]||item.id;
    const detail=document.createElement("span");
    const p50=item.p50===null?"—":Math.round(item.p50)+" ms";
    const score=item.referenceCount>0?Math.round(item.similarity*100)+"% similarity ("+
      item.referenceCount+" references)":"No human reference";
    detail.textContent="✓ "+item.success+" · errors "+item.errors+" · skipped "+item.canceled+
      " · p50 "+p50+" · "+score;
    div.append(name,detail);target.append(div);
  }
}
function updateReferenceScores(){
  const reference=$("referenceTranslation").value.trim();
  const row=ledger.focused||ledger.latest;
  const el=$("benchResults");el.replaceChildren();
  if(!reference||!row){el.textContent="Enter an expected translation to compare engines with the same reference.";return;}
  for(const [id,label] of [["cloud","MyMemory"],["local","Chrome Translator"],["libre","LibreTranslate"]]){
    const result=row.results[id];
    if(!result?.text)continue;
    const score=characterSimilarity(reference,result.text);
    const p=document.createElement("p");p.className="hint";
    p.textContent=label+": "+Math.round(100*score)+"% character n-gram similarity vs your reference"+
      (typeof result.ms==="number"?" · "+result.ms+" ms":"");
    el.append(p);
  }
  if(!el.childNodes.length)el.textContent="No completed translations to score yet.";
}
$("referenceTranslation").addEventListener("input",()=>{
  const row=ledger.focused||ledger.latest;
  if(row)row.translationReference=$("referenceTranslation").value.trim();
  updateReferenceScores();renderScoreboard();saveLocalSoon();
});
$("scoreWer").addEventListener("click",()=>{
  const reference=$("referenceText").value.trim();
  const spoken=rows.filter(row=>Array.isArray(row.candidates)).map(row=>row.text).join(" ");
  const score=wordErrorRate(reference,spoken);
  if(score===null){status("Enter the actual spoken words in Reference first.",true);return;}
  $("wer").textContent=(score*100).toFixed(1)+"%";
  status("WER computed from your human reference. Lower is better.");
});
// User-controlled device persistence: never sends text or keys to a server.
const CONSENT_KEY="mobilab.speech.localSaveEnabled";
$("saveLocal").addEventListener("change",async()=>{
  const enable=$("saveLocal").checked;
  try{
    if(enable){localStorage.setItem(CONSENT_KEY,"1");saveLocalSoon();}
    else{
      clearTimeout(archiveTimer);
      localStorage.removeItem(CONSENT_KEY);
      await archive.clear();
      $("archiveStatus").textContent="Local saved copy deleted. Current transcript remains in RAM.";
    }
  }catch(error){$("archiveStatus").textContent="Storage error: "+error.message;}
});
$("clearLocal").addEventListener("click",async()=>{
  try{
    clearTimeout(archiveTimer);
    await archive.clear();
    localStorage.removeItem(CONSENT_KEY);
    $("saveLocal").checked=false;
    $("archiveStatus").textContent="Saved browser copy deleted. In-memory transcript unchanged.";
  }catch(error){$("archiveStatus").textContent="Cannot delete saved copy: "+error.message;}
});
$("exportJson").addEventListener("click",()=>download("mobilab-speech-log.json",
  JSON.stringify({schema:"mobilab.speech.log.v1",exportedAt:new Date().toISOString(),
    entries:ledger.snapshot()},null,2),"application/json;charset=utf-8"));
(async function restoreLocalLog(){
  try{
    if(localStorage.getItem(CONSENT_KEY)!=="1")return;
    $("saveLocal").checked=true;
    const data=await archive.load();
    if(!data?.entries?.length)return;
    for(const saved of data.entries.slice(0,3000)){
      const row={...saved,results:saved.results||{},queueStatus:
        ["running","queued"].includes(saved.queueStatus)?"canceled":saved.queueStatus,
        finalPerf:performance.now(),displayShown:Boolean(saved.displayText)};
      if(!Number.isInteger(row.id)||!row.text)continue;
      ledger.append(row);rowId=Math.max(rowId,row.id);
    }
    const first=rows[0];
    if(first)sessionStart=(first.at||Date.now())-(first.offset||0);
    renderRows();renderScoreboard();
    liveView.drawHistory();
    focusView(ledger.resumeLive());
    showComparison(rows.at(-1));
    $("archiveStatus").textContent="Restored "+rows.length+" local transcript paragraphs. Microphone remains off.";
  }catch(error){$("archiveStatus").textContent="Could not restore local transcript: "+error.message;}
})();
function transcriptText(){
  return rows.map(row=>row.text+"\n"+["cloud","local","libre"].filter(id=>row.results[id]?.text)
    .map(id=>id+": "+row.results[id].text).join("\n")).join("\n\n");
}
function download(name,content,type){
  const u=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement("a");a.href=u;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1500);
}
$("copyTranscript").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(transcriptText());status("Transcript copied.");}
  catch{status("Clipboard unavailable. Use Export TXT.",true);}
});
$("exportTxt").addEventListener("click",()=>download("mobilab-speech-session.txt",transcriptText(),"text/plain;charset=utf-8"));
function vttTime(ms){
  const value=Math.max(0,Math.floor(ms));
  return [Math.floor(value/3600000),Math.floor(value%3600000/60000),Math.floor(value%60000/1000)]
    .map(n=>String(n).padStart(2,"0")).join(":")+"."+String(value%1000).padStart(3,"0");
}
$("exportVtt").addEventListener("click",()=>{
  let out="WEBVTT\n\nNOTE Approximate session times, not synchronized to a video.\n\n";
  rows.forEach((row,i)=>{
    const begin=Math.max(0,row.offset);
    const next=rows[i+1]?.offset;
    const end=next>begin?Math.min(next,begin+5000):begin+2500;
    const cap=row.results.cloud?.text||row.results.local?.text||row.results.libre?.text||row.text;
    out+=(i+1)+"\n"+vttTime(begin)+" --> "+vttTime(end)+"\n"+cap.replace(/\n/g," ")+"\n\n";
  });
  download("mobilab-session-approx.vtt",out,"text/vtt;charset=utf-8");
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&micActive)stopMic();
  if(document.hidden)synthesis?.cancel();
});
window.addEventListener("pagehide",()=>{
  if(micActive)stopMic();
  queue.stop();
  synthesis?.cancel();
  localTranslator.dispose();
});
refreshRecordingUI();
renderRows();
renderScoreboard();
showComparison(null);
