import assert from "node:assert/strict";
import {
  TestSessionRecorder,percentile,segmentsCsv,eventsCsv,toCsv,makeBundleZip
} from "./test-session-v08.js";

const ledger={entries:[{id:1,text:"old sample",displayText:"old",results:{},
  queueStatus:"completed"}]};
let stamp=1763440000000,clock=0;
const rec=new TestSessionRecorder({
  ledger,now:()=>stamp,clock:()=>clock,timeoutMs:250
});
const id=rec.begin({
  scenario:"live",label:"VU disabled baseline",
  metadata:{provider:"cloud",chunkMode:"immediate"},
  environment:{browser:"Samsung Internet",viewportWidth:390}
});
assert.ok(id.length>=8);
clock+=90;rec.onEvent({type:"mic-start"});
clock+=120;rec.onEvent({type:"interim-first"});
clock+=310;rec.onEvent({type:"speech-final",rowId:2});
clock+=20;rec.onEvent({type:"duplicate-suppressed",rowId:2});
ledger.entries.push({
  id:2,offset:530,text:"Hello world, check!",source:"en",target:"he",
  fromSpeech:true,sttMs:420,queueWaitMs:55,finalToSubtitleMs:630,
  queueStatus:"completed",captionProvider:"cloud",displayProvider:"cloud",
  displayText:"שלום, עולם!",fallbackUsed:false,
  results:{cloud:{status:"success",ms:340,text:"שלום, עולם!"}}
});
rec.onEvent({type:"provider-success",rowId:2});
clock+=40;rec.requestStop();
rec.seal(rec.finishReason);
const without=rec.bundle();
assert.equal(without.schema,"voicebridge.test.bundle.v1");
assert.equal(without.run.id,id);
assert.equal(without.summary.capturedSegments,1,"baseline row must not be included");
assert.equal(without.summary.duplicatedFinalsSuppressed,1);
assert.equal(without.summary.translatedSegments,1);
assert.equal(without.summary.stt.p50Ms,420);
assert.equal(without.summary.finalToCaption.p90Ms,630);
assert.equal(without.summary.providerPerformance.cloud.success,1);
assert.equal(without.summary.firstInterimMs,120);
assert.equal(without.segments[0].original,undefined,
  "spoken words must be redacted by default");
assert.equal(without.segments[0].providers[0].durationMs,340);
assert.equal(without.run.privacy.includesRawAudio,false);
assert.equal(without.run.privacy.includesProviderCredentials,false);
const withText=rec.bundle({includeText:true});
assert.equal(withText.segments[0].original,"Hello world, check!");
assert.equal(withText.segments[0].translation,"שלום, עולם!");
assert.equal(withText.run.privacy.includesTranscript,true);
assert.match(segmentsCsv(withText),/Hello world, check!/);
assert.match(segmentsCsv(withText),/שלום, עולם!/);
assert.equal(percentile([],0.9),null);
assert.equal(percentile([10,20,30,50],.9),50);
const csv=segmentsCsv(without);
assert.match(csv,/cloud,success,340,/);
assert.doesNotMatch(csv,/Hello world/);
assert.match(eventsCsv(without),/speech-final/);
assert.equal(toCsv([{a:'hello,"a"\nworld'}],["a"]).trim(),
  'a\r\n"hello,""a""\nworld"');
const zip=makeBundleZip(without);
assert.equal(zip.type,"application/zip");
const payload=new Uint8Array(await zip.arrayBuffer()),view=new DataView(payload.buffer);
let offset=0,contents={};
while(view.getUint32(offset,true)===0x04034b50){
  const len=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
  const size=view.getUint32(offset+18,true);
  const decoder=new TextDecoder();
  const name=decoder.decode(payload.slice(offset+30,offset+30+len));
  const begin=offset+30+len+extra;
  contents[name]=decoder.decode(payload.slice(begin,begin+size));
  offset=begin+size;
}
assert.ok(view.getUint32(offset,true)===0x02014b50,"ZIP central directory must follow entries");
assert.deepEqual(Object.keys(contents),["summary.json","segments.csv","events.csv"]);
assert.equal(JSON.parse(contents["summary.json"]).run.id,id);
assert.doesNotMatch(contents["segments.csv"],/Hello world/);
assert.equal(without.run.finishReason,"user_finished");

// A zero-output recording must be visible as zero, not fake accuracy.
clock+=500;rec.begin({scenario:"stt-only"});
rec.seal("microphone_unavailable");
const empty=rec.bundle();
assert.equal(empty.summary.capturedSegments,0);
assert.equal(empty.summary.completionPercent,null);
assert.equal(empty.run.finishReason,"microphone_unavailable");

// Sanitized provider failures never leak URLs/tokens.
rec.begin({scenario:"compare"});
ledger.entries.push({
  id:3,text:"secret phrase",source:"he",target:"en",queueStatus:"completed",
  results:{libre:{status:"error",error:"https://private-key-token.example/translate?token=123"}}
});
rec.seal("completed");
const err=rec.bundle();
assert.equal(err.segments[0].providers[0].errorCategory,"provider_error");
assert.doesNotMatch(JSON.stringify(err),/private-key-token|secret phrase/);
console.log("TestSessionRecorder: run isolation, metrics, privacy, ZIP and CSV passed.");
