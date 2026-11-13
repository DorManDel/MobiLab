import assert from "node:assert/strict";
import {splitCaptionLines,timeStats,formatLatency,validCaptionMode} from "./live-captions.js";
assert.deepEqual(splitCaptionLines(" hello   world. ","sentence"),["hello world."]);
assert.deepEqual(splitCaptionLines("one two three four five six seven eight nine ten","line"),
  ["one two three four five six seven eight nine","ten"]);
assert.deepEqual(splitCaptionLines("אחת שתיים שלוש ארבע חמש שש","short"),
  ["אחת שתיים שלוש ארבע","חמש שש"]);
assert.deepEqual(splitCaptionLines("Hi there. Now translate the next sentence!","line"),
  ["Hi there.","Now translate the next sentence!"]);
assert.deepEqual(splitCaptionLines("","short"),[]);
assert.deepEqual(timeStats([]),{count:0,last:null,p50:null,p90:null});
assert.deepEqual(timeStats([100,300,200,900,400]),{count:5,last:400,p50:300,p90:900});
assert.equal(formatLatency(null),"—");
assert.equal(formatLatency(125.9),"126 ms");
assert.equal(validCaptionMode("bad"),"bottom");
assert.equal(validCaptionMode("roll"),"roll");
assert.equal(validCaptionMode("append"),"append");
console.log("Live subtitle chunking, modes and measured percentiles verified.");
