import {formatLatency,timeStats,validCaptionMode} from "./live-captions.js";

/**
 * Pure presentation adapter: the canonical SessionLedger owns the source.
 * This component projects the focused transcript entry to a 1–3-line window.
 * Text is always assigned with textContent, never model-generated HTML.
 */
export class LiveCaptionView {
  constructor(doc=document) {
    this.doc=doc;
    this.root=doc.getElementById("liveDeck");
    this.ledger=null;
    this.mode="bottom";
    this.latencies=[];
    this.history=[];
    this.lastTranslation="";
    this.lastSource="";
    this.maxHistory=30;
    this.lines=2;
    for(const button of doc.querySelectorAll("[data-caption-mode]")){
      button.addEventListener("click",()=>this.setMode(button.dataset.captionMode));
    }
    this.setMode("bottom");
  }
  el(id){return this.doc.getElementById(id);}
  bindLedger(log){this.ledger=log;this.drawHistory();this.updateFocusLabel();}
  scrollTail(element){
    // Independent vertical scroll is used instead of CSS line-clamp, which
    // incorrectly focuses the FIRST lines of a long paragraph.
    requestAnimationFrame(()=>{if(element.isConnected)element.scrollTop=element.scrollHeight;});
  }
  original(text) {
    this.el("livePartial").textContent=text;
    this.scrollTail(this.el("liveSourceWindow"));
  }
  target(text) {
    this.el("liveTranslation").textContent=text;
    this.scrollTail(this.el("liveTranslationWindow"));
  }
  updateFocusLabel(){
    if(!this.ledger)return;
    const count=this.ledger.entries.length;
    const i=this.ledger.entries.findIndex(x=>x.id===this.ledger.cursor);
    this.el("focusIndicator").textContent=count===0?"Listening · no saved paragraphs":
      (this.ledger.followLive?"● Following live":"Reviewing saved log")+" · "+(i+1)+"/"+count;
    this.el("focusLive").setAttribute("aria-pressed",String(this.ledger.followLive));
    this.el("focusPrev").disabled=count<2||i<=0;
    this.el("focusNext").disabled=count<2||i>=count-1;
  }
  focus(row) {
    if(!row) {
      this.updateFocusLabel();return;
    }
    this.original(row.text);
    this.el("liveLabel").textContent="LOG #"+row.id+" · "+row.source.toUpperCase()+" → "+row.target.toUpperCase();
    const chosen=row.displayProvider||row.captionProvider||"cloud";
    if(row.displayText){
      this.target(row.displayText);
      this.el("livePhase").textContent="TRANSLATED · "+chosen;
    } else {
      const problem=row.results?.[chosen]?.error||row.results?.cloud?.error;
      this.target(problem?"Translation unavailable — original text saved.":this.lastTranslation||"No translation yet · source text saved");
      this.el("livePhase").textContent=problem?"TRANSLATOR ERROR · "+chosen:
        this.lastTranslation?"PREVIOUS TRANSLATION · waiting for current":"AWAITING TRANSLATION";
      if(problem)this.el("liveNotice").textContent=problem;
    }
    this.showQueue(row);
    this.updateFocusLabel();
  }
  setMode(mode){
    this.mode=validCaptionMode(mode);
    this.root.dataset.mode=this.mode;
    for(const btn of this.doc.querySelectorAll("[data-caption-mode]")){
      btn.setAttribute("aria-pressed",String(btn.dataset.captionMode===this.mode));
    }
    this.drawHistory();
  }
  setVisibleLines(count){
    this.lines=[1,2,3].includes(Number(count))?Number(count):2;
    this.root.style.setProperty("--caption-lines",String(this.lines));
    this.scrollTail(this.el("liveTranslationWindow"));
  }
  interim(text){
    if(!String(text||"").trim()||this.ledger&&!this.ledger.followLive)return;
    this.original(text+" …");
    this.el("livePhase").textContent="LIVE SOURCE · provisional";
    this.el("liveLabel").textContent="LISTENING · INTERIM WORDS";
    this.el("liveNotice").textContent="Live words can change until the speech recognizer finalizes them.";
  }
  pendingParagraph(text){
    if(!text||this.ledger&&!this.ledger.followLive)return;
    this.original(text+" …");
    this.el("liveLabel").textContent="BUILDING TRANSCRIPT · WAITING FOR PAUSE";
    this.el("livePhase").textContent="LISTENING · source log";
  }
  early(text,ms){
    if(this.ledger&&!this.ledger.followLive)return;
    this.target("≈ "+text);
    this.el("livePhase").textContent="EARLY DRAFT · provisional";
    this.el("liveNotice").textContent="Early translation request: "+formatLatency(ms)+". It may change.";
  }
  final(row){
    this.drawHistory();
    if(!this.ledger||this.ledger.followLive)this.focus(row);
  }
  showQueue(row){
    if(!row||this.ledger&&this.ledger.focused?.id!==row.id)return;
    this.el("liveTotalLabel").textContent=row.fromSpeech?"Final → subtitle":"Submit → subtitle";
    this.el("liveSttMs").textContent=formatLatency(row.sttMs);
    this.el("liveQueueMs").textContent=formatLatency(row.queueWaitMs);
    const displayed=row.displayProvider?row.results?.[row.displayProvider]:null;
    this.el("liveApiMs").textContent=formatLatency(displayed?.ms);
    this.el("liveTotalMs").textContent=formatLatency(row.finalToSubtitleMs);
    const stats=timeStats(this.latencies);
    this.el("livePercentile").textContent=stats.count
      ?"p50 "+formatLatency(stats.p50)+" · p90 "+formatLatency(stats.p90)
      :"p50/p90: —";
  }
  translated(row,text,provider,keepInterim=false){
    if(!text)return;
    this.lastTranslation=text;
    this.lastSource=row.text;
    this.drawHistory();
    if(this.ledger&&this.ledger.focused?.id!==row.id)return;
    this.el("liveAccessible").textContent=text;
    if(!keepInterim)this.original(row.text);
    this.target(text);
    this.el("livePhase").textContent=(keepInterim?"PREVIOUS CAPTION":"TRANSLATED CAPTION")+" · "+provider;
    this.el("liveNotice").textContent="Translation stored in the log. Source and other engines remain available.";
    this.showQueue(row);
  }
  failed(row,message) {
    if(this.ledger&&this.ledger.focused?.id!==row.id)return;
    this.original(row.text);
    this.target(this.lastTranslation||"Translation unavailable · original saved");
    this.el("livePhase").textContent="TRANSLATION UNAVAILABLE";
    this.el("liveNotice").textContent=message;
  }
  skipped(row){
    if(this.ledger&&this.ledger.focused?.id!==row.id)return;
    this.original(row.text);
    this.target(this.lastTranslation||"Original saved; translation skipped.");
    this.el("livePhase").textContent="CATCH-UP · source preserved";
    this.el("liveNotice").textContent="Older queued translation skipped. The log still contains the full original.";
  }
  drawHistory(){
    const source=this.ledger
      ? this.ledger.entries.slice(-30)
      : this.history.slice(-30);
    const translations=source.filter(row=>row.displayText||row.text&&row.displayText===undefined);
    const roll=this.el("liveRoll");roll.replaceChildren();
    for(const row of translations.slice(-3)){
      const block=this.doc.createElement("div");
      block.className="roll-entry";block.dir="auto";
      block.textContent=row.displayText||row.text;
      roll.append(block);
    }
    const feed=this.el("liveAppend");feed.replaceChildren();
    for(const row of source.slice(-18)){
      const block=this.doc.createElement("div");block.className="append-entry";block.dir="auto";
      const original=this.doc.createElement("div");original.className="append-source";
      original.textContent=row.text||"";
      const translated=this.doc.createElement("div");translated.className="append-translation";
      translated.textContent=row.displayText||("Original saved · "+(row.queueStatus||"untranslated"));
      block.append(original,translated);feed.append(block);
    }
    if(this.mode==="append")this.scrollTail(feed);
    const ticker=this.el("liveTicker");
    const text=translations.at(-1)?.displayText||this.lastTranslation||"Translation appears here";
    ticker.textContent=text;
    ticker.style.setProperty("--ticker-seconds",Math.min(24,Math.max(9,Math.ceil(Array.from(text).length/6)))+"s");
  }
  reset(){
    this.history=[];this.latencies=[];this.lastTranslation="";this.lastSource="";
    this.el("liveAccessible").textContent="";
    this.original("Tap Start recording, or type a phrase.");
    this.target("Translation appears here");
    this.el("liveLabel").textContent="LIVE SOURCE · READY";
    this.el("livePhase").textContent="Ready";
    this.el("liveNotice").textContent="The complete source stays in your log; this viewer only follows its focused section.";
    for(const id of ["liveSttMs","liveQueueMs","liveApiMs","liveTotalMs"])this.el(id).textContent="—";
    this.el("liveTotalLabel").textContent="Final → subtitle";
    this.el("livePercentile").textContent="p50/p90: —";
    this.drawHistory();this.updateFocusLabel();
  }
}
