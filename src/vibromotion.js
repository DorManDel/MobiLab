// VibroMotion: short controlled vibration trials and opt-in local sensor measurements.
// This is not a distance tracker. Orientation/acceleration can be noisy under vibration.
import { PRESETS } from "./haptics.js";
import { CameraLab } from "./camera.js";

const $ = (id) => document.getElementById(id);
const RECORDS_KEY = "mobilab.motion.trials.v1";
const MAX_ROWS = 40;
const MAX_RUN_MS = 6500;
// A smaller physical-lab catalog avoids endless dropdown lists.
const MOTION_PRESETS = ["off", "tick", "light", "medium", "strong", "triple", "heartbeat",
  "bounce", "roll", "rhythm", "sweep", "rumble", "orbit", "custom", "train"];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const angularDelta = (a, b) => ((a - b + 540) % 360) - 180;

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY) || "[]");
    return Array.isArray(data) ? data.slice(0, MAX_ROWS).filter((x) => x && typeof x.date === "string") : [];
  } catch (_) { return []; }
}
function escapeCSV(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}
function saveFile(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function motionPermission() {
  if (!window.isSecureContext) throw new Error("Use HTTPS for device sensors");
  if (typeof window.DeviceOrientationEvent === "undefined" && typeof window.DeviceMotionEvent === "undefined") {
    throw new Error("Device sensors are not available in this browser");
  }
  if (typeof window.DeviceOrientationEvent?.requestPermission === "function") {
    const accepted = await window.DeviceOrientationEvent.requestPermission();
    if (accepted !== "granted") throw new Error("Orientation permission denied");
  }
  if (typeof window.DeviceMotionEvent?.requestPermission === "function") {
    const accepted = await window.DeviceMotionEvent.requestPermission();
    if (accepted !== "granted") throw new Error("Motion permission denied");
  }
}
export function setupVibroMotion({ haptics, notify }) {
  const camera = new CameraLab($("motionVideo"));
  let records = loadRecords();
  let runToken = 0;
  let running = false;
  let sensorsOn = false;
  let lastYaw = null;
  let lastAcceleration = null;
  let anchorYaw = null;
  let activeTrial = null;
  let samples = [];
  let raf = 0;
  let cameraArmed = false;
  let sensorSampleCount = 0;
  let motionPresetIndex = MOTION_PRESETS.indexOf("rumble");

  const status = (message) => { $("motionStatus").textContent = message; };
  const sensorState = (message) => { $("motionSensorState").textContent = message; };
  const fmt = (v, digits = 2) => v === null || v === undefined ? "—" : Number(v).toFixed(digits);

  function persist() {
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (_) {
      notify("Browser storage unavailable. Export CSV to keep these results.");
    }
  }
  function renderRecords() {
    const container = $("motionResults");
    container.replaceChildren();
    if (!records.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "No experiments recorded yet.";
      container.append(p);
      return;
    }
    for (const row of records.slice(0, 12)) {
      const article = document.createElement("article");
      article.className = "motion-record";
      const head = document.createElement("div");
      head.className = "motion-record-head";
      const title = document.createElement("span");
      title.textContent = row.preset + " · " + row.mode.replaceAll("-", " ") + " · " + row.rounds + "×";
      const delta = document.createElement("b");
      delta.textContent = row.yawDelta === null ? "Angle: n/a" : "Δ yaw " + fmt(row.yawDelta, 1) + "°";
      head.append(title, delta);
      const summary = document.createElement("small");
      summary.textContent = [new Date(row.date).toLocaleString(), row.surface, "acceleration peak: " + fmt(row.peakAccel) + " m/s²", "samples: " + row.samples].join(" · ");
      const observation = document.createElement("small");
      observation.textContent = "Observed: " + (row.observation || "not assessed") +
        (row.distanceMM === null ? "" : " · manually measured: " + row.distanceMM + " mm") +
        (row.notes ? " · " + row.notes : "");
      article.append(head, summary, observation);
      container.append(article);
    }
  }
  function drawGraph() {
    raf = 0;
    const canvas = $("motionChart");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#50416d";
    ctx.lineWidth = 1;
    for (const y of [height / 4, height / 2, height * .75]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    if (samples.length < 2) return;
    const peak = Math.max(5, ...samples.map((v) => Math.abs(v)));
    ctx.strokeStyle = "#b696fc";
    ctx.lineWidth = 3;
    ctx.beginPath();
    samples.forEach((v, index) => {
      const x = index / (Math.max(1, samples.length - 1)) * width;
      const y = height / 2 - v / peak * height * .42;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  function updateYaw(event) {
    if (typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) return;
    lastYaw = event.alpha;
    if (anchorYaw === null) anchorYaw = lastYaw;
    const delta = angularDelta(lastYaw, anchorYaw);
    $("motionYaw").textContent = fmt(delta, 1);
    samples.push(delta);
    if (samples.length > 120) samples.shift();
    if (!raf && document.visibilityState === "visible") raf = requestAnimationFrame(drawGraph);
    if (activeTrial?.startYaw !== null) {
      activeTrial.yawAbsMax = Math.max(activeTrial.yawAbsMax, Math.abs(angularDelta(lastYaw, activeTrial.startYaw)));
    }
  }
  function updateMotion(event) {
    // Use gravity-compensated acceleration only. Without it, do not fabricate values.
    const axes = event.acceleration;
    const components = [safeNumber(axes?.x), safeNumber(axes?.y), safeNumber(axes?.z)];
    if (components.some((v) => v === null)) return;
    const magnitude = Math.hypot(...components);
    lastAcceleration = magnitude;
    sensorSampleCount++;
    $("motionAccel").textContent = fmt(magnitude);
    if (activeTrial) {
      activeTrial.samples++;
      activeTrial.peakAccel = Math.max(activeTrial.peakAccel ?? 0, magnitude);
      $("motionPeak").textContent = fmt(activeTrial.peakAccel);
    }
  }
  async function enableSensors() {
    try {
      await motionPermission();
      if (sensorsOn) stopSensors();
      lastYaw = null;
      lastAcceleration = null;
      anchorYaw = null;
      sensorSampleCount = 0;
      samples = [];
      window.addEventListener("deviceorientation", updateYaw);
      window.addEventListener("devicemotion", updateMotion);
      sensorsOn = true;
      sensorState("Listening to orientation and motion events. Readouts depend on available sensors.");
      notify("Sensor listeners enabled. Try a brief movement to confirm readings.");
    } catch (error) {
      sensorState("Cannot enable sensors: " + error.message);
    }
  }
  function stopSensors() {
    window.removeEventListener("deviceorientation", updateYaw);
    window.removeEventListener("devicemotion", updateMotion);
    sensorsOn = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    activeTrial = null;
    sensorState("Monitoring stopped. Enable sensors before another measured trial.");
  }

  function trainPattern() {
    const on = Number($("motionPulseOn").value);
    const off = Number($("motionPulseOff").value);
    const count = Number($("motionPulseCount").value);
    const pattern = [];
    for (let i = 0; i < count; i++) {
      if (i > 0) pattern.push(off);
      pattern.push(on);
    }
    return pattern;
  }
  function selectedPattern() {
    const id = $("motionPreset").value;
    return id === "train" ? trainPattern() : haptics.pattern(id);
  }
  function refreshMotionRhythm() {
    const id = MOTION_PRESETS[motionPresetIndex];
    $("motionPreset").value = id;
    const p = selectedPattern();
    $("motionPresetLabel").textContent = id === "train" ? "Pulse Train" : PRESETS[id]?.name || id;
    $("motionPresetMeta").textContent =
      p.filter((_, index) => index % 2 === 0).length + " on-pulses · " + p.reduce((s,n)=>s+n,0) + " ms";
    $("motionTrainControls").hidden = id !== "train";
  }
  function changeMotionRhythm(step) {
    motionPresetIndex = (motionPresetIndex + step + MOTION_PRESETS.length) % MOTION_PRESETS.length;
    refreshMotionRhythm();
    haptics.playPreset("tick");
  }
  function refreshPulseTrain() {
    const on = Number($("motionPulseOn").value);
    const off = Number($("motionPulseOff").value);
    const count = Number($("motionPulseCount").value);
    for (const [id, value, suffix] of [
      ["motionPulseOn", on, " ms"], ["motionPulseOff", off, " ms"], ["motionPulseCount", count, ""]
    ]) $(id + "Value").textContent = value + suffix;
    const pattern = trainPattern();
    const total = pattern.reduce((s,n)=>s+n,0);
    const onTime = on * count;
    $("motionDuty").textContent = "ON duty: " + Math.round(onTime / total * 100) +
      "% · total " + total + " ms. Not true motor amplitude.";
    refreshMotionRhythm();
  }
  function setModeHint() {
    const mode = $("motionMode").value;
    const descriptions = {
      "screen-up": "The screen and selfie camera point upward. Keep the phone within a padded tray.",
      "rear-up": "The rear camera points upward and screen faces down. Protect the glass and leave camera clearance. Countdown is at least 5 seconds.",
      upright: "Use a custom stable padded jig with side supports that cannot tip. NEVER stand an unrestrained phone on an open table."
    };
    $("motionModeHint").textContent = descriptions[mode];
    if (mode === "rear-up" && Number($("motionDelay").value) < 5) $("motionDelay").value = "5";
    if (mode !== "rear-up" && cameraArmed) stopCamera();
  }
  async function startCamera() {
    if ($("motionMode").value !== "rear-up") {
      notify("Select the rear-camera-up setup before arming a capture.");
      return;
    }
    $("motionCameraStatus").textContent = "Requesting rear camera…";
    try {
      await camera.start("environment");
      cameraArmed = true;
      $("motionCameraStatus").textContent = "Rear camera armed locally. A completed trial saves one contact sheet.";
    } catch (error) {
      cameraArmed = false;
      $("motionCameraStatus").textContent = "Camera failed: " + error.message;
    }
  }
  function stopCamera() {
    camera.stop();
    cameraArmed = false;
    $("motionCameraStatus").textContent = "Camera is off.";
  }

  function captureFrame() {
    const video = $("motionVideo");
    if (!cameraArmed || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    const max = 640;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  function downloadFrames(frames) {
    if (!frames.length) return false;
    const width = Math.max(...frames.map((frame) => frame.width));
    const height = Math.max(...frames.map((frame) => frame.height));
    const output = document.createElement("canvas");
    output.width = width * frames.length;
    output.height = height;
    const ctx = output.getContext("2d");
    ctx.fillStyle = "#100b1c";
    ctx.fillRect(0, 0, output.width, output.height);
    frames.forEach((frame, index) => ctx.drawImage(frame, index * width, 0, width, height));
    output.toBlob((blob) => {
      if (!blob) { notify("Contact sheet could not be encoded."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mobilab-ceiling-trial-" + Date.now() + ".jpg";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }, "image/jpeg", .87);
    return true;
  }

  function stopTrial(announce = true) {
    ++runToken;
    running = false;
    activeTrial = null;
    haptics.stop();
    $("motionRun").disabled = false;
    if (announce) status("Stopped. No incomplete trial was saved.");
  }
  async function runTrial() {
    if (running) return;
    const mode = $("motionMode").value;
    if (!$("motionGuard").checked) { notify("Confirm your stable padded test enclosure first."); return; }
    if (mode === "upright" && !$("motionGuard").checked) return;
    if (!haptics.supported) { notify("This browser does not expose vibration. Use an Android browser that supports it."); return; }
    const presetId = $("motionPreset").value;
    const pattern = selectedPattern();
    if (presetId !== "off" && !haptics.config.enabled) { notify("Enable the Haptic Studio engine first."); return; }
    if (pattern.length && pattern.every((v) => v === 0)) { notify("Selected pattern contains no vibration."); return; }
    const rounds = Math.max(1, Math.min(3, Number($("motionRounds").value) || 1));
    const duration = pattern.reduce((sum, t) => sum + t, 0);
    const total = rounds * duration + (rounds - 1) * 250;
    if (total > MAX_RUN_MS) {
      notify("Sequence exceeds 6.5 seconds. Use fewer cycles or a shorter preset.");
      return;
    }
    let seconds = Number($("motionDelay").value) || 0;
    if (mode === "rear-up") seconds = Math.max(5, seconds);
    const token = ++runToken;
    running = true;
    $("motionRun").disabled = true;
    $("motionPeak").textContent = "—";
    const frames = [];
    try {
      for (let i = seconds; i > 0; i--) {
        if (token !== runToken || document.hidden) return;
        status("Prepare safely. Vibration begins in " + i + " seconds. Tap Stop to cancel.");
        await wait(1000);
      }
      if (token !== runToken || document.hidden) return;
      const startYaw = sensorsOn ? lastYaw : null;
      const trial = {
        date: new Date().toISOString(), mode, surface: $("motionSurface").value,
        preset: presetId, rounds, totalPatternMS: total, sensorsEnabled: sensorsOn,
        pulseOnMS: presetId === "train" ? Number($("motionPulseOn").value) : null,
        pulseOffMS: presetId === "train" ? Number($("motionPulseOff").value) : null,
        pulseCount: presetId === "train" ? Number($("motionPulseCount").value) : null,
        startYaw, endYaw: null, yawDelta: null, yawAbsMax: 0,
        peakAccel: null, samples: 0,
        observation: "not assessed", distanceMM: null, notes: ""
      };
      activeTrial = trial;
      if (cameraArmed && mode === "rear-up") {
        const first = captureFrame(); if (first) frames.push(first);
      }
      for (let i = 0; i < rounds; i++) {
        if (token !== runToken || document.hidden) return;
        status("Running vibration cycle " + (i + 1) + " of " + rounds + ". Physical motion is not inferred.");
        if (presetId !== "off") {
          const result = haptics.play(pattern);
          if (!result.ok) { status("Vibration request rejected: " + result.reason); return; }
        }
        await wait(duration + 80);
        if (token !== runToken || document.hidden) return;
        if (cameraArmed && mode === "rear-up") {
          const frame = captureFrame(); if (frame) frames.push(frame);
        }
        if (i + 1 < rounds) await wait(170);
      }
      // Wait briefly for a stabilized reading after motor stops.
      haptics.stop();
      status("Motor stopped. Waiting for sensor settling…");
      await wait(450);
      if (token !== runToken || document.hidden) return;
      trial.endYaw = sensorsOn ? lastYaw : null;
      trial.yawDelta = trial.startYaw === null || trial.endYaw === null
        ? null : angularDelta(trial.endYaw, trial.startYaw);
      if (cameraArmed && mode === "rear-up") {
        const final = captureFrame(); if (final) frames.push(final);
        if (frames.length) downloadFrames(frames.slice(0, 3));
      }
      records.unshift(trial);
      records = records.slice(0, MAX_ROWS);
      persist();
      renderRecords();
      status("Trial recorded. Angle " + fmt(trial.yawDelta, 1) + "°, dynamic acceleration peak " +
        fmt(trial.peakAccel) + " m/s². Annotate what you saw below.");
      notify("Trial saved locally. Add a physical observation for meaningful results.");
    } finally {
      if (token === runToken) {
        running = false;
        activeTrial = null;
        $("motionRun").disabled = false;
        haptics.stop();
      }
    }
  }

  function annotateLastTrial() {
    if (!records.length) { notify("Run a trial first."); return; }
    const raw = $("motionDistance").value.trim();
    const measured = raw === "" ? null : Number(raw);
    if (measured !== null && (!Number.isFinite(measured) || measured < 0 || measured > 1000)) {
      notify("Distance must be 0–1000 mm or blank.");
      return;
    }
    Object.assign(records[0], {
      observation: $("motionObserved").value,
      distanceMM: measured,
      notes: $("motionNotes").value.trim().slice(0, 280)
    });
    persist();
    renderRecords();
    notify("Saved the manual observation on the latest trial.");
  }
  function exportCSV() {
    if (!records.length) { notify("No trials to export."); return; }
    const fields = ["date","mode","surface","preset","rounds","totalPatternMS","sensorsEnabled",
      "startYaw","endYaw","yawDelta","yawAbsMax","peakAccel","samples","observation","distanceMM","notes",
      "pulseOnMS","pulseOffMS","pulseCount"];
    const lines = [fields.join(","), ...records.map((r) => fields.map((f) => escapeCSV(r[f])).join(","))];
    saveFile("mobilab-motion-trials.csv", lines.join("\r\n"), "text/csv;charset=utf-8");
    notify("Trial CSV exported.");
  }
  function stop() {
    stopTrial(false);
    stopSensors();
    stopCamera();
    status("Experiment paused. Return and enable sensors for new readings.");
  }
  function setup() {
    $("motionPresetPrev").addEventListener("click", () => changeMotionRhythm(-1));
    $("motionPresetNext").addEventListener("click", () => changeMotionRhythm(1));
    for (const id of ["motionPulseOn","motionPulseOff","motionPulseCount"]) {
      $(id).addEventListener("input", refreshPulseTrain);
    }
    refreshMotionRhythm();
    refreshPulseTrain();
    $("motionMode").addEventListener("change", setModeHint);
    $("motionSensors").addEventListener("click", enableSensors);
    $("motionCameraStart").addEventListener("click", startCamera);
    $("motionCameraStop").addEventListener("click", stopCamera);
    $("motionRun").addEventListener("click", () => {
      runTrial().catch((error) => {
        status("Experiment failed: " + error.message);
        stopTrial(false);
      });
    });
    $("motionStop").addEventListener("click", () => {
      stopTrial();
      stopCamera();
      notify("Emergency stop requested.");
    });
    $("motionAnnotate").addEventListener("click", annotateLastTrial);
    $("motionExport").addEventListener("click", exportCSV);
    $("motionClear").addEventListener("click", () => {
      if (!confirm("Delete locally stored motion trial records? Export a CSV first if needed.")) return;
      records = [];
      persist();
      renderRecords();
    });
    setModeHint();
    renderRecords();
    drawGraph();
    return { stop, stopTrial };
  }
  return setup();
}
