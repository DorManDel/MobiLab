# Glass Motion Suite · MobiLab

Standalone framework-free sibling of the [PrismGlass Slider](../prismglass-slider/).

## Labs
1. **Liquid Segmented** — one shared glass indicator, spring-like stretch between tabs, accessible roving tabindex with Arrow/Home/End keys.
2. **Magnetic Glass Dock** — pointer-distance magnification, attraction, focus support, tap/click selection and touch-safe behavior.
3. **Morphing Glass Menu** — one surface animates from compact capsule to action panel; button semantics, Escape/outside close, hidden inert actions.
4. **Rendering Performance Lab** — CSS backdrop frost / SVG displacement backdrop / WebGL scene-shader preview; five-second rAF frame-interval sample with average, p95 and >33.4ms intervals.

## Run
Serve repository root using `python -m http.server 8000`, then open `http://localhost:8000/labs/glass-motion/`.

## What measurements mean
`requestAnimationFrame` intervals measure **entire page responsiveness and scheduling**, not component-level GPU execution or isolated shader cost. WebGL samples its own canvas scene, while CSS and SVG operate on browser backdrops; they are deliberately **different optical tiers**. Compare each tier on the same device under the same conditions; repeated passes are needed before claiming performance superiority. The automatic CSS fallback is used in browsers that do not support SVG backdrop filters.

## QA checklist (not yet performed)
- [ ] Desktop Chrome/Edge, real light and dark screenshots, detailed backdrop
- [ ] Verify straight grid lines refract inside SVG lens and not across the full preview
- [ ] Force CSS fallback and verify readable controls
- [ ] Mobile Chrome + Samsung Internet drag, tap, and no layout overflow
- [ ] Safari/Firefox fallback and WebGL disabled devices
- [ ] Keyboard tablist arrows and menu Escape; screen reader names
- [ ] Reduced motion/transparency, visible focus, contrast
- [ ] Run 3 repetitions per mode with same viewport; record median avg/p95 and interval drops
- [ ] Check mobile CPU/GPU and battery impact

## Architecture follow-ups
- Extract reusable modules from page-local code into `src/components/glass-motion/`
- Share optical material tokens and animation engine with `labs/liquid-fx/`
- Per-component exported lifecycle APIs: `mount(root, options)`, `update(options)`, `destroy()`
- Add reusable React wrapper separately rather than bringing shadcn into the vanilla MobiLab runtime
- Browser integration tests and performance snapshots on CI

No existing production code is modified; this remains an experimental lab on the feature branch.
