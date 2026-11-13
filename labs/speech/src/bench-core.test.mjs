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

const unending=new Promise(()=>{});
queue.start();
queue.enqueue({id:4,text:"hung",source:"he",target:"en"},[{id:"never",run:()=>unending}]);
await Promise.resolve();
queue.stop();
queue.start();
queue.enqueue({id:5,text:"next",source:"he",target:"en"},[
  {id:"ok",run:async()=>"Works after immediate cancel"}
]);
await new Promise(done=>setTimeout(done,0));
assert.ok(events.some(e=>e[0]===5&&e[2]==="success"&&e[3]==="Works after immediate cancel"));
console.log("unabortable job cannot block next session");


// Live priority must drop *queued translations* but retain their transcript rows.
const realtimeEvents=[];
let releaseActive;
const active=new Promise(resolve=>{releaseActive=resolve;});
const live=new TranslationQueue({
  onChange:(row,id,patch)=>realtimeEvents.push([row?.id,id,patch.status,patch.text])
});
live.enqueue({id:10,text:"original",source:"en",target:"he"},[{id:"cloud",run:()=>active}]);
live.enqueueRealtime({id:11,text:"older",source:"en",target:"he"},[{id:"cloud",run:async()=>"skip me"}],2);
live.enqueueRealtime({id:12,text:"next",source:"en",target:"he"},[{id:"cloud",run:async()=>"keep 12"}],2);
live.enqueueRealtime({id:13,text:"latest",source:"en",target:"he"},[{id:"cloud",run:async()=>"keep 13"}],2);
assert.ok(realtimeEvents.some(e=>e[0]===11&&e[1]==="queue"&&e[2]==="skipped"));
assert.ok(!realtimeEvents.some(e=>e[0]===11&&e[2]==="success"));
releaseActive("active done");
await new Promise(resolve=>setTimeout(resolve,0));
assert.ok(realtimeEvents.some(e=>e[0]===12&&e[2]==="success"));
assert.ok(realtimeEvents.some(e=>e[0]===13&&e[2]==="success"));
console.log("Live queue catch-up: older queued translation skipped and newer rows preserved.");

assert.equal(safeLibreEndpoint("http://127.0.0.1:8765"),"http://127.0.0.1:8765/translate");
assert.equal(safeLibreEndpoint("http://localhost:8765"),"http://localhost:8765/translate");
assert.throws(()=>safeLibreEndpoint("http://localhost.evil.com:8765"),/HTTPS/);
assert.throws(()=>safeLibreEndpoint("http://192.168.1.10:5000"),/HTTPS/);
assert.throws(()=>safeLibreEndpoint("https://user:pass@example.com/"),/HTTPS/);
console.log("Loopback-only HTTP allowed without weakening remote HTTPS requirement.");
