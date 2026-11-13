import { HapticEngine, GROUPS, PRESETS } from "./haptics.js";
import { CameraLab } from "./camera.js";
import { setupVibroMotion } from "./vibromotion.js";
import { filterAndSort, loadActivity, recordVisit, loadPreferences, savePreferences } from "./lab-catalog.mjs";

// MobiLab: browser-only application shell.
// All hardware actions happen only after deliberate interaction.
const $ = (id) => document.getElementById(id);
const haptics = new HapticEngine();
const camera = new CameraLab($("cameraVideo"));
const tabs = new Set(["home", "haptics", "camera", "motion", "ideas", "infinity"]);
let motionBench = null;
const IDEAS_KEY = "mobilab.ideas.v1";
let currentTab = "";
let toastTimeout;
let ideas = loadIdeas();
const catalogStorage = (() => { try { return window.localStorage; } catch { return null; } })();
let catalogActivity = loadActivity(catalogStorage);
let catalogPreferences = loadPreferences(catalogStorage);
let updateCatalog = () => {};

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
  const changed = currentTab !== nextTab;
  currentTab = nextTab;
  if (changed && nextTab !== "home") {
    catalogActivity = recordVisit(catalogStorage, nextTab);
    updateCatalog();
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

function setupCatalog() {
  const grid = $("labCards");
  const search = $("labSearch");
  const sort = $("labSort");
  const category = $("labCategory");
  const clear = $("clearCatalog");
  const empty = $("catalogEmpty");
  const cards = [...grid.querySelectorAll("[data-lab-id]")];
  const entries = cards.map((element) => ({
    id: element.dataset.labId,
    category: element.dataset.category,
    updated: element.dataset.updated,
    keywords: element.dataset.keywords || "",
    title: element.querySelector("strong")?.textContent || "",
    description: [...element.querySelectorAll(":scope > span:not(.card-top):not(.card-foot)")]
      .map(part => part.textContent).join(" "),
    element
  }));
  sort.value = catalogPreferences.sort;
  category.value = catalogPreferences.category;

  // Dates are manually maintained release metadata, not live GitHub API lookups.
  const formatDate = (date) => {
    const parsed = Date.parse(date + "T00:00:00Z");
    return Number.isFinite(parsed) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed) : "";
  };
  for (const entry of entries) {
    const meta = document.createElement("small");
    meta.className = "catalog-updated";
    meta.textContent = "Updated " + formatDate(entry.updated);
    entry.element.append(meta);
  }
  function render() {
    const results = filterAndSort(entries, {
      query: search.value, sort: sort.value, category: category.value, activity: catalogActivity
    });
    const ids = new Set(results.map(entry => entry.id));
    for (const entry of entries) entry.element.hidden = !ids.has(entry.id);
    const fragment = document.createDocumentFragment();
    for (const entry of results) fragment.append(entry.element);
    grid.append(fragment);
    const count = results.length;
    $("labCount").textContent = count === entries.length ? entries.length + " MODULES" : count + " / " + entries.length + " MODULES";
    $("catalogStatus").textContent = search.value.trim() || category.value !== "all"
      ? count + " result" + (count === 1 ? "" : "s") + " found" : "";
    empty.hidden = count > 0;
    clear.hidden = !search.value && category.value === "all" && sort.value === "recommended";
  }
  updateCatalog = render;
  search.addEventListener("input", () => {
    if (search.value.trim() && currentTab !== "home") {
      navigate("home");
      requestAnimationFrame(() => $("catalogAnchor").scrollIntoView({ behavior: "auto", block: "start" }));
    }
    render();
  });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { search.value = ""; render(); search.blur(); }
    if (event.key === "Enter") {
      const first = grid.querySelector("[data-lab-id]:not([hidden])");
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  for (const selector of [sort, category]) selector.addEventListener("change", () => {
    catalogPreferences = { sort: sort.value, category: category.value };
    savePreferences(catalogStorage, catalogPreferences);
    render();
  });
  clear.addEventListener("click", () => {
    search.value = ""; sort.value = "recommended"; category.value = "all";
    catalogPreferences = { sort: sort.value, category: category.value };
    savePreferences(catalogStorage, catalogPreferences);
    render();
    search.focus();
  });
  document.addEventListener("click", (event) => {
    // External lab pages are navigated by regular links, not navigate().
    const link = event.target instanceof Element ? event.target.closest("a[data-lab-id]") : null;
    if (!link) return;
    catalogActivity = recordVisit(catalogStorage, link.dataset.labId);
    render();
  });
  document.addEventListener("keydown", (event) => {
    const element = event.target;
    const editing = element instanceof Element && (element.closest("input, textarea, select, [contenteditable]") !== null);
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !editing) {
      event.preventDefault(); search.focus(); search.select();
    }
  });
  render();
}

function setupMobileNavigation() {
  const home = $("mobileHome"), explore = $("mobileExplore"), recent = $("mobileRecent");
  const density = $("densityToggle"), cards = $("labCards"), sort = $("labSort"), category = $("labCategory"), search = $("labSearch");
  const buttons = [home, explore, recent];
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const selectNav = (target) => {
    buttons.forEach(button => {
      const active = button === target;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  };
  const toCatalog = (recentOnly = false) => {
    if (recentOnly) {
      search.value = "";
      category.value = "all";
      sort.value = "recently-opened";
      category.dispatchEvent(new Event("change"));
    }
    navigate("home");
    selectNav(recentOnly ? recent : explore);
    requestAnimationFrame(() => $("catalogAnchor").scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth", block: "start"
    }));
  };
  home.addEventListener("click", () => { navigate("home"); selectNav(home); });
  explore.addEventListener("click", () => toCatalog(false));
  recent.addEventListener("click", () => toCatalog(true));
  const key = "mobilab.catalog.density.v1";
  let compact = true;
  try { const saved = localStorage.getItem(key); if (saved === "cards") compact = false; } catch { /* Storage optional. */ }
  const applyDensity = () => {
    cards.classList.toggle("is-compact", compact);
    density.textContent = compact ? "☷ Compact" : "▦ Cards";
    density.setAttribute("aria-pressed", String(compact));
  };
  density.addEventListener("click", () => {
    compact = !compact;
    try { localStorage.setItem(key, compact ? "compact" : "cards"); } catch { /* Storage optional. */ }
    applyDensity();
  });
  applyDensity();
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
const presetIds = Object.keys(PRESETS);
let activePresetIndex = Math.max(0, presetIds.indexOf("tick"));
function selectedPresetId() { return presetIds[activePresetIndex]; }
function dialChange(amount, feedback = true) {
  activePresetIndex = (activePresetIndex + amount + presetIds.length) % presetIds.length;
  refreshPresetPreview();
  if (feedback) haptics.playPreset("tick");
}
function refreshPresetPreview() {
  const selected = selectedPresetId();
  drawWaveform($("presetWaveform"), haptics.pattern(selected));
  $("presetNote").textContent = PRESETS[selected]?.note || "";
  $("dialPresetLabel").textContent = PRESETS[selected]?.name || "Unknown";
  $("presetPosition").textContent = String(activePresetIndex + 1).padStart(2, "0") + " / " + presetIds.length;
  const ms = haptics.pattern(selected).reduce((sum, n) => sum + n, 0);
  $("presetDuration").textContent = ms + " ms total";
  $("dialTicks").style.setProperty("--dial-angle", activePresetIndex * 17 + "deg");
  $("presetPlay").setAttribute("aria-label", "Test " + PRESETS[selected].name + " pattern");
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
      selected.textContent = PRESETS[id].name;
      haptics.playPreset("tick");
    }
    previous.addEventListener("click", () => setSelection(-1));
    next.addEventListener("click", () => setSelection(1));
    selected.textContent = PRESETS[haptics.config.groups[group.id]]?.name || "Off";
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
window.addEventListener("pagehide", () => { shutdownCamera(); camera.stopOrientation(); motionBench?.stop(); haptics.stop(); });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { shutdownCamera(); camera.stopOrientation(); motionBench?.stop(); haptics.stop(); }
});
setupHaptics();
setupCamera();
setupIdeas();
setupCatalog();
setupMobileNavigation();
motionBench = setupVibroMotion({ haptics, notify, isActive: () => currentTab === "motion" });
navigate(location.hash.slice(1) || "home", !location.hash);
