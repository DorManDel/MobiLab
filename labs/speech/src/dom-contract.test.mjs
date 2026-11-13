import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("./app.js",import.meta.url),"utf8");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(ids).size,ids.length,"HTML must not duplicate IDs");
const required=[...new Set([...app.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]))];
const missing=required.filter(id=>!ids.includes(id));
assert.deepEqual(missing,[],"All app.js control IDs must be present in HTML");
assert.match(html,/src="\.\/src\/app\.js"/,"HTML must load the mobile app module");
assert.ok(!html.includes('id="startMic"'),"Legacy two-button mic controls must be gone");
assert.ok(html.includes('id="recordToggle"'),"Single accessible mic toggle must exist");
for(const id of ["liveDeck","livePartial","liveTranslation","chunkMode","earlyPreview","liveApiMs","liveSttMs","liveTotalMs"]){
 assert.ok(ids.includes(id),"Missing live mode element: "+id);
}
assert.ok(html.indexOf('id="recordDock"')<html.indexOf('id="controlTitle"'),
  "Mic button must appear before advanced controls.");
assert.ok(html.includes('src/live-captions.css'),"Live deck CSS must load.");
for(const id of ["liveSourceWindow","liveTranslationWindow","focusPrev","focusNext","focusLive",
 "providerBanner","providerSetup","retryCloud","providerScoreRows","saveLocal","archiveStatus",
 "exportJson","showMoreRows","clearLocal","libreKey"]){
 assert.ok(ids.includes(id),"Missing v0.5 log/view/provider element "+id);
}
for(const id of ["silenceDuration","captionLines","captionProvider","liveAppend","floatingControls"]){
  assert.ok(ids.includes(id),"Missing paragraph/floating control: "+id);
}
console.log("HTML DOM contract passed ("+ids.length+" IDs, "+required.length+" JS bindings).");
