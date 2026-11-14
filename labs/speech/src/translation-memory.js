/**
 * Bounded in-memory translation cache. Only successful finalized translations
 * are cached; never cache transient STT hypotheses, errors or private API keys.
 * Cache is per tab, not persisted or shared across users/providers.
 */
export class TranslationMemory {
  constructor({limit=400, ttlMs=24*60*60*1000, now=()=>Date.now()}={}) {
    this.limit=Math.max(1,Math.floor(limit));
    this.ttlMs=Math.max(1,ttlMs);
    this.now=now;
    this.entries=new Map();
    this.hits=0;
    this.misses=0;
  }
  has(key) {
    const row=this.entries.get(key);
    if(!row)return false;
    if(this.now()-row.at>=this.ttlMs){this.entries.delete(key);return false;}
    return true;
  }
  get(key) {
    if(!this.has(key)){this.misses++;return undefined;}
    const row=this.entries.get(key);
    this.entries.delete(key);
    this.entries.set(key,row);
    this.hits++;
    return row.text;
  }
  set(key,text) {
    if(typeof text!=="string" || !text.trim())return;
    this.entries.delete(key);
    this.entries.set(key,{text,at:this.now()});
    while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value);
  }
  clear() {this.entries.clear();this.hits=0;this.misses=0;}
  get stats(){return {hits:this.hits,misses:this.misses,stored:this.entries.size};}
}
/**
 * Exact sentence-level matching preserves context. Do not use word-level cache
 * replacement: a word's translation can depend on neighboring words.
 */
export function translationKey(provider,source,target,text){
  const normalized=String(text||"").normalize("NFC").replace(/\s+/gu," ").trim();
  return JSON.stringify([provider,source,target,normalized]);
}
