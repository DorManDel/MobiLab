/**
 * VoiceBridge Test Mode v0.8
 * A per-run, bounded, privacy-first capture of real telemetry and canonical
 * transcript rows. No synthetic measurements and no raw audio recording.
 *
 * All elapsed values are milliseconds. STT timing is a browser-event estimate,
 * not a precisely timestamped acoustic measurement.
 */
const terminal=new Set(["saved","completed","skipped","canceled","unavailable","stopped"]);
const SAMPLE_LIMIT=5000;
const SCENARIOS=new Set(["live","stt-only","long-speech","compare"]);
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const safeNumber=x=>finite(x)?Math.round(x):null;
const cleanText=x=>typeof x==="string"?x:"";
const compactId=()=>{
  if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
  // Non-cryptographic fallback only identifies an analytics run; not an auth token.
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
};
export const percentile=(input,quantile)=>{
  const values=input.filter(finite).sort((a,b)=>a-b);
  if(!values.length)return null;
  return Math.round(values[Math.max(0,Math.min(values.length-1,Math.ceil(values.length*quantile)-1))]);
};
function durationSummary(values){
  return {count:values.filter(finite).length,p50Ms:percentile(values,.5),p90Ms:percentile(values,.9)};
}
function errorName(value){
  // Provider errors can contain sensitive endpoint URLs: export only category.
  const s=cleanText(value);
  if(/429|quota|rate.limit/i.test(s))return "rate_limit";
  if(/timeout|timed out/i.test(s))return "timeout";
  if(/network|fetch failed|failed to fetch/i.test(s))return "network";
  if(/unsupported|not available/i.test(s))return "unsupported";
  if(/aborted|stopped|canceled/i.test(s))return "canceled";
  if(s)return "provider_error";
  return null;
}
function rowsForTest(ledger,baseCount,baseId){
  // No entry existed before begin() should appear in this report.
  return ledger.entries.slice(baseCount).filter(r=>r.id>baseId);
}
function sanitizedRow(row,includeText=false){
  const results=Object.entries(row.results||{}).map(([provider,r])=>({
    provider,status:r.status||"unknown",durationMs:safeNumber(r.ms),
    errorCategory:errorName(r.error),translated:Boolean(r.text)
  }));
  const item={
    id:row.id,
    offsetMs:safeNumber(row.offset),
    source:row.source||null,target:row.target||null,
    fromSpeech:Boolean(row.fromSpeech),wordCount:cleanText(row.text).trim().split(/\s+/u).filter(Boolean).length,
    sourceCharacters:cleanText(row.text).length,translationCharacters:cleanText(row.displayText).length,
    sttMs:safeNumber(row.sttMs),queueWaitMs:safeNumber(row.queueWaitMs),
    finalToSubtitleMs:safeNumber(row.finalToSubtitleMs),
    queueStatus:row.queueStatus||"unknown",captionProvider:row.displayProvider||null,
    selectedProvider:row.captionProvider||null,fallbackUsed:Boolean(row.fallbackUsed),
    translated:Boolean(row.displayText),providers:results
  };
  if(includeText){
    item.original=cleanText(row.text);
    item.translation=cleanText(row.displayText);
    item.reference=cleanText(row.translationReference);
  }
  return item;
}
export class TestSessionRecorder {
  constructor({ledger,now=()=>Date.now(),clock=()=>performance.now(),timeoutMs=20000,onChange=()=>{}}={}){
    if(!ledger?.entries)throw new Error("Test session requires canonical SessionLedger");
    this.ledger=ledger;
    this.now=now;this.clock=clock;
    this.timeoutMs=timeoutMs;
    this.onChange=onChange;
    this.phase="idle";
    this.events=[];this.overflow=0;
    this.id=null;this.scenario=null;this.label="";
    this.metadata={};this.environment={};
    this.baseCount=0;this.baseId=0;
    this.startedAt=null;this.endedAt=null;
    this.t0=0;this.tStop=null;
    this.finishReason=null;this.finalRows=null;
    this._poll=null;this._timer=null;this._stopDue=null;
  }
  get recording(){return this.phase==="recording";}
  get pending(){return this.phase==="finishing";}
  get ready(){return this.phase==="ready";}
  begin({scenario="live",label="",metadata={},environment={}}={}){
    if(this.recording||this.pending)throw new Error("Finish the current test first.");
    this._cleanup();
    this.id=compactId();
    this.scenario=SCENARIOS.has(scenario)?scenario:"live";
    this.label=cleanText(label).slice(0,100);
    this.metadata={...metadata};
    this.environment={...environment};
    this.baseCount=this.ledger.entries.length;
    this.baseId=Math.max(0,...this.ledger.entries.map(r=>Number(r.id)||0));
    this.startedAt=new Date(this.now()).toISOString();
    this.endedAt=null;this.t0=this.clock();this.tStop=null;
    this.events=[];this.overflow=0;this.finalRows=null;
    this.finishReason=null;this.phase="recording";this.onChange();
    return this.id;
  }
  onEvent(event){
    if(this.phase!=="recording" && this.phase!=="finishing")return;
    const item={
      tMs:Math.max(0,safeNumber(this.clock()-this.t0)),
      type:cleanText(event?.type).slice(0,70),
      rowId:finite(event?.rowId)?event.rowId:null,
      // Details may contain service names, timings, or errors; only the event
      // category is exported. No text, tokens, URLs, or arbitrary provider errors.
      detailCategory:/^provider-/.test(event?.type||"")?"provider":
        /^queue-/.test(event?.type||"")?"queue":null
    };
    if(this.events.length<SAMPLE_LIMIT)this.events.push(item);
    else this.overflow++;
    if(item.type==="mic-stop" && this.recording)this.requestStop("mic_stopped");
    else if(this.pending && (item.type==="queue-completed"||
      item.type==="queue-skipped"||item.type==="provider-success"||item.type==="provider-error"))this._scheduleCheck();
  }
  requestStop(reason="user_finished"){
    if(this.phase==="ready")return;
    if(this.phase!=="recording"&&this.phase!=="finishing")return;
    if(this.phase==="finishing")return;
    this.phase="finishing";
    this.finishReason=reason;this.tStop=this.clock();
    this._stopDue=this.tStop+this.timeoutMs;
    this._timer=setTimeout(()=>this.seal("timeout_waiting_for_translations"),this.timeoutMs+30);
    // Stop may be called before ParagraphBuilder flushes; don't freeze rows
    // until the synchronous Stop handler has completed and asynchronous queue
    // callbacks had a chance to update the entries.
    this._scheduleCheck(550);
    this.onChange();
  }
  _scheduleCheck(delay=120){
    clearTimeout(this._poll);
    this._poll=setTimeout(()=>this._check(),delay);
  }
  _check(){
    if(!this.pending)return;
    if(this.clock()>=this._stopDue){
      this.seal("timeout_waiting_for_translations");return;
    }
    const rows=rowsForTest(this.ledger,this.baseCount,this.baseId);
    if(rows.every(r=>terminal.has(r.queueStatus||"saved"))){
      this.seal(this.finishReason||"completed");
    }else{
      this._scheduleCheck(180);
    }
  }
  seal(reason="completed"){
    if(!this.recording&&!this.pending)return;
    this.finishReason=reason;
    this.finalRows=rowsForTest(this.ledger,this.baseCount,this.baseId)
      .map(row=>({...row,results:Object.fromEntries(Object.entries(row.results||{})
        .map(([id,r])=>[id,{...r}]))}));
    this.endedAt=new Date(this.now()).toISOString();
    this.phase="ready";this._cleanup();this.onChange();
  }
  invalidate(reason="cleared_during_test"){
    if(!this.recording&&!this.pending)return;
    this.seal(reason);
  }
  _cleanup(){clearTimeout(this._poll);clearTimeout(this._timer);this._poll=null;this._timer=null;}
  bundle({includeText=false}={}){
    if(!this.ready)throw new Error("Finish test and translations before exporting.");
    const rows=this.finalRows.map(r=>sanitizedRow(r,includeText));
    const stt=rows.map(r=>r.sttMs),queue=rows.map(r=>r.queueWaitMs),
      captions=rows.map(r=>r.finalToSubtitleMs);
    const allProviders=rows.flatMap(r=>r.providers);
    const byProvider={};
    for(const p of allProviders){
      byProvider[p.provider]??={attempts:0,succeeded:0,failed:0,durations:[]};
      const stats=byProvider[p.provider];
      stats.attempts++;
      if(p.status==="success")stats.succeeded++;
      if(p.status==="error")stats.failed++;
      if(p.status==="success"&&finite(p.durationMs))stats.durations.push(p.durationMs);
    }
    const providers=Object.fromEntries(Object.entries(byProvider).map(([name,v])=>[
      name,{attempts:v.attempts,success:v.succeeded,errors:v.failed,
        latency:durationSummary(v.durations)}]));
    const fromSpeech=rows.filter(r=>r.fromSpeech);
    const translations=rows.filter(r=>r.translated).length;
    const countType=type=>this.events.filter(e=>e.type===type).length;
    const micStart=this.events.find(e=>e.type==="mic-start")?.tMs??0;
    const firstInterim=this.events.find(e=>e.type==="interim-first");
    const firstFinal=this.events.find(e=>e.type==="speech-final");
    const processingErrors=this.events.filter(e=>/error|unavailable/.test(e.type)).length;
    return {
      schema:"voicebridge.test.bundle.v1",
      run:{
        id:this.id,scenario:this.scenario,label:this.label,
        startedAt:this.startedAt,finishedAt:this.endedAt,
        elapsedMs:Math.max(0,Math.round((this.tStop??this.clock())-this.t0)),
        finishReason:this.finishReason,
        privacy:{includesTranscript:includeText,includesRawAudio:false,includesProviderCredentials:false},
        configuration:{...this.metadata},device:{...this.environment}
      },
      summary:{
        capturedSegments:rows.length,speechSegments:fromSpeech.length,
        translatedSegments:translations,
        completionPercent:this.scenario==="stt-only"?null:(rows.length?Math.round(100*translations/rows.length):null),
        firstInterimMs:firstInterim?firstInterim.tMs-micStart:null,
        firstFinalMs:firstFinal?firstFinal.tMs-micStart:null,
        finalEventCount:countType("speech-final"),
        interimEventCount:countType("interim-first"),
        duplicatedFinalsSuppressed:countType("duplicate-suppressed"),
        overlapsTrimmed:countType("overlap-trimmed"),
        recognizerErrors:countType("recognizer-error"),
        recognizerRestarts:Math.max(0,countType("recognizer-start")-1),
        audioMeterUnavailable:countType("audio-monitor-unavailable")>0,
        processingErrors,
        stt:durationSummary(stt),queueWait:durationSummary(queue),
        finalToCaption:durationSummary(captions),
        providerPerformance:providers
      },
      segments:rows,
      events:[...this.events],
      eventsTruncated:this.overflow
    };
  }
}
const cells=(value)=>{
  if(value===null||value===undefined)return "";
  const t=String(value);
  return /[",\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;
};
export function toCsv(records,headers){
  return [headers.join(","),...records.map(row=>headers.map(key=>cells(row[key])).join(","))].join("\r\n")+"\r\n";
}
export function segmentsCsv(bundle){
  const headers=["run_id","scenario","segment_id","source","target","from_speech",
    "word_count","stt_ms","queue_wait_ms","final_to_caption_ms","queue_status",
    "provider","provider_status","provider_ms","error_category","display_provider",
    "translated","fallback_used"];
  const records=[];
  for(const row of bundle.segments){
    const choices=row.providers.length?row.providers:[{provider:"none",status:"unavailable",durationMs:null,errorCategory:null}];
    for(const p of choices){
      records.push({
        run_id:bundle.run.id,scenario:bundle.run.scenario,segment_id:row.id,
        source:row.source,target:row.target,from_speech:row.fromSpeech,
        word_count:row.wordCount,stt_ms:row.sttMs,queue_wait_ms:row.queueWaitMs,
        final_to_caption_ms:row.finalToSubtitleMs,queue_status:row.queueStatus,
        provider:p.provider,provider_status:p.status,provider_ms:p.durationMs,
        error_category:p.errorCategory,display_provider:row.captionProvider,
        translated:row.translated,fallback_used:row.fallbackUsed
      });
    }
  }
  return toCsv(records,headers);
}
export function eventsCsv(bundle){
  return toCsv(bundle.events.map(e=>({
    run_id:bundle.run.id,t_ms:e.tMs,type:e.type,row_id:e.rowId,category:e.detailCategory
  })),["run_id","t_ms","type","row_id","category"]);
}
function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
/** Standards-compatible ZIP with stored entries, UTF-8 names and no CDN dependency. */
export function makeBundleZip(bundle){
  const files=[
    ["summary.json",JSON.stringify(bundle,null,2)+"\n"],
    ["segments.csv",segmentsCsv(bundle)],
    ["events.csv",eventsCsv(bundle)]
  ];
  const encoder=new TextEncoder(),pieces=[],central=[];
  let offset=0;
  for(const [filename,content] of files){
    const name=encoder.encode(filename),data=encoder.encode(content);
    const crc=crc32(data),nlen=name.length,local=new Uint8Array(30+nlen);
    let v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);
    v.setUint16(8,0,true);v.setUint32(14,crc,true);
    v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);
    v.setUint16(26,nlen,true);local.set(name,30);
    pieces.push(local,data);
    const cent=new Uint8Array(46+nlen);v=new DataView(cent.buffer);
    v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);
    v.setUint16(8,0x0800,true);v.setUint16(10,0,true);
    v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);
    v.setUint16(28,nlen,true);v.setUint32(42,offset,true);cent.set(name,46);
    central.push(cent);
    offset+=local.length+data.length;
  }
  const centralLength=central.reduce((n,part)=>n+part.length,0);
  const eocd=new Uint8Array(22),end=new DataView(eocd.buffer);
  end.setUint32(0,0x06054b50,true);
  end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);
  end.setUint32(12,centralLength,true);end.setUint32(16,offset,true);
  return new Blob([...pieces,...central,eocd],{type:"application/zip"});
}
