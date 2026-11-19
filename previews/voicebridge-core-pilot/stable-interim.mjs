/**
 * Conservative incremental subtitle planner.
 * Translates only words that have already been recognized in *two* successive
 * interim hypotheses. Does NOT invent/predict unheard words.
 *
 * At most maxDrafts remote draft translations per utterance + one final.
 * The trailing hypothesis word is held back because it frequently changes.
 */
const split=s=>String(s||"").trim().replace(/\s+/gu," ").split(" ").filter(Boolean);
const normalize=s=>s.normalize("NFC").toLocaleLowerCase().replace(/[.,!?;:؟،]+$/gu,"");
export function stablePrefix(previous,current,{holdTail=1,minWords=4}={}){
  const old=split(previous),now=split(current);let common=0;
  while(common<Math.min(old.length,now.length)&&normalize(old[common])===normalize(now[common]))common++;
  const usable=Math.max(0,common-holdTail);
  if(usable<minWords)return null;
  return {text:now.slice(0,usable).join(" "),wordCount:usable,commonWords:common};
}
export class StableInterimPlanner {
  constructor({maxDrafts=2,minWords=4,minGrowth=4,holdTail=1,cooldownMs=1300}={}){
    this.rules={maxDrafts,minWords,minGrowth,holdTail,cooldownMs};
    this.reset();
  }
  reset(){
    this.previous="";this.lastSent="";this.lastSentWords=0;
    this.lastSentAt=-Infinity;this.sent=0;this.interimCount=0;
    this.lastText="";this.uniqueUpdates=0;
  }
  observe(raw,at){
    const current=String(raw||"").trim().replace(/\s+/gu," ");
    if(!current)return null;
    this.interimCount++;
    if(this.lastText!==current){this.uniqueUpdates++;this.lastText=current;}
    const prev=this.previous;this.previous=current;
    if(!prev||this.sent>=this.rules.maxDrafts)return null;
    const proposal=stablePrefix(prev,current,this.rules);
    if(!proposal)return null;
    if(proposal.wordCount<this.lastSentWords+this.rules.minGrowth)return null;
    if(at-this.lastSentAt<this.rules.cooldownMs)return null;
    if(proposal.text===this.lastSent)return null;
    this.lastSent=proposal.text;
    this.lastSentWords=proposal.wordCount;
    this.lastSentAt=at;this.sent++;
    return proposal;
  }
}
