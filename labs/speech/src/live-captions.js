/**
 * Live caption primitives. No DOM or browser globals required.
 * SpeechRecognition interim text is volatile and must not be saved as final.
 */
/** Split an already finalized transcript into compact caption lines.
 * This is NOT an audio segmenter and cannot force an STT engine to finalize earlier.
 */
export function splitCaptionLines(text, mode="sentence") {
  const phrase=(text||"").trim().replace(/\s+/gu," ");
  if(!phrase)return [];
  if(mode==="sentence")return [phrase];
  const maximum=mode==="short" ? 4 : 9;
  const words=phrase.split(" ");
  const output=[];
  let current=[];
  for(const word of words){
    current.push(word);
    if(current.length >= maximum || /[.!?。؟;؛]$/u.test(word)){
      output.push(current.join(" "));
      current=[];
    }
  }
  if(current.length)output.push(current.join(" "));
  return output;
}
export function timeStats(values) {
  const filtered=values.filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
  if(!filtered.length)return {count:0,last:null,p50:null,p90:null};
  const percentile=(p)=>filtered[Math.max(0,Math.ceil(p*filtered.length)-1)];
  return {count:filtered.length,last:values.filter(n=>Number.isFinite(n)&&n>=0).at(-1),p50:percentile(.5),p90:percentile(.9)};
}
export function formatLatency(ms) {
  return Number.isFinite(ms) && ms>=0 ? Math.round(ms)+" ms" : "—";
}
export const CAPTION_MODES=["bottom","roll","ticker"];
export function validCaptionMode(mode) {
  return CAPTION_MODES.includes(mode) ? mode : "bottom";
}
