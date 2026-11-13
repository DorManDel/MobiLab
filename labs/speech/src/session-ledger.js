/**
 * One canonical, append-only source transcript.
 * Translation providers enrich entries without changing the recognized source text.
 * Views use an entry ID as a focus cursor; changing number of visible lines never
 * changes segmentation, provider requests, or the transcript itself.
 */
export class SessionLedger {
  constructor(){this.entries=[];this.cursor=null;this.followLive=true;}
  append(entry) {
    if(!entry || !String(entry.text||"").trim())throw Error("Transcript entry needs text");
    if(this.entries.some(row=>row.id===entry.id))throw Error("Duplicate transcript ID");
    Object.defineProperty(entry,"text",{value:entry.text,writable:false,enumerable:true});
    this.entries.push(entry);
    if(this.followLive)this.cursor=entry.id;
    return entry;
  }
  clear(){this.entries.length=0;this.cursor=null;this.followLive=true;}
  focus(id) {
    const row=this.entries.find(x=>x.id===id);
    if(row){this.cursor=row.id;this.followLive=false;}
    return row||null;
  }
  step(direction){
    const i=this.entries.findIndex(x=>x.id===this.cursor);
    if(i<0)return this.latest;
    const next=this.entries[Math.min(this.entries.length-1,Math.max(0,i+Math.sign(direction)))];
    if(next){this.cursor=next.id;this.followLive=false;}
    return next||null;
  }
  resumeLive(){this.followLive=true;this.cursor=this.latest?.id??null;return this.latest;}
  get focused(){return this.entries.find(x=>x.id===this.cursor)||null;}
  get latest(){return this.entries.at(-1)||null;}
  snapshot(){
    return this.entries.map(row=>({
      id:row.id,timestamp:new Date(row.at).toISOString(),offsetMs:row.offset??null,
      source:row.source,target:row.target,original:row.text,
      state:row.queueStatus,captionEngine:row.displayProvider||null,
      selectedDisplayEngine:row.captionProvider||null,usedFallback:Boolean(row.fallbackUsed),
      humanReferenceTranslation:row.translationReference||null,
      caption:row.displayText||null,latencyMs:row.finalToSubtitleMs??null,
      translations:Object.fromEntries(Object.entries(row.results||{}).map(([key,value])=>[
        key,{status:value.status,text:value.text||null,error:value.error||null,ms:value.ms??null}
      ]))
    }));
  }
}

/** Prevent cumulative recognition hypotheses from duplicating previous final words.
 * Conservative: do not delete a short repeated phrase just because it shares words.
 */
export function dedupeFinalOverlap(previous,incoming) {
  const clean=String(incoming||"").trim().replace(/\s+/gu," ");
  const before=String(previous||"").trim().replace(/\s+/gu," ");
  if(!clean || !before)return clean;
  const a=before.split(" "),b=clean.split(" ");
  // Overlap only when at least five successive words repeat at a boundary.
  // This avoids trimming deliberate short repetitions like "yes yes".
  let best=0;
  for(let n=Math.min(a.length,b.length);n>=5;n--){
    const tail=a.slice(-n).join(" ").toLocaleLowerCase();
    const head=b.slice(0,n).join(" ").toLocaleLowerCase();
    if(tail===head){best=n;break;}
  }
  return b.slice(best).join(" ").trim();
}

export class ProviderCircuit {
  constructor(){this.blocked=new Map();}
  block(id,reason){this.blocked.set(id,reason);}
  canCall(id){return !this.blocked.has(id);}
  reason(id){return this.blocked.get(id)||null;}
  reset(id){this.blocked.delete(id);}
  resetAll(){this.blocked.clear();}
}
