import assert from "node:assert/strict";
import {SpeechFinalGuard} from "./speech-final-guard.js";
const g=new SpeechFinalGuard();
const m={source:"he",target:"en"};
assert.equal(g.accept("זו בדיקה עם ארבע מילים",{...m,at:1000}).action,"accept");
assert.equal(g.accept("זו בדיקה עם ארבע מילים",{...m,at:1700}).action,"duplicate-exact");
assert.equal(g.suppressed,1);
assert.equal(g.accept("זו בדיקה עם ארבע מילים",{...m,at:8500}).action,"accept",
  "genuine later repetition is not suppressed");
g.clear();
g.accept("one two three four five",{source:"en",target:"he",at:1000});
const overlap=g.accept("one two three four five six seven",{source:"en",target:"he",at:1700,restarted:true});
assert.equal(overlap.text,"six seven");
assert.equal(overlap.action,"overlap-trimmed");
assert.equal(g.accept("yes",{source:"en",target:"he",at:1900}).text,"yes");
assert.equal(g.accept("yes",{source:"en",target:"he",at:2100}).text,"yes",
  "short deliberate repetition remains intact");
assert.equal(g.accept("yes",{source:"en",target:"fr",at:2200}).text,"yes",
  "language change never suppresses");
console.log("SpeechFinalGuard: exact copies, cumulative overlap, genuine repetition and language isolation passed");
