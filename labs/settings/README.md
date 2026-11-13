# MobiLab — Settings Layout Lab V4 (review preview)

## Purpose
Preserve MyPortfolio's existing settings/handlers while researching a reusable dock/layout controller, usable in other apps. This folder is isolated from MobiLab's existing core tabs and hardware labs.

## What currently works
- Five dock presets: Corner (four positions), Top, Side, Bottom, Custom Floating.
- `Layout & Position` launcher in the page toolbar and dock title; mobile Samsung Edge-inspired side handle (left/right configurable); optional outside-tap dismissal when not pinned.
- Custom Floating: pointer drag title, diagonal resize handle, lock, center, name/save/select up to twelve Custom geometry presets; local persistence scoped to this browser.
- Opacity, public Visitor Accessibility vs Developer groups, dynamic module registry, no-scroll grid tabs, three controls/page with previous/next, search, JSON export, reset values/layout.
- Mock/preview sections for Ripple, Prism, Carousel and Diagnostics. These effects are **CSS placeholders**, not production shader/audio/physics.
- `Original MyPortfolio` source bridge: optional pinned public GitHub download or local **trusted** `index.html`; runs in a sandboxed iframe without `allow-same-origin`. The inserted bridge changes CSS of the *real* `#settings-panel` in place, sends an inventory via `postMessage`, and can re-dock it. It does not clone the controls. **Some inline/linked scripts can fail in this restricted origin**, so correct visual control extraction does **not** certify that all settings handlers work.

## Pinned actual settings inventory
`myportfolio-settings-inventory.json` was extracted from the **real** MyPortfolio `develop` `index.html` at `e13f57e`: 16 static settings groups, 72 input/select/button/textarea controls within the panel (69 located inside group details). The original Ratchet V3 script can create more controls at runtime, so this manifest is not the dynamic final DOM. Click **View extracted 16 groups** on a hosted version to see this audit. Actual event listeners remain in the original site source; this manifest is only a reference, not rewritten handlers.\n\n## Architecture/API
`engine.js` exports `SettingsRegistry`, `SettingsStore`, module schemas and layout names. `settings.js` implements the UI/gesture/controller lifecycle and attaches a demo-only `window.MobiSettingsLab` API. Add a new module in the lab console:

```js
window.MobiSettingsLab.registerModule({
  id: 'example', title: 'Example FX', icon: '✦',
  fields: [{id:'intensity',title:'Intensity',type:'range',min:0,max:100,default:50,unit:'%'}]
});
window.MobiSettingsLab.listModules();
window.MobiSettingsLab.unregisterModule('example');
```

Runtime-registered user modules need to be registered again at app startup; arbitrary untrusted JS/schema is **not persisted**. The built-in optional Confetti example can persist its enabled registration. Layout and values are stored in localStorage under `mobilab.settings-lab.v1`; exports do not publish to GitHub. Avoid storing secrets or large assets.

## Run/test
Use GitHub Pages from an approved feature branch preview environment, or serve the repository via an HTTP server. For offline phones a separate generated `settings-lab-v4-standalone.html` in the shared ZIP embeds CSS/JS and can open directly.

Automated smoke: Node `--check` on both JS modules and Chromium `page.set_content()` with the offline inline version at `390×844`, `832×384`, `768×1024`, `1440×900`: all five modes, saved Custom names, lock, Visitor-only, dynamic module, search, reset, no root overflow or page errors. Synthetic owned HTML source with one `#settings-panel` and one settings group also successfully loaded through sandbox + `postMessage`. **Tests have not run on a real Galaxy nor with the actual giant MyPortfolio index.html.**

## Publishing workflow
The Settings Dock standalone lab is being released into MobiLab through a separate mobile-navigation PR. This publishes an **isolated lab only**, not the MyPortfolio settings integration. The original `feature/settings-dock-lab-v4` PR remains historical evidence; review real Galaxy behavior before adopting the engine in MyPortfolio. Keep the MyPortfolio backup `backup/pre-settings-engine-2026-11-13` pinned to `e13f57e` until approved changes, and measure original behavior before integration.
