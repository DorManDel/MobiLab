import { HapticEngine, GROUPS, PRESETS } from "./haptics.js";
import { CameraLab } from "./camera.js";

// MobiLab: browser-only application shell.
// All hardware actions happen only after deliberate interaction.
const $ = (id) => document.getElementById(id);
const haptics = new HapticEngine();
const camera = new CameraLab($("cameraVideo"));
const tabs = new Set(["home", "haptics", "camera", "ideas"]);
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
  currentTab = nextTab;

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
function chosenCustomPattern() {
  return [Number($("pulseA").value), Number($("gap").value), Number($("pulseB").value)];
}
function refreshCustomEditor() {
  for (const id of ["pulseA", "gap", "pulseB"]) $(id + "Value").textContent = $(id).value + " ms";
  drawWaveform($("customWaveform"), chosenCustomPattern());
}
function refreshPresetPreview() {
  const selected = $("presetSelect").value;
  drawWaveform($("presetWaveform"), haptics.pattern(selected));
  $("presetNote").textContent = PRESETS[selected]?.note || "";
}
function playResult(result) {
  if (result.ok) notify(result.reason === "Silent pattern" ? "Silent preset selected." : "Vibration request sent. Actual feel depends on hardware.");
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
    const select = document.createElement("select");
    select.setAttribute("aria-label", group.name + " feedback profile");
    for (const [id, preset] of Object.entries(PRESETS)) {
      select.append(createOption(preset.name, id));
    }
    select.value = haptics.config.groups[group.id];
    select.addEventListener("change", () => {
      haptics.setGroup(group.id, select.value);
      notify(group.name + " assigned to " + PRESETS[select.value].name + ".");
    });
    const sample = document.createElement("button");
    sample.type = "button";
    sample.className = "btn btn-secondary";
    sample.textContent = group.button;
    sample.addEventListener("click", () => playResult(haptics.playGroup(group.id)));
    actions.append(select, sample);
    const caption = document.createElement("div");
    caption.className = "sample-note";
    caption.textContent = "Profile applies to every button in this group.";
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
  const presetSelect = $("presetSelect");
  for (const [id, preset] of Object.entries(PRESETS)) presetSelect.append(createOption(preset.name, id));
  presetSelect.value = "tick";
  presetSelect.addEventListener("change", refreshPresetPreview);
  refreshPresetPreview();
  $("testPreset").addEventListener("click", () => playResult(haptics.playPreset(presetSelect.value)));
  $("stopHaptics").addEventListener("click", () => { haptics.stop(); notify("Stop vibration requested."); });
  const custom = haptics.config.custom;
  for (const [index, id] of ["pulseA", "gap", "pulseB"].entries()) {
    $(id).value = custom[index] || 0;
    $(id).addEventListener("input", refreshCustomEditor);
  }
  refreshCustomEditor();
  $("testCustom").addEventListener("click", () => playResult(haptics.play(chosenCustomPattern())));
  $("saveCustom").addEventListener("click", () => {
    haptics.setCustom(chosenCustomPattern());
    refreshPresetPreview();
    notify("Custom pattern saved. Choose Custom in a button group.");
  });
  $("exportHaptics").addEventListener("click", () => {
    download("mobilab-haptic-profiles.json", haptics.export());
    notify("Haptic profiles exported.");
  });
  $("resetHaptics").addEventListener("click", () => {
    if (!confirm("Restore default haptic profiles and custom pattern?")) return;
    haptics.reset();
    $("enableHaptics").checked = true;
    for (const [index, id] of ["pulseA", "gap", "pulseB"].entries()) $(id).value = haptics.config.custom[index];
    refreshCustomEditor();
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
window.addEventListener("pagehide", () => { shutdownCamera(); camera.stopOrientation(); haptics.stop(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { shutdownCamera(); camera.stopOrientation(); haptics.stop(); }
});
setupHaptics();
setupCamera();
setupIdeas();
navigate(location.hash.slice(1) || "home", !location.hash);
