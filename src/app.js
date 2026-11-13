import { HapticEngine, GROUPS, PRESETS } from "./haptics.js";
import { CameraLab } from "./camera.js";
import { setupVibroMotion } from "./vibromotion.js";
import { setupPatternEditor } from "./pattern-editor.js";

// MobiLab: browser-only application shell.
// All hardware actions happen only after deliberate interaction.
const $ = (id) => document.getElementById(id);
const haptics = new HapticEngine();
const camera = new CameraLab($("cameraVideo"));
const tabs = new Set(["home", "haptics", "camera", "motion", "ideas"]);
let motionBench = null;
const IDEAS_KEY = "mobilab.ideas.v1";
let currentTab = "";
let toastTimeout;
let ideas = loadIdeas();

function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}

function navigate(target, updateLocation = true) {
  const nextTab = tabs.has(target) ? target : "home";
  if (currentTab === "camera" && nextTab !== "camera") {
    shutdownCamera();
    camera.stopOrientation();
    $("angleReadout").textContent = "—°";
    $("sensorStatus").textContent = "Sensor paused when leaving Camera Lab.";
  }
  if (currentTab === "haptics" && nextTab !== "haptics") haptics.stop();
  if (currentTab === "motion" && nextTab !== "motion") motionBench?.stop();
  currentTab = nextTab;

  function setupLabIndex() {
  const cards = [...document.querySelectorAll("#labCards .lab-card")];
  const search = $("labSearch");
  const filters = [...document.querySelectorAll("[data-lab-filter]")];
  let category = "all";
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const matching = (category === "all" || card.dataset.labCategory === category) &&
        card.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !matching;
      if (matching) visible++;
    }
    $("labCount").textContent = visible + " / " + cards.length + " LABS";
    $("labEmpty").hidden = visible > 0;
    filters.forEach((button) => button.classList.toggle("is-selected", button.dataset.labFilter === category));
  }
  search.addEventListener("input", render);
  filters.forEach((button) => button.addEventListener("click", () => { category = button.dataset.labFilter; render(); }));
  render();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === nextTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const active = panel.dataset.panel === nextTab;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  if (updateLocation && window.location.hash !== "#" + nextTab) {
    history.replaceState(null, "", "#" + nextTab);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function download(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}
function loadIdeas() {
  const saved = readStorage(IDEAS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter((idea) => idea && typeof idea.id === "string" && typeof idea.title === "string")
    .map((idea) => ({ id: idea.id, title: idea.title.slice(0, 160), date: String(idea.date || "") }));
}
function saveIdeas() {
  try { localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas)); }
  catch (_) { notify("Browser storage unavailable; ideas are only in memory."); }
}
function renderIdeas() {
  const list = $("ideasList");
  list.replaceChildren();
  $("ideaCount").textContent = ideas.length + " IDEAS";
  if (!ideas.length) {
    const li = document.createElement("li");
    li.className = "empty-list";
    li.textContent = "Nothing here yet. Add your next strange experiment.";
    list.append(li);
    return;
  }
  for (const idea of ideas) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "idea-text";
    text.textContent = idea.title;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove idea: " + idea.title);
    remove.addEventListener("click", () => {
      ideas = ideas.filter((entry) => entry.id !== idea.id);
      saveIdeas();
      renderIdeas();
      haptics.playGroup("navigation");
    });
    li.append(text, remove);
    list.append(li);
  }
}
function setupIdeas() {
  renderIdeas();
  $("ideaForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("ideaInput");
    const title = input.value.trim();
    if (!title) return;
    ideas.unshift({ id: crypto.randomUUID?.() || Date.now() + "-" + Math.random(), title: title.slice(0, 160), date: new Date().toISOString() });
    saveIdeas();
    renderIdeas();
    input.value = "";
    haptics.playGroup("confirmation");
    notify("Idea saved in this browser.");
  });
  $("exportIdeas").addEventListener("click", () => {
    download("mobilab-ideas.json", JSON.stringify({
      schema: "MobiLab.Ideas.v1", exportedAt: new Date().toISOString(), ideas
    }, null, 2));
    notify("Idea board exported.");
  });
}

function createOption(label, value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}
function drawWaveform(container, pattern) {
  container.replaceChildren();
  if (!pattern.length || pattern.every((ms) => ms === 0)) {
    const span = document.createElement("span");
    span.className = "waveform-empty";
    span.textContent = "No vibration / silent";
    container.append(span);
    return;
  }
  pattern.forEach((ms, index) => {
    const bar = document.createElement("span");
    bar.className = "segment " + (index % 2 === 0 ? "on" : "off");
    bar.style.setProperty("--duration", String(Math.max(8, ms)));
    bar.title = (index % 2 === 0 ? "Vibrate " : "Pause ") + ms + " milliseconds";
    bar.textContent = ms > 17 ? ms + "ms" : "";
    container.append(bar);
  });
}
let presetIds = Object.keys(haptics.allPresets());
let activePresetIndex = Math.max(0, presetIds.indexOf("tick"));
let patternEditor = null;
function refreshPresetCatalog() {
  const current = presetIds[activePresetIndex] || "tick";
  presetIds = Object.keys(haptics.allPresets());
  activePresetIndex = Math.max(0, presetIds.indexOf(current));
}
function selectedPresetId() { return presetIds[activePresetIndex]; }
function dialChange(amount, feedback = true) {
  activePresetIndex = (activePresetIndex + amount + presetIds.length) % presetIds.length;
  refreshPresetPreview();
  if (feedback) haptics.playPreset("tick");
}
function refreshPresetPreview() {
  const selected = selectedPresetId();
  drawWaveform($("presetWaveform"), haptics.pattern(selected));
  $("presetNote").textContent = haptics.allPresets()[selected]?.note || "Saved personal vibration pattern";
  $("dialPresetLabel").textContent = haptics.allPresets()[selected]?.name || "Unknown";
  $("presetPosition").textContent = String(activePresetIndex + 1).padStart(2, "0") + " / " + presetIds.length;
  const ms = haptics.pattern(selected).reduce((sum, n) => sum + n, 0);
  $("presetDuration").textContent = ms + " ms total";
  $("dialTicks").style.setProperty("--dial-angle", activePresetIndex * 17 + "deg");
  $("presetPlay").setAttribute("aria-label", "Test " + haptics.allPresets()[selected].name + " pattern");
}
function setupPresetDial() {
  $("presetPrev").addEventListener("click", () => dialChange(-1));
  $("presetNext").addEventListener("click", () => dialChange(1));
  $("presetPlay").addEventListener("click", () => playResult(haptics.playPreset(selectedPresetId())));
  const container = $("presetDial");
  container.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      dialChange(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  let beginX = null;
  container.addEventListener("touchstart", (event) => {
    beginX = event.touches.length === 1 ? event.touches[0].clientX : null;
  }, { passive: true });
  container.addEventListener("touchend", (event) => {
    if (beginX === null || !event.changedTouches.length) return;
    const diff = event.changedTouches[0].clientX - beginX;
    if (Math.abs(diff) > 36) dialChange(diff < 0 ? 1 : -1);
    beginX = null;
  }, { passive: true });
  refreshPresetPreview();
}
function playResult(result) {
  if (result.ok) notify(result.reason === "Silent pattern" ? "Silent preset selected." : result.truncated ? "Requested with a 15s playback guard; browser may shorten further." : "Vibration request sent. Actual feel depends on hardware.");
  else notify(result.reason + ". Check browser and phone vibration settings.");
}
function renderGroups() {
  const grid = $("groupGrid");
  grid.replaceChildren();
  GROUPS.forEach((group, index) => {
    const card = document.createElement("article");
    card.className = "group-card";
    const header = document.createElement("div");
    header.className = "group-card-header";
    const heading = document.createElement("h3");
    heading.textContent = group.name;
    const number = document.createElement("span");
    number.className = "group-n";
    number.textContent = "GROUP " + String(index + 1).padStart(2, "0");
    header.append(heading, number);
    const description = document.createElement("p");
    description.textContent = group.description;
    const actions = document.createElement("div");
    actions.className = "group-actions";
    const picker = document.createElement("div");
    picker.className = "group-dial";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "btn btn-secondary group-step";
    previous.textContent = "‹";
    previous.setAttribute("aria-label", group.name + ": previous pattern");
    const next = document.createElement("button");
    next.type = "button";
    next.className = "btn btn-secondary group-step";
    next.textContent = "›";
    next.setAttribute("aria-label", group.name + ": next pattern");
    const selected = document.createElement("span");
    selected.className = "group-selected";
    selected.setAttribute("aria-live", "polite");
    function setSelection(step) {
      const current = Math.max(0, presetIds.indexOf(haptics.config.groups[group.id]));
      const id = presetIds[(current + step + presetIds.length) % presetIds.length];
      haptics.setGroup(group.id, id);
      selected.textContent = haptics.allPresets()[id].name;
      haptics.playPreset("tick");
    }
    previous.addEventListener("click", () => setSelection(-1));
    next.addEventListener("click", () => setSelection(1));
    selected.textContent = haptics.allPresets()[haptics.config.groups[group.id]]?.name || "Off";
    picker.append(previous, selected, next);
    const sample = document.createElement("button");
    sample.type = "button";
    sample.className = "btn btn-secondary";
    sample.textContent = group.button;
    sample.addEventListener("click", () => playResult(haptics.playGroup(group.id)));
    actions.append(picker, sample);
    const caption = document.createElement("div");
    caption.className = "sample-note";
    caption.textContent = "Use arrows to choose; press the sample to test.";
    card.append(header, description, actions, caption);
    grid.append(card);
  });
}
function setupHaptics() {
  $("hapticSupport").textContent = haptics.supported ? "Vibration API detected" : "Not available in this browser";
  $("hapticSupport").style.color = haptics.supported ? "var(--mint)" : "var(--yellow)";
  $("enableHaptics").checked = haptics.config.enabled;
  $("enableHaptics").addEventListener("change", (event) => {
    haptics.setEnabled(event.target.checked);
    notify(event.target.checked ? "Haptics enabled." : "Haptics disabled.");
  });
  setupPresetDial();
  $("testPreset").addEventListener("click", () => playResult(haptics.playPreset(selectedPresetId())));
  $("stopHaptics").addEventListener("click", () => { haptics.stop(); notify("Stop vibration requested."); });
  patternEditor = setupPatternEditor({
    haptics, notify, playResult, download, drawWaveform,
    onCatalogChange: () => { refreshPresetCatalog(); refreshPresetPreview(); renderGroups(); }
  });
  $("exportHaptics").addEventListener("click", () => {
    download("mobilab-haptic-profiles.json", haptics.export());
    notify("Haptic profiles exported.");
  });
  $("resetHaptics").addEventListener("click", () => {
    if (!confirm("Restore default haptic profiles and custom pattern?")) return;
    haptics.reset();
    $("enableHaptics").checked = true;
    patternEditor.reset();
    refreshPresetCatalog();
    refreshPresetPreview();
    renderGroups();
    notify("Default haptic profiles restored.");
  });
  renderGroups();
}
function shutdownCamera() {
  camera.stop();
  $("cameraPlaceholder").hidden = false;
  $("cameraLive").hidden = true;
  $("cameraStatus").textContent = "Camera is off.";
}
async function startCamera(mode) {
  $("cameraStatus").textContent = "Requesting camera access…";
  try {
    await camera.start(mode);
    if (currentTab !== "camera") { shutdownCamera(); return; }
    $("cameraPlaceholder").hidden = true;
    $("cameraLive").hidden = false;
    $("cameraStatus").textContent = (mode === "user" ? "Selfie" : "Rear") + " camera is active. Frames stay on this device.";
    haptics.playGroup("confirmation");
  } catch (error) {
    shutdownCamera();
    $("cameraStatus").textContent = "Camera error: " + error.message;
    notify("Could not start camera. Check HTTPS, permissions and browser settings.");
  }
}
function setupCamera() {
  $("cameraFront").addEventListener("click", () => startCamera("user"));
  $("cameraBack").addEventListener("click", () => startCamera("environment"));
  $("cameraStop").addEventListener("click", () => { shutdownCamera(); notify("Camera stopped."); });
  $("cameraCapture").addEventListener("click", () => {
    try { camera.capture(); haptics.playGroup("confirmation"); notify("Image saved to downloads."); }
    catch (error) { notify(error.message); }
  });
  $("startSensors").addEventListener("click", async () => {
    try {
      $("sensorStatus").textContent = "Requesting orientation access…";
      await camera.watchOrientation(({ relative, alpha }) => {
        if (currentTab !== "camera") { camera.stopOrientation(); return; }
        $("angleReadout").textContent = relative.toFixed(1) + "°";
        $("sensorStatus").textContent = "Sensor alpha: " + alpha.toFixed(1) + "°. Relative to the first received sample.";
      });
    } catch (error) {
      $("sensorStatus").textContent = "Sensor error: " + error.message;
      notify("Orientation readings unavailable.");
    }
  });
}
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    haptics.playGroup("navigation");
    navigate(button.dataset.tab);
  });
});
document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.open));
});
document.querySelectorAll("[data-haptic-group]").forEach((button) => {
  button.addEventListener("click", () => haptics.playGroup(button.dataset.hapticGroup));
});
window.addEventListener("hashchange", () => navigate(location.hash.slice(1), false));
window.addEventListener("pagehide", () => { shutdownCamera(); camera.stopOrientation(); motionBench?.stop(); haptics.stop(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { shutdownCamera(); camera.stopOrientation(); motionBench?.stop(); haptics.stop(); }
});
setupHaptics();
setupCamera();
setupIdeas();
setupLabIndex();
motionBench = setupVibroMotion({ haptics, notify, isActive: () => currentTab === "motion" });
navigate(location.hash.slice(1) || "home", !location.hash);
