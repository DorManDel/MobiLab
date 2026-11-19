/**
 * VoiceBridge v4 - conservative adaptive live-subtitle planner + offline replay.
 *
 * Candidate prefixes contain words from observed interim transcripts only;
 * there is no next-word prediction or LLM generation. Replay makes no API
 * requests and estimates when a draft could have been requested, not when
 * translation text would have been delivered.
 */
import {StableInterimPlanner,stablePrefix} from "./stable-interim.mjs";

const words=s=>String(s??"").normalize("NFC").trim().replace(/\s+/gu," ").split(" ").filter(Boolean);
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase().replace(/[.,!?;:؟،]+$/gu,"");
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const maxLimit=x=>Math.max(1,Math.min(2,Math.trunc(Number(x)||1)));

export class AdaptiveInterimPlanner {
  constructor({maxDrafts=2}={}){this.maxDrafts=maxLimit(maxDrafts);this.reset();}
  reset(){
    this.previous="";this.previous2="";this.previousAt=null;
    this.lastSentWords=0;this.lastSentAt=-Infinity;
    this.sent=0;this.interimCount=0;this.uniqueUpdates=0;this.lastText="";
    this.stableSince=null;this.lastStableText="";
  }
  observe(raw,at){
    const current=String(raw||"").trim().replace(/\s+/gu," ");
    if(!current)return null;
    this.interimCount++;
    if(current!==this.lastText){this.uniqueUpdates++;this.lastText=current;}
    const old=this.previous,old2=this.previous2;
    this.previous2=old;this.previous=current;
    if(!old||this.sent>=this.maxDrafts)return null;
    const common=stablePrefix(old,current,{holdTail:1,minWords:1});
    if(!common)return null;
    // The stable duration is a time heuristic, not calibrated confidence.
    const key=common.text;
    if(key===this.lastStableText){
      if(this.stableSince===null)this.stableSince=at;
    }else{this.stableSince=at;this.lastStableText=key;}
    const age=at-this.stableSince;
    // Three repeated hypotheses permit a shorter phrase. For two snapshots,
    // prefer a larger, more conservative stable prefix.
    const three=old2&&stablePrefix(old2,current,{holdTail:1,minWords:1});
    const triple=Boolean(three&&three.wordCount>=common.wordCount);
    const threshold=(triple||age>=450)?3:4;
    if(common.wordCount<threshold)return null;
    const growth=this.lastSentWords===0?threshold:(common.wordCount>=10?3:4);
    if(common.wordCount<this.lastSentWords+growth)return null;
    const cooldown=this.lastSentWords?950:0;
    if(at-this.lastSentAt<cooldown)return null;
    if(key===this.lastSentText)return null;
    this.sent++;this.lastSentWords=common.wordCount;this.lastSentText=key;this.lastSentAt=at;
    return {...common,reason:triple?"three-hypotheses":"stable-pair"};
  }
}

/** Factory ensures all live/replay modes use exactly matching algorithms. */
export function createPlanner(mode,maxDrafts=2){
  const limit=maxLimit(maxDrafts);
  if(mode==="adaptive")return new AdaptiveInterimPlanner({maxDrafts:limit});
  if(mode==="fast")return new StableInterimPlanner({
    maxDrafts:Math.min(1,limit),minWords:3,minGrowth:3,holdTail:1,cooldownMs:850
  });
  if(mode==="final-only")return null;
  return new StableInterimPlanner({
    maxDrafts:limit,minWords:4,minGrowth:4,holdTail:1,cooldownMs:1300
  });
}
function matchesFinalPrefix(candidate,final){
  const a=words(candidate).map(norm),b=words(final).map(norm);
  if(!b.length)return null;
  return a.length<=b.length&&a.every((w,i)=>w===b[i]);
}
/**
 * Dry-run the SAME captured STT interim history across configurations.
 * This is an algorithmic timing/risk preview; not observed translation latency,
 * translation quality, or billable provider request count.
 */
export function replayTrace(samples,finalText="",{maxDrafts=2}={}){
  const data=(Array.isArray(samples)?samples:[])
    .filter(x=>finite(x?.tMs)&&typeof x?.text==="string")
    .map(x=>({tMs:Math.max(0,x.tMs),text:x.text})).sort((a,b)=>a.tMs-b.tMs)
    .slice(0,500);
  const modes=["incremental","fast","adaptive","final-only"];
  return modes.map(mode=>{
    const p=createPlanner(mode,maxDrafts),proposals=[];
    for(const s of data){
      const item=p?.observe(s.text,s.tMs);
      if(item)proposals.push({
        atMs:s.tMs,wordCount:item.wordCount,
        matchesFinalPrefix:matchesFinalPrefix(item.text,finalText),
        // Keep proposed text internally for preview only. Export removes it.
        text:item.text
      });
    }
    const evaluated=proposals.filter(x=>x.matchesFinalPrefix!==null);
    return {
      mode,firstEligibleMs:proposals[0]?.atMs??null,
      candidateCount:proposals.length,
      divergentPrefixes:evaluated.filter(x=>x.matchesFinalPrefix===false).length,
      evaluatedCount:evaluated.length,
      interimSamples:data.length,
      proposals
    };
  });
}
export function replaySummary(samples,final,config){
  return replayTrace(samples,final,config).map(({proposals,...summary})=>summary);
}
