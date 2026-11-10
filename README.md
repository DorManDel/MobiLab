# MobiLab 🧪

A mobile-first collection of experimental web mechanics and hardware explorations, maintained as independent labs.

## Experiments

- **Haptic Studio** — reusable vibration feedback engine, per-button-group profiles, custom pulse patterns, local presets, export.
- **VibroCam** — camera permission, front/back preview, angle sensor and vibration testing. Physical rotation is **not** assumed.
- **Idea Board** — locally saved experiment ideas.

## Run

Open **index.html** from the published GitHub Pages site for camera and motion sensor permissions.

To publish: **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.

The project uses plain HTML/CSS/JavaScript modules with no build step. GitHub Pages provides HTTPS. Open the website directly in a full browser, rather than inside a chat app or embedded webview.

## Haptics limits

Web vibration support depends on browser/device/system settings. The Vibration API controls ON/OFF timing (milliseconds), **not actuator amplitude or frequency**. A short tap profile is not guaranteed to feel weaker than another profile on every phone. For actual amplitude control, a native Android implementation may be required.

All controls are opt-in. Camera streams are local and stopped when leaving the lab. Camera snapshots are kept on device and not uploaded. Group profiles and idea notes are saved in browser localStorage, **not pushed to GitHub automatically**.

## Structure

```text
index.html
styles.css
src/
  haptics.js     # reusable HapticEngine + presets + storage
  camera.js      # camera and orientation helpers
  app.js         # tabbed UI, group profiles, labs
README.md
```

## Adding a new experiment

Add a new section with `data-panel` to `index.html`, a corresponding navigation button with `data-tab`, then connect the lab in `src/app.js`. Keep reusable mechanics in separate modules under `src/`.

## Planned directions

- Capture repeatability results for vibration-driven phone rotation with a safe, padded platform.
- Haptic A/B profiles and latency measurements.
- Native Android bridge for advanced haptics, if hardware supports it.
- Save/export lab configurations and performance logs.
