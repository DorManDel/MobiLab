# MobiLab 🧪

A mobile-first collection of experimental web mechanics and hardware explorations, maintained as independent labs.

## Experiments

- **Haptic Studio** — 21 timing patterns, accessible swipe/arrow/tap dial, six button-group presets, custom two-pulse designer, browser storage and JSON export.
- **Camera Lab** — permission-based front/back preview, local snapshot and relative orientation.
- **VibroMotion** — short timed vibration trials with motion/orientation telemetry, protected flat/upright setup modes, no-vibration control, custom pulse trains (on/off/duty), optional local rear-camera contact sheets, physical observations and CSV export.
- **Blink Lab** — touch-first profile eyelid overlay calibration, image-space relative eye anchors, auto/manual blink, zoom, crop and tilt preview, local settings and JSON export. Open at [`labs/blink/`](./labs/blink/).
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
  vibromotion.js # short guarded physical trials and CSV observations
  app.js         # tabbed UI, group profiles, labs
labs/
  blink/
    index.html    # self-contained Blink Lab v0.2, linked from overview and tabs
README.md
```

## Adding a new experiment

For a small native panel, add a `data-panel` section and matching `data-tab` button in `index.html`, then connect it through `src/app.js`. For a full-screen mobile workbench, follow the **Blink Lab** pattern: create a standalone experiment at `labs/<name>/index.html` and link it from the overview and tab navigation. Preserve a back link to `../../#home`. Keep reusable mechanics in modules where practical.

## Planned directions

- Capture repeatability results for vibration-driven phone rotation with a safe, padded platform.
- Haptic A/B profiles and latency measurements.
- Native Android bridge for advanced haptics, if hardware supports it.
- Save/export lab configurations and performance logs.

## v0.2: Physical experiment protocol

1. **Safety first:** place the phone within a protective padded enclosure, away from edges and hard objects. An upright phone requires a stable restraint or jig that cannot tip. Do **not** run unattended or place a free-standing device on an exposed table.
2. Open **Haptic Studio** to compare patterns using the circular dial: swipe left/right, use arrow buttons or keyboard, tap the center to preview. Profiles are timing patterns only, never true motor amplitude settings.
3. Open **VibroMotion**. Enable sensors explicitly and verify they show a changing orientation/acceleration. Use a supported flat setup first. Confirm the enclosure, choose a rhythm or the `Pulse Train` timing generator and run a short trial.
4. Perform a **no-vibration control** on the same surface and compare. Sensor-derived relative alpha is not displacement; acceleration can include sensor noise and motor vibration. Use an external ruler/marker to record actual sliding distance manually.
5. For **rear-camera-up ceiling capture**, use a scratch-free cradle that provides lens clearance and a delayed start of at least 5 seconds; arm the rear camera with consent. During a completed trial the app attempts a local 3-frame contact sheet. Some devices turn the screen off when face-down, which cancels camera/sensors — this is a hardware/browser limitation, not proof of a failed motion experiment.
6. Use **Emergency stop** if anything moves unexpectedly. Changes, outcomes, dates and device/browser notes should be recorded. Export CSV and attach relevant findings to the corresponding GitHub Issue or private PCM checkpoint.

**Privacy:** session notes and small summary records stay in local browser storage, not PCM. CSV is generated only when pressed. Camera images are not uploaded. No continuous vibration loop, motor amplitude setting or real panorama stitching is implemented.

**Native Android follow-up:** use `Vibrator.hasAmplitudeControl()` (when applicable) and `VibrationEffect` APIs, testing device behavior before claiming actual intensity control.

## Blink Lab v0.2 — phone and PC testing

- Open the [MobiLab overview](https://dormandel.github.io/MobiLab/) and choose **Blink Lab**, or visit [Blink Lab directly](https://dormandel.github.io/MobiLab/labs/blink/).
- **Show anchors** is on by default. Enable **Edit** to drag either eye on the photo, or select Left/Right and use the fine nudge arrows and zoom.
- Eye center, width, height and angle are stored as normalized coordinates relative to the **source image**, not viewport pixels. The same calibration should remain aligned across screen sizes and supported aspect ratios/crops.
- Settings persist separately per browser/device through localStorage. For the **same values across phone and PC**, use **Export settings** on one and **Import settings** on the other; no cloud sync or publishing is implied.
- The public profile image currently loads from the Dor-s-Profile-Site repository; importing a local photo does not upload it. The Prism control is a lightweight sheen preview, not the portfolio's full shader.
- Blink Lab is intentionally a separate page instead of an iframe to keep touch calibration and viewport layout reliable on phones.
