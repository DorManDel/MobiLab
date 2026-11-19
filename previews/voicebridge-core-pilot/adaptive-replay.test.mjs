import assert from "node:assert/strict";
import {AdaptiveInterimPlanner,createPlanner,replayTrace,replaySummary} from "./adaptive-replay.mjs";
const samples=[
{tMs:400,text:"אני רוצה לבדוק את"},
{tMs:650,text:"אני רוצה לבדוק את המנוע"},
{tMs:900,text:"אני רוצה לבדוק את המנוע שלנו"},
{tMs:1170,text:"אני רוצה לבדוק את המנוע שלנו בזמן"},
{tMs:1460,text:"אני רוצה לבדוק את המנוע שלנו בזמן אמת"},
{tMs:1700,text:"אני רוצה לבדוק את המנוע שלנו בזמן אמת עכשיו"}
];
const final="אני רוצה לבדוק את המנוע שלנו בזמן אמת עכשיו";
const report=replayTrace(samples,final,{maxDrafts:2});
assert.deepEqual(report.map(x=>x.mode),["incremental","fast","adaptive","final-only"]);
assert.equal(report.at(-1).candidateCount,0);
assert.ok(report[1].firstEligibleMs<=report[0].firstEligibleMs);
assert.ok(report[2].firstEligibleMs!==null);
assert.ok(report.every(x=>x.candidateCount<=2));
assert.ok(report.flatMap(x=>x.proposals).every(x=>x.matchesFinalPrefix!==false));
const summaries=replaySummary(samples,final,{maxDrafts:2});
assert.equal(summaries[0].proposals,undefined);
assert.equal(summaries.length,4);
// Revisions to a Hebrew negation should not be treated as stable.
const a=new AdaptiveInterimPlanner();
a.observe("אני לא רוצה לעצור את השיחה",100);
const unstable=a.observe("אני כן רוצה לעצור את השיחה",250);
assert.equal(unstable,null);
assert.equal(createPlanner("final-only",2),null);
assert.equal(createPlanner("fast",2).rules.maxDrafts,1);
assert.equal(replayTrace([],final)[0].firstEligibleMs,null);
console.log("PASS adaptive replay: observed prefixes only, 4 modes, bounded budget, no API.");
