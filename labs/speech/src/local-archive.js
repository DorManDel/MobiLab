/**
 * Optional local archive of the canonical text log.
 * No remote sync and no microphone audio. IndexedDB; only enabled by user.
 */
export class LocalTranscriptArchive {
  constructor({name="mobilab-speech-v1"}={}){this.name=name;}
  async db() {
    if(!("indexedDB" in globalThis))throw new Error("Local browser storage is unavailable.");
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(this.name,1);
      request.onupgradeneeded=()=>request.result.createObjectStore("transcripts");
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("IndexedDB could not open"));
    });
  }
  async transaction(mode,perform) {
    const db=await this.db();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction("transcripts",mode);
        const request=perform(tx.objectStore("transcripts"));
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||new Error("IndexedDB transaction failed"));
        tx.onabort=()=>reject(tx.error||new Error("IndexedDB aborted"));
      });
    } finally {db.close();}
  }
  save(entries){return this.transaction("readwrite",store=>store.put({
    version:1,savedAt:new Date().toISOString(),entries
  },"current"));}
  async load(){
    const item=await this.transaction("readonly",store=>store.get("current"));
    return item?.version===1&&Array.isArray(item.entries)?item:null;
  }
  clear(){return this.transaction("readwrite",store=>store.delete("current"));}
}
