import {formatLatency, timeStats, validCaptionMode} from "./live-captions.js";

/**
 * Rendering-only subtitle component, independent from recognition/translation providers.
 * All content uses textContent, never model-derived innerHTML.
 */
export class LiveCaptionView {
  constructor(doc=document) {
    this.doc=doc;
    this.root=doc.getElementById("liveDeck");
    this.history=[];
    this.mode="bottom";
    this.latencies=[];
    this.lastTranslation="";
    this.lastSource="";
    for(const button of doc.querySelectorAll("[data-caption-mode]")) {
      button.addEventListener("click",()=>this.setMode(button.dataset.captionMode));
    }
    this.setMode("bottom");
  }
  el(id){return this.doc.getElementById(id);}
  setMode(mode){
    this.mode=validCaptionMode(mode);
    this.root.dataset.mode=this.mode;
    for(const btn of this.doc.querySelectorAll("[data-caption-mode]")) {
      btn.setAttribute("aria-pressed",String(btn.dataset.captionMode===this.mode));
    }
    this.drawHistory();
  }
  interim(text){
    if(!text.trim())return;
    this.el("livePartial").textContent=text+" …";
    this.el("livePhase").textContent="Listening / provisional";
    this.el("liveLabel").textContent="LIVE WORDS · NOT FINAL";
    this.el("liveNotice").textContent="Speech preview is provisional; the recognizer may revise these words.";
  }
  early(text,ms){
    this.el("liveTranslation").textContent="≈ "+text;
    this.el("livePhase").textContent="EARLY DRAFT · may change";
    this.el("liveNotice").textContent="Draft translation: "+formatLatency(ms)+" from interim request; not a verified final caption.";
  }
  final(row){
    this.el("livePartial").textContent=row.text;
    this.el("liveLabel").textContent="FINAL SPEECH · "+row.source.toUpperCase()+" → "+row.target.toUpperCase();
    this.el("livePhase").textContent="Translating final subtitle…";
    this.el("liveTranslation").textContent="…";
    this.el("liveNotice").textContent="Recognized final words. Waiting for a translation provider.";
    this.el("liveSttMs").textContent=formatLatency(row.sttMs);
    this.el("liveQueueMs").textContent="—";
    this.el("liveApiMs").textContent="—";
    this.el("liveTotalMs").textContent="—";
  }
  showQueue(row) {
    if(!row)return;
    this.el("liveSttMs").textContent=formatLatency(row.sttMs);
    this.el("liveQueueMs").textContent=formatLatency(row.queueWaitMs);
    const results=Object.values(row.results||{}).filter(v=>v?.text);
    const fastest=results.length ? results.reduce((best,r)=>!best||r.ms<best.ms?r:best,null) : null;
    this.el("liveApiMs").textContent=formatLatency(fastest?.ms);
    this.el("liveTotalMs").textContent=formatLatency(row.finalToSubtitleMs);
    const stats=timeStats(this.latencies);
    this.el("livePercentile").textContent=stats.count ? "p50 "+formatLatency(stats.p50)+" · p90 "+formatLatency(stats.p90) : "p50/p90: —";
  }
  translated(row, text, provider, keepInterim=false) {
    if(!text)return;
    this.lastTranslation=text;
    this.el("liveAccessible").textContent=text;
    this.lastSource=row.text;
    if(!keepInterim)this.el("livePartial").textContent=row.text;
    this.el("liveTranslation").textContent=text;
    this.el("livePhase").textContent=(keepInterim?"PREVIOUS CAPTION · ":"FINAL TRANSLATION · ")+provider;
    this.el("liveNotice").textContent="Final translation visible. Render delay measured from Web Speech final event.";
    this.history=this.history.filter(item=>item.id!==row.id);
    this.history.push({id:row.id,text});
    if(this.history.length>5)this.history.shift();
    this.drawHistory();
  }
  skipped(row){
    this.el("livePartial").textContent=row.text;
    this.el("liveTranslation").textContent="Translation skipped to keep live subtitles current.";
    this.el("livePhase").textContent="CATCH-UP MODE";
    this.el("liveNotice").textContent="Text saved in transcript. Use Translate saved to recover skipped lines.";
  }
  drawHistory(){
    const roll=this.el("liveRoll");
    roll.replaceChildren();
    for(const item of this.history.slice(-3)){
      const node=this.doc.createElement("div");
      node.className="roll-entry";
      node.dir="auto";
      node.textContent=item.text;
      roll.append(node);
    }
    const ticker=this.el("liveTicker");
    const text=this.history.at(-1)?.text || this.lastTranslation || "Translation appears here";
    ticker.textContent=text;
    const seconds=Math.min(24,Math.max(9,Math.ceil(Array.from(text).length/6)));
    ticker.style.setProperty("--ticker-seconds",seconds+"s");
  }
  reset(){
    this.history=[];
    this.latencies=[];
    this.el("liveAccessible").textContent="";
    this.lastTranslation="";
    this.lastSource="";
    this.el("livePartial").textContent="Tap Start recording, or translate a typed phrase below.";
    this.el("liveTranslation").textContent="Translation appears here";
    this.el("liveLabel").textContent="SUBTITLES · REAL-TIME PREVIEW";
    this.el("livePhase").textContent="Ready";
    this.el("liveNotice").textContent="Interim text appears instantly; translations are final unless Early Draft is enabled.";
    for(const id of ["liveSttMs","liveQueueMs","liveApiMs","liveTotalMs"])this.el(id).textContent="—";
    this.el("livePercentile").textContent="p50/p90: —";
    this.drawHistory();
  }
}
