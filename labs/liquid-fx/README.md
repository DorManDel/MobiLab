# Liquid FX Playground — WebForge FX Arsenal v0.3

MobiLab's existing `labs/liquid-fx/` experiment now serves the WebForge FX Arsenal.

## Open
- **[Full live FX Arsenal](./index.html)** — 12 isolated touch-ready demos; optical Liquid Glass opens by default.
- **[Previous Liquid FX demo](./legacy.html)** — preserved original 4-mode experiment (Magnet, Metaball, Inertia, Gooey tabs).

## Liquid Glass controls
Border Radius (0–96px), Frost (0–100%), Blur (0–24px), Refraction (0–280), and Bezel Depth (1–55px). Reset, six generated background scenes, Copy CSS, Copy SVG, and Download standalone example are available directly in the inspector. State is saved to browser-local storage.

The SVG backdrop displacement uses separate RGB channels and a dynamically generated lens displacement map, inspired by the user-provided Hire Digital CSS generator reference. This is not a copy of third-party design assets. Refraction depends on browser support: mainly Chromium; Safari/Firefox generally display a translucent frosted fallback.

## Architecture and limitations
The deployed `index.html` is an **offline-capable, dependency-free standalone prototype** bundling styles and scripts. Each effect is registered in its internal FX addon registry, but these addons are not yet published as a production-ready importable package. We retain the legacy experiment and original reference notes. The full modular development sources are retained in the WebForge v0.3 source bundle pending extraction into shared MobiLab modules.

There are no calls to external providers or cloud APIs. Preferences stay in localStorage and downloaded presets stay on the user's device. Avoid relying on this as a polished accessibility or cross-browser component library without additional QA.

## QA and follow-ups
- Existing laboratory renders 12 demos with pointer/touch handling, mobile inspector, and reduced-motion setting.
- Static source sanity checks completed for current import.
- Further tests: physical Galaxy device, scroll+gesture conflicts, performance/FPS under repeated dragging, SVG refraction on Chrome versus Safari/Firefox, keyboard navigation.
- Next: custom background image upload, separate per-effect reusable addon packages, WebForge integration after review.

This change deliberately **does not edit the portfolio or PrismMechanic_Web**.
