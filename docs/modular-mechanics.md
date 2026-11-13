# MobiLab modular mechanics · Preview 2026-11-13

**Status:** feature branch prototype, **not deployed to main**, not real-device validated.

## Goals

MobiLab is a host for independently reusable mechanics, not a single expanding page of tightly coupled demos. Group existing labs under Hardware, UI & Utilities, AI & Media, with Overview search and category filters. Existing Haptics, Camera, Motion, Ideas and standalone labs are retained.

## Haptic Pattern Studio

- Timeline of up to 32 segments. Each segment can be **ON** or **OFF**, reorderable and removable. Precise numeric milliseconds + slider whose maximum is configurable in whole seconds (1–120 seconds, default 10).
- Compiler merges adjacent same-kind segments and inserts a 0 ms leading ON for initial delays.
- Named presets are stored locally (mobilab.haptics.v1, backwards compatible) and available in the main dial, six button groups, and VibroMotion dial on refresh.
- JSON MobiLab.HapticProfiles.v2; selected pattern JSON MobiLab.HapticPattern.v2; selected ESM export with play() and stop(). Full library JSON export keeps group assignments.
- **No direct vibration intensity control in the Web Vibration API.** Long ON changes duration only, not electrical motor power, frequency or spatial actuator address.
- A **15,000 ms requested-playback budget** limits each UI-triggered pattern. Editing / exporting may contain longer durations. Browser/OS caps and vibration suppression can shorten or eliminate actual output.
- HapticEngine.stop() calls navigator.vibrate(0). Leaving the lab, backgrounding the page, and the stop button request cancellation.

### Programmatic usage

~~~js
import { HapticEngine } from "./src/haptics.js";
const haptics = new HapticEngine();
const id = haptics.saveNamed("Mission accomplished", [200, 100, 500]);
haptics.setGroup("confirmation", id);
// Call only from a deliberate user action:
button.addEventListener("click", () => haptics.playGroup("confirmation"));
~~~

## VibroMotion telemetry

- Pulse ON and OFF sliders now reach up to 10 seconds each; total multi-round experiment requests are capped at 15 seconds (plus preparation and settling).
- A **no-vibration timed control** lasts 2 s per round.
- Enable device motion + orientation permissions first. Raw devicemotion samples record timestamps relative to the requested pattern start, dynamic acceleration magnitude, observed relative yaw and **expected ON request** (not measured actuator output).
- Plot yellow acceleration and mint relative yaw against purple requested ON windows. Export latest sample trace to CSV; summary trial CSV is retained separately.
- Match a no-vibration control on surface and device position to compare peak motion readings. **Acceleration spikes, angular drift and estimated ON windows are not evidence of translation or controlled rotation.**
- Manual physical observation (rotation/slide/wobble), ruler distance and setup notes remain required.
- Use a padded, contained flat tray. Upright phone requires a stable protective jig, never a free-standing phone near an edge. Do not run unattended. Browser cannot guarantee physical safety.

### Device trial matrix

Record at least these cases on Samsung Internet and Chrome for Android (HTTPS): vibration API detection; motor perceptibility at 350 ms, 1 s, 5 s and 10 s; actual truncation/silencing; pause timing; timer interruption by app backgrounding; sensor permission and samples; no-vibration baseline; normal and rear-up cradle; stop and interruption; CSV import in Excel; local storage persistence. On real devices, treat screen-down power saving as a possible measurement limitation.

## UI Mechanics workbench

- labs/ui/ tests a *stationary*, six-slot dial. Dragging around it changes selection while slot coordinates remain fixed; page changes refill the stations.
- Reusable src/mechanics/fixed-menu-dial.js + .css can be downloaded independently. The JavaScript class takes root, items, visible, and onChange. No library dependency, no automatic network calls. JSON config export available.
- Test with touch, mouse, keyboard, reduced-motion and mobile focus before integrating into MyPortfolio or other projects.

## Settings Mechanism workbench

- labs/settings/ experiments with right drawer, bottom sheet, corner panel and full-screen layouts; size, opacity, blur, density, accent, transitions and tab list.
- Portable SettingsStore in src/mechanics/settings-store.js handles validated configuration, subscriptions, import/export. Separate mountSettingsPanel in src/mechanics/settings-panel.js plus .css renders accessible tab controls and accepts a custom renderSection adapter.
- This is a reusable settings foundation, **not yet a full no-code visual page builder** or a project settings migration.

### Embedding settings

~~~js
import { SettingsStore } from "./settings-store.js";
import { mountSettingsPanel } from "./settings-panel.js";
const store = new SettingsStore();
const view = mountSettingsPanel({ root: document.querySelector("#settings"), store });
store.set({ layout: "bottom", blur: 22 });
// view.destroy() when the host screen is removed
~~~

## Files and responsibilities

| Layer | Files | Responsibility |
|---|---|---|
| Runtime | src/haptics.js | shared timing engine and named profile store |
| Editor | src/pattern-editor.js | haptic timeline UI and export |
| Sensors | src/vibromotion.js | controlled trials, trace plotting and CSV |
| Host | src/app.js, index.html, styles.css | navigation, search and core lab integration |
| UI module | src/mechanics/fixed-menu-dial.js + .css | stationary dial component |
| Settings module | src/mechanics/settings-store.js, settings-panel.js + .css | state + view |
| Labs | labs/ui/, labs/settings/ | independent browser previews |

## Validation and release

- Static syntax and pure function checks performed on preview branch.
- Repeat with: node tests/modular-mechanics.test.cjs from repository root.
- Manual phone/browser behavior is **not yet confirmed**. Do not merge or publish without device acceptance.
- No hardware amplitude/frequency/actuator-position control is claimed. Native Android investigation would need Vibrator.hasAmplitudeControl() and waveform APIs; actual support varies by device.
- PR review → desktop visual test → Samsung phone test → approve → merge → Pages test → write PCM evidence checkpoint.
