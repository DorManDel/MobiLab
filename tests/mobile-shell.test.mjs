import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = name => readFileSync(new URL("../" + name, import.meta.url), "utf8");
const html = read("index.html");
const css = read("styles.css");
const app = read("src/app.js");

test("mobile dock exposes four reachable destinations without removing desktop tabs", () => {
  assert.match(html, /<nav class="mobile-bottom-nav" aria-label="Quick mobile navigation">/);
  for (const id of ["mobileHome", "mobileExplore", "mobileRecent"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
    assert.match(app, new RegExp('\\$\\("' + id + '"\\)'));
  }
  assert.match(html, /data-lab-id="settings" href="\.\/labs\/settings\/"/);
  assert.match(html, /class="tabs" aria-label="Experiment tabs"/);
});

test("mobile compact mode has an explicit saved preference and accessible toggle", () => {
  assert.match(html, /id="densityToggle"[^>]*aria-pressed=/);
  assert.match(app, /mobilab\.catalog\.density\.v1/);
  assert.match(app, /is-compact/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /\.lab-cards\.is-compact/);
  assert.match(css, /env\(safe-area-inset-bottom/);
});

test("no settings route is mistaken for a functional portfolio integration", () => {
  const settings = read("labs/settings/index.html");
  assert.match(settings, /No changes are pushed to MyPortfolio/);
  assert.match(settings, /id="workspace"/);
  assert.match(settings, /id="presets"/);
  assert.match(settings, /data-layout="custom"/);
});
