import assert from "node:assert/strict";
import {summarizeProviders} from "./provider-stats.js";
const entries=[
 {translationReference:"hello",results:{cloud:{status:"success",text:"hello",ms:100},local:{status:"success",text:"hallo",ms:40}}},
 {translationReference:"world",results:{cloud:{status:"error",error:"429"},local:{status:"success",text:"world",ms:60}}},
 {results:{cloud:{status:"canceled"},local:{status:"success",text:"abc",ms:80}}}
];
const [cloud,local,libre]=summarizeProviders(entries);
assert.equal(cloud.success,1);assert.equal(cloud.errors,1);assert.equal(cloud.canceled,1);
assert.equal(cloud.p50,100);assert.equal(cloud.referenceCount,1);assert.equal(cloud.similarity,1);
assert.equal(local.success,3);assert.equal(local.p50,60);assert.equal(local.referenceCount,2);
assert.ok(local.similarity<1);
assert.equal(libre.success,0);assert.equal(libre.similarity,null);
console.log("Provider metrics use completed requests and human references only.");
