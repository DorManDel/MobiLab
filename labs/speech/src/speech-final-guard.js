/**
 * Conservative protection for browser recognizer cumulative/restart finals.
 * Only clear recopy evidence is removed. Repeated speech must be preserved.
 */
const words=s=>String(s||"").trim().replace(/\s+/gu," ").split(" ").filter(Boolean);
const norm=s=>String(s||"").normalize("NFC").toLocaleLowerCase().replace(/[.!?,;:؟،]+$/gu,"").trim();
export class SpeechFinalGuard {
  constructor(){this.last=null;this.suppressed=0;this.trimmed=0;}
  clear(){this.last=null;this.suppressed=0;this.trimmed=0;}
  accept(text,{at=Date.now(),source="",target="",restarted=false}={}){
    const incoming=String(text||"").trim().replace(/\s+/gu," ");
    if(!incoming)return {text:"",action:"empty"};
    const prev=this.last;
    const after={text:incoming,at,source,target};
    this.last=after;
    if(!prev || prev.source!==source || prev.target!==target ||
       at-prev.at>4200 || at<prev.at) return {text:incoming,action:"accept"};
    const a=words(prev.text),b=words(incoming),delta=at-prev.at;
    // An exact 1-2 word repetition may be intentional (e.g. "yes yes").
    if(a.length>=3 && delta<2200 && norm(prev.text)===norm(incoming)){
      this.suppressed++;
      this.last=prev; // preserve first valid final as dedupe reference
      return {text:"",action:"duplicate-exact"};
    }
    let overlap=0;
    const allowed=restarted || (delta<2200 && b.length>=a.length+3);
    if(allowed){
      for(let n=Math.min(a.length,b.length);n>=5;n--){
        if(norm(a.slice(-n).join(" "))===norm(b.slice(0,n).join(" "))){
          overlap=n;break;
        }
      }
    }
    if(overlap && overlap<b.length){
      this.trimmed++;
      const novel=b.slice(overlap).join(" ");
      this.last={...after,text:novel};
      return {text:novel,action:"overlap-trimmed",overlap};
    }
    if(overlap && overlap===b.length && delta<2200){
      this.suppressed++;
      this.last=prev;
      return {text:"",action:"duplicate-overlap"};
    }
    return {text:incoming,action:"accept"};
  }
}
