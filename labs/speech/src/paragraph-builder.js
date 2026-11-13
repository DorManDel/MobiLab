import { dedupeFinalOverlap } from "./session-ledger.js";
/**
 * ParagraphBuilder groups finalized SpeechRecognition phrases by silence.
 * It never stores interim hypotheses; those are for UI preview only.
 * A paragraph is emitted only once, after user-configured inactivity or Stop.
 *
 * Browser speech events do not provide precise acoustic word timestamps.
 * silenceMs measures delay after the latest final result, not physical silence.
 */
export class ParagraphBuilder {
  constructor({
    onPreview = () => {},
    onParagraph,
    silenceMs = 1600,
    maxWords = 80,
    schedule = (callback,ms)=>setTimeout(callback,ms),
    unschedule = id=>clearTimeout(id)
  } = {}) {
    if(typeof onParagraph!=="function") throw new Error("onParagraph callback is required");
    this.onPreview=onPreview;this.onParagraph=onParagraph;
    this.schedule=schedule;this.unschedule=unschedule;
    this.silenceMs=silenceMs;this.maxWords=maxWords;
    this.parts=[];this.timer=null;this.meta=null;
  }
  setSilence(ms) {
    this.silenceMs=Math.max(500,Math.min(5000,Math.round(Number(ms)||1600)));
    if(this.parts.length)this.arm();
  }
  setMaxWords(count) {
    this.maxWords=Math.max(20,Math.min(200,Math.round(Number(count)||80)));
  }
  get pending(){return this.parts.join(" ").trim();}
  clearTimer(){if(this.timer!==null){this.unschedule(this.timer);this.timer=null;}}
  arm(){
    this.clearTimer();
    this.timer=this.schedule(()=>{this.timer=null;this.flush("silence");},this.silenceMs);
  }
  addFinal(text,meta={}) {
    const cleaned=String(text||"").trim().replace(/\s+/gu," ");
    if(!cleaned)return false;
    // Source/target changes must never mix two language pairs in one paragraph.
    if(this.meta && (this.meta.source!==meta.source || this.meta.target!==meta.target))
      this.flush("language-change");
    const unique=dedupeFinalOverlap(this.pending,cleaned);
    if(!unique) { this.arm(); return false; }
    this.parts.push(unique);
    this.meta={...meta,startedAt:this.meta?.startedAt??meta.finalPerf??null,
      finalPerf:meta.finalPerf??this.meta?.finalPerf??null};
    this.onPreview(this.pending);
    if(this.pending.split(/\s+/u).length>=this.maxWords) {
      this.flush("length");
    } else this.arm();
    return true;
  }
  flush(reason="manual"){
    this.clearTimer();
    const text=this.pending;
    if(!text)return null;
    const payload={text,...this.meta,reason};
    this.parts=[];this.meta=null;
    this.onParagraph(payload);
    return payload;
  }
  clear(){
    this.clearTimer();this.parts=[];this.meta=null;this.onPreview("");
  }
}
