import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVITY_KEY, PREFS_KEY, filterAndSort, loadActivity, recordVisit,
  loadPreferences, savePreferences, normalizeSearch
} from "../src/lab-catalog.mjs";

function memoryStore() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value)
  };
}
const labs = [
  { id: "haptics", title: "Haptic Studio", category: "hardware", description: "Create vibration rhythms", keywords: "feedback", updated: "2026-11-10" },
  { id: "speech", title: "Speech & Translate", category: "tools", description: "Live dictation and subtitles", keywords: "Whisper TTS", updated: "2026-11-13" },
  { id: "infinity", title: "Infinity Board", category: "ideas", description: "Infinite spatial workspace", keywords: "architecture zoom map", updated: "2026-11-13" }
];
const order = items => items.map(item => item.id);

test("query is case and whitespace tolerant and matches keywords", () => {
  assert.equal(normalizeSearch("  SPEECH   Live  "), "speech live");
  assert.deepEqual(order(filterAndSort(labs, { query: "whisper" })), ["speech"]);
  assert.deepEqual(order(filterAndSort(labs, { query: "infinity architecture" })), ["infinity"]);
  assert.deepEqual(order(filterAndSort(labs, { query: "not-there" })), []);
});

test("category restricts visible modules", () => {
  assert.deepEqual(order(filterAndSort(labs, { category: "hardware" })), ["haptics"]);
});

test("visit counts and last opened are browser local", () => {
  const store = memoryStore();
  recordVisit(store, "speech", 100);
  recordVisit(store, "speech", 200);
  recordVisit(store, "haptics", 300);
  assert.deepEqual(loadActivity(store).speech, { visits: 2, lastOpened: 200 });
  assert.equal(loadActivity(store).haptics.visits, 1);
  assert.deepEqual(order(filterAndSort(labs, { sort: "popular", activity: loadActivity(store) })), ["speech", "haptics", "infinity"]);
  assert.deepEqual(order(filterAndSort(labs, { sort: "recently-opened", activity: loadActivity(store) })), ["haptics", "speech", "infinity"]);
});

test("recently updated uses version-controlled metadata, never browsing timestamps", () => {
  assert.deepEqual(order(filterAndSort(labs, { sort: "recently-updated" })), ["speech", "infinity", "haptics"]);
  const unknown = [...labs, { id: "unknown", title: "Unknown", category: "tools", updated: "" }];
  assert.equal(filterAndSort(unknown, { sort: "recently-updated" }).at(-1).id, "unknown");
});

test("recommended ranks visited modules without losing default order on a fresh device", () => {
  assert.deepEqual(order(filterAndSort(labs, {})), ["haptics", "speech", "infinity"]);
  assert.equal(filterAndSort(labs, { activity: { infinity: { visits: 8, lastOpened: 100 } }, now: 100 })[0].id, "infinity");
  assert.deepEqual(order(filterAndSort(labs, { sort: "alphabetical" })), ["haptics", "infinity", "speech"]);
});

test("corrupt or blocked browser storage never breaks discovery", () => {
  const store = memoryStore();
  store.setItem(ACTIVITY_KEY, "{broken");
  store.setItem(PREFS_KEY, "{broken");
  assert.deepEqual(loadActivity(store), {});
  assert.deepEqual(loadPreferences(store), { sort: "recommended", category: "all" });
  savePreferences(store, { sort: "popular", category: "tools" });
  assert.deepEqual(loadPreferences(store), { sort: "popular", category: "tools" });
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.deepEqual(loadActivity(blocked), {});
  assert.equal(recordVisit(blocked, "haptics", 100).haptics.visits, 1);
});

test("MobiLab HTML has unique ids and one catalog entry per module", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const entryIds = [...html.matchAll(/<(?:a|button)\b[^>]*class="lab-card[^"]*"[^>]*data-lab-id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(entryIds.length, 11);
  assert.equal(new Set(entryIds).size, entryIds.length);
  for (const id of ["labSearch", "labSort", "labCategory", "labCards", "catalogEmpty", "infinity"]) {
    assert.ok(ids.includes(id), "Missing " + id);
  }
  assert.match(html, /UNDER CONSTRUCTION/);
  assert.match(html, /data-panel="infinity"/);
});
