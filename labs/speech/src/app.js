import { createChromeTranslatorAdapter, lexicalAgreement } from "./engine-compare.js";
import { TranslationQueue, wordErrorRate, characterSimilarity, safeLibreEndpoint } from "./bench-core.js";

const $ = (id) => document.getElementById(id);
const locale = {he:"he-IL",en:"en-US",es:"es-ES",fr:"fr-FR",de:"de-DE",ar:"ar-SA",ru:"ru-RU",it:"it-IT"};
const langNames = {he:"Hebrew",en:"English",es:"Spanish",fr:"French",de:"German",ar:"Arabic",ru:"Russian",it:"Italian"};
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const synthesis = window.speechSynthesis;
const localTranslator = createChromeTranslatorAdapter(window);
const translationCache = new Map();
let rows = [];
let rowId = 0;
let sessionStart = Date.now();
let recognize = null;
let micActive = false;
let micToken = 0;
let restartTimeout = null;
let restartTimes = [];
let sessionTimer = null;
let interimActive = false;
let currentUtterance = null;
let voiceChoices = [];
const MAX_PHRASES = 250;

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
}
function clockText(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
function updateTimer() {
  $("recordTime").textContent = micActive ? clockText(Date.now() - sessionStart) : $("recordTime").textContent;
}
function stopMic() {
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
  queue.stop(); // cancels pending and running provider requests
  interimActive = false;
  refreshRecordingUI();
  status("Recording finished. Transcript is kept in this page; unfinished translations canceled.");
  if (rows.length) {
    const latest = rows[rows.length - 1];
    showCaption(latest);
    showComparison(latest);
  }
}
function activateRecognizer(token) {
  if (!micActive || micToken !== token) return;
  const instance = new Recognition();
  recognize = instance;
  const finalized = new Set();
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
        addPhrase(phrase, $("sourceLang").value, $("targetLang").value, candidates,
          $("autoTranslate").checked);
      } else if (!result.isFinal) interim += " " + phrase;
    }
    if (interim.trim()) {
      interimActive = true;
      $("captionOriginal").textContent = interim.trim() + " …";
      $("captionTranslated").textContent = "Listening for the end of this phrase…";
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
  if (!rows.length) sessionStart = Date.now();
  else sessionStart = Date.now(); // recording time resets, transcript history persists
  micActive = true;
  micToken++;
  restartTimes = [];
  queue.start();
  refreshRecordingUI();
  $("recordTime").textContent = "00:00";
  sessionTimer = setInterval(updateTimer,1000);
  try { activateRecognizer(micToken); }
  catch (error) { stopMic();status("Microphone failed: "+error.message,true); }
}
$("recordToggle").addEventListener("click", () => micActive ? stopMic() : startMic());

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
  const key = source+"|"+target+"|"+text;
  if (translationCache.has(key)) return translationCache.get(key);
  const out = [];
  const timeout = timeoutSignal(signal);
  try {
    for (const chunk of splitText(text)) {
      const q = new URLSearchParams({q:chunk,langpair:source+"|"+target});
      const response = await fetch("https://api.mymemory.translated.net/get?"+q,{signal:timeout.signal});
      if (!response.ok) throw new Error("MyMemory HTTP "+response.status);
      const data = await response.json();
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
async function translateLibre(text, source, target, signal, endpoint) {
  if (source === target) return text;
  const timeout = timeoutSignal(signal,15000);
  try {
    const response = await fetch(endpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({q:text,source,target,format:"text"}),
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
  const list = [{
    id:"cloud",label:"MyMemory (cloud)",
    run:(text,source,target,signal) => translateMyMemory(text,source,target,signal)
  }];
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
    // Invalid input must fail visibly, never silently send to an unapproved domain.
    const endpoint = safeLibreEndpoint($("libreEndpoint").value.trim());
    list.push({id:"libre",label:"Your LibreTranslate server",
      run:(text,source,target,signal)=>translateLibre(text,source,target,signal,endpoint)});
  }
  return list;
}
function updateRow(row,id,patch) {
  if (!row) return;
  if (id === "queue") row.queueStatus = patch.status;
  else row.results[id] = {...(row.results[id] || {}),...patch};
  renderRows();
  if (rows[rows.length-1]?.id === row.id) {
    if (!interimActive) showCaption(row);
    showComparison(row);
  }
}
const queue = new TranslationQueue({onChange:updateRow,maxPending:8});
function addPhrase(text,source,target,candidates=null,automatic=true) {
  text=text.trim();
  if (!text || rows.length >= MAX_PHRASES) {
    if (rows.length >= MAX_PHRASES) { if(micActive)stopMic();status("Session capped at 250 phrases. Export or clear before recording more.",true);}
    return;
  }
  const previous = rows[rows.length-1];
  if (candidates && previous && previous.text.toLocaleLowerCase() === text.toLocaleLowerCase()
    && Date.now()-previous.at < 1500) return;
  const row = { id:++rowId,at:Date.now(),offset:Date.now()-sessionStart,text,source,target,
    candidates,results:{},queueStatus:"saved" };
  rows.push(row);
  interimActive=false;
  renderRows();showCaption(row);showComparison(row);showCandidates(row);
  if (automatic) translateRow(row);
  else status("Phrase saved. Tap 'Translate saved' whenever you're ready.");
}
function translateRow(row) {
  try {
    const providers = activeProviders();
    if (!queue.enqueue(row,providers)) status("Translation queue is full; transcript was still saved.",true);
  } catch (error) {
    row.queueStatus="skipped";
    status("Comparison setting: "+error.message,true);
    renderRows();
  }
}
function translateSaved() {
  queue.start();
  const targets=rows.filter(row => !["queued","running","success"].includes(row.queueStatus)
    && Object.values(row.results).every(x=>x.status!=="running"));
  if (!targets.length) {
    const latest=rows[rows.length-1];
    if(latest) {
      // Explicit re-run of the latest phrase against newly enabled engines.
      latest.results={}; latest.queueStatus="saved";
      translateRow(latest);
      status("Re-running the latest phrase through the selected engines.");
    } else status("No saved phrases to translate yet.",true);
    return;
  }
  for(const row of targets) translateRow(row);
}
$("translateSaved").addEventListener("click",translateSaved);

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
  rows=[];rowId=0;sessionStart=Date.now();
  interimActive=false;
  $("recordTime").textContent="00:00";
  $("wer").textContent="—";
  $("captionOriginal").textContent="Waiting for input…";
  $("captionTranslated").textContent="Translation will appear here.";
  $("speechCandidates").replaceChildren();
  renderRows();showComparison(null);
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
  const result = row.results.cloud?.text || row.results.local?.text || row.results.libre?.text;
  const finished = row.queueStatus==="stopped" || row.queueStatus==="saved" || row.queueStatus==="skipped"
    || Object.values(row.results).some(x=>x.status==="canceled");
  $("captionTranslated").textContent=result || (finished ? "Saved transcript · not translated." : "Translating final phrase…");
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
  for(const row of rows.slice().reverse()){
    const card=document.createElement("article");card.className="segment";
    const meta=document.createElement("div");meta.className="meta";
    const label=document.createElement("span");label.textContent=new Date(row.at).toLocaleTimeString();
    const lang=document.createElement("span");lang.textContent=row.source.toUpperCase()+" → "+row.target.toUpperCase();
    meta.append(label,lang);
    const orig=document.createElement("p");orig.className="original";orig.textContent=row.text;
    card.append(meta,orig);
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
  const sample=lang==="he"?"שלום, זאת בדיקת הקראה.":lang==="ar"?"مرحباً، هذا اختبار للصوت.":"Hello, this is a voice test.";
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

function updateReferenceScores(){
  const reference=$("referenceTranslation").value.trim();
  const row=rows[rows.length-1];
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
$("referenceTranslation").addEventListener("input",updateReferenceScores);
$("scoreWer").addEventListener("click",()=>{
  const reference=$("referenceText").value.trim();
  const spoken=rows.filter(row=>Array.isArray(row.candidates)).map(row=>row.text).join(" ");
  const score=wordErrorRate(reference,spoken);
  if(score===null){status("Enter the actual spoken words in Reference first.",true);return;}
  $("wer").textContent=(score*100).toFixed(1)+"%";
  status("WER computed from your human reference. Lower is better.");
});
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
showComparison(null);
