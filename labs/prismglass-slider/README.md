# PrismGlass Slider — MobiLab experimental module

Source: `labs/prismglass-slider/index.html`. Open from a local HTTP server or through GitHub Pages after merge.

## Fusion concept
- FreeDesignMD Glass Slider: solid capsule at rest, dragged liquid-glass lens, velocity-dependent stretch, spring return.
- Meniscus Slider: convex clear lens, narrow groove, thin rim, 1.2–1.4x held expansion.
- This lab is an **original vanilla JS experimental implementation inspired by those references**, not a copy of either library.
- Existing MobiLab uses vanilla JS; the provided `npx shadcn@latest add https://freedesignmd.com/r/glass-slider.json` installs React TSX and is **not** appropriate for MobiLab without React integration.

## Test instructions
```sh
python -m http.server 8000
# open http://localhost:8000/labs/prismglass-slider/
```

Check Chrome/Edge Chromium (SVG filter), Safari/Firefox (CSS frost), light/dark theme, forced fallback, mouse/touch drag, keyboard arrows/Home/End, disabled mode, export, reduced motion/transparency, 320px wide view, high-DPI and mobile.
Use the geometric grid to check that straight lines *bend* under the lens edge. This initial implementation is **not yet browser-verified or phone-tested**.

## Known research caveats
- SVG backdrop-filter and SVG feImage data URLs have browser-specific rendering behavior; check live DOM refraction in Chrome before claiming full optical equivalence.
- A single reusable instance and a component API/refined physics engine are follow-ups. Input velocity is approximated from changes in range value.
- Accessibility and contrast require visual checks against complex backdrops.
- Replace the demo-specific code with independent exported modules before production reuse.

## Next
1. Optical QA screenshots in light, dark, and frost fallback on PC and Galaxy.
2. Extract to `src/components/prismglass-slider.js` with `createPrismGlassSlider(root, options)` and `destroy()`.
3. Integrate into MobiLab cards without duplicating visual controls.
4. Compare native CSS / SVG backdrop / optional WebGL versions with frame timings and battery tests.
5. Add a separate adapter for React / shadcn, not a mandatory React dependency.

## References
- https://freedesignmd.com/r/glass-slider.json
- https://meniscus.site/components/slider
- https://github.com/jcm-developer/liquid-glass-components
- https://liqui.design/
