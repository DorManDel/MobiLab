import assert from "node:assert/strict";
import {StableInterimPlanner,stablePrefix} from "./stable-interim.mjs";
assert.equal(stablePrefix("אני רוצה לבדוק", "אני רוצה לבדוק את"),null);
assert.deepEqual(stablePrefix(
  "אני רוצה לבדוק את איכות התמלול שלנו",
  "אני רוצה לבדוק את איכות התמלול שלנו עכשיו"
),{text:"אני רוצה לבדוק את איכות התמלול",wordCount:6,commonWords:7});
assert.equal(stablePrefix("אני לא רוצה לעצור עכשיו את", "אני כן רוצה לעצור עכשיו את"),null,
  "negation correction must not be treated as stable prefix");
const p=new StableInterimPlanner();
assert.equal(p.observe("אני רוצה לבדוק את איכות התמלול שלנו",1000),null);
const first=p.observe("אני רוצה לבדוק את איכות התמלול שלנו בזמן אמת",1200);
assert.equal(first.wordCount,6);
assert.equal(p.sent,1);
assert.equal(p.observe("אני רוצה לבדוק את איכות התמלול שלנו בזמן אמת",1220),null);
assert.equal(p.observe("אני רוצה לבדוק את איכות התמלול שלנו בזמן אמת בכל מקום שאני",2000),null);
const second=p.observe("אני רוצה לבדוק את איכות התמלול שלנו בזמן אמת בכל מקום שאני יכול לגשת אליו",2800);
assert.ok(second.wordCount>=10);
assert.equal(p.sent,2);
assert.equal(p.observe("אני רוצה לבדוק את איכות התמלול שלנו בזמן אמת בכל מקום שאני יכול לגשת אליו מכל מקום",5400),null,
  "draft request budget is capped");
p.reset();
assert.equal(p.sent,0);
console.log("PASS: stable prefix, changed negation, growth, cooldown, per-utterance budget/reset");
