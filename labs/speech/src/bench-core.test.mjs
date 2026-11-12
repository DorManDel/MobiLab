import assert from "node:assert/strict";
import { TranslationQueue, wordErrorRate, characterSimilarity, safeLibreEndpoint } from "./bench-core.js";

assert.equal(wordErrorRate("hello world", "hello world"), 0);
assert.equal(wordErrorRate("hello bright world", "hello world"), 1/3);
assert.equal(wordErrorRate("", "hello"), null);
assert.equal(characterSimilarity("שלום עולם", "שלום עולם"), 1);
assert.ok(characterSimilarity("hello friend", "hello there") < 1);
assert.equal(characterSimilarity("","x"),null);
assert.equal(safeLibreEndpoint("https://translate.example.org/"),"https://translate.example.org/translate");
assert.throws(()=>safeLibreEndpoint("http://translate.example.org"),/HTTPS/);

const events = [];
const queue = new TranslationQueue({
  onChange: (row,id,patch)=>events.push([row?.id,id,patch.status,patch.text])
});
let resolve;
const hanging = new Promise(done => { resolve = done; });
queue.enqueue({id:1,text:"x",source:"he",target:"en"},[
  {id:"slow",run:()=>hanging}
]);
queue.enqueue({id:2,text:"y",source:"he",target:"en"},[
  {id:"slow",run:async()=>"not reached"}
]);
await Promise.resolve();
queue.stop();
resolve("stale");
await new Promise(done => setTimeout(done,0));
assert.ok(events.some(e=>e[0]===1&&e[2]==="canceled"));
assert.ok(events.some(e=>e[0]===2&&e[2]==="canceled"));
assert.ok(!events.some(e=>e[2]==="success"));
queue.start();
queue.enqueue({id:3,text:"z",source:"en",target:"he"},[
  {id:"a",run:async()=>"ABC"},{id:"b",run:async()=>"DEF"}
]);
await new Promise(done=>setTimeout(done,0));
assert.deepEqual(events.filter(e=>e[0]===3&&e[2]==="success").map(e=>e[3]).sort(),["ABC","DEF"]);
console.log("bench core: WER, character similarity, endpoint validation, canceled queue and parallel providers passed");
