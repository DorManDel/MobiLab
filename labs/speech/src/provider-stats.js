import {characterSimilarity} from "./bench-core.js";
import {timeStats} from "./live-captions.js";

/**
 * Providers are compared only when they processed the same source entry.
 * Reference similarity is labelled as lexical similarity, NOT "accuracy".
 */
export function summarizeProviders(entries,ids=["cloud","local","libre"]) {
  return ids.map(id=>{
    const results=entries.map(row=>({row,result:row.results?.[id]})).filter(x=>x.result);
    const successes=results.filter(x=>x.result.status==="success"&&x.result.text);
    const errors=results.filter(x=>x.result.status==="error").length;
    const canceled=results.filter(x=>["canceled","skipped"].includes(x.result.status)).length;
    const times=timeStats(successes.map(x=>x.result.ms));
    const quality=successes
      .filter(x=>String(x.row.translationReference||"").trim())
      .map(x=>characterSimilarity(x.row.translationReference,x.result.text))
      .filter(Number.isFinite);
    const similarity=quality.length?quality.reduce((a,b)=>a+b,0)/quality.length:null;
    return {id,success:successes.length,errors,canceled,p50:times.p50,p90:times.p90,
      referenceCount:quality.length,similarity};
  });
}
