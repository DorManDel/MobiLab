// MobiLab Pattern Editor — UI adapter. The portable runtime is src/haptics.js.
// Timing is in milliseconds. Web Vibration API cannot set motor amplitude.
const MAX_STEPS = 32;
const $ = (id) => document.getElementById(id);
const clamp = (v, min, max) => Math.min(max, Math.max(min, Number.isFinite(+v) ? Math.round(+v) : min));

export function compileSteps(steps) {
  const pattern = [];
  let expected = "on";
  for (const step of steps) {
    const ms = clamp(step.ms, 0, 120000);
    if (!ms || !["on", "off"].includes(step.kind)) continue;
    if (step.kind === expected) {
      pattern.push(ms);
      expected = expected === "on" ? "off" : "on";
    } else if (pattern.length) {
      pattern[pattern.length - 1] += ms; // Adjacent same-kind segments are continuous.
    } else {
      pattern.push(0, ms); // Leading delay must begin with a zero-length ON.
      expected = "on";
    }
  }
  return pattern;
}
export function patternToSteps(pattern) {
  return pattern.map((ms, i) => ({ kind: i % 2 ? "off" : "on", ms: Math.max(0, +ms || 0) }));
}
export function setupPatternEditor({ haptics, notify, onCatalogChange, playResult, download, drawWaveform }) {
  let steps = patternToSteps(haptics.config.custom);
  let editingId = null;
  const list = $("patternSegments");
  const name = $("patternName");
  const library = $("savedPatterns");
  const limit = $("segmentLimitSeconds");
  const msLimit = () => clamp(limit.value, 1, 120) * 1000;
  function pattern() { return compileSteps(steps); }
  function refreshLibrary() {
    const previous = editingId;
    library.replaceChildren(new Option("New pattern", ""));
    for (const [id, item] of Object.entries(haptics.config.saved)) {
      library.add(new Option(item.name, id));
    }
    library.value = previous && haptics.config.saved[previous] ? previous : "";
  }
  function refreshSummary() {
    const p = pattern();
    const total = p.reduce((s, ms) => s + ms, 0);
    const motorOn = p.filter((_, i) => !(i % 2)).reduce((s, ms) => s + ms, 0);
    $("patternTotal").textContent = (total / 1000).toFixed(2) + "s total · " +
      (motorOn / 1000).toFixed(2) + "s requested ON";
    $("patternRuntimeNote").textContent = total > 15000
      ? "This design exceeds the 15s playback guard; preview will be truncated. The browser may impose a smaller limit."
      : "Timing is editable. Web mode cannot change motor power or frequency.";
    drawWaveform($("customWaveform"), p);
  }
  function render() {
    list.replaceChildren();
    steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "pattern-step";
      const head = document.createElement("div");
      head.className = "pattern-step-label";
      const kind = document.createElement("select");
      kind.setAttribute("aria-label", "Step " + (index + 1) + " type");
      kind.add(new Option("〰 Vibrate", "on"), new Option("⏳ Delay", "off"));
      kind.value = step.kind;
      kind.addEventListener("change", () => { step.kind = kind.value; render(); });
      const order = document.createElement("span");
      order.textContent = String(index + 1).padStart(2, "0");
      head.append(order, kind);
      const slider = document.createElement("input");
      slider.type = "range"; slider.min = "0"; slider.max = String(msLimit()); slider.step = "10";
      slider.value = String(Math.min(step.ms, msLimit()));
      slider.setAttribute("aria-label", "Step " + (index + 1) + " duration in milliseconds");
      const numeric = document.createElement("input");
      numeric.type = "number"; numeric.min = "0"; numeric.max = String(msLimit()); numeric.step = "1";
      numeric.value = String(step.ms);
      numeric.setAttribute("aria-label", "Step " + (index + 1) + " milliseconds");
      const unit = document.createElement("span"); unit.textContent = "ms";
      slider.addEventListener("input", () => { step.ms = +slider.value; numeric.value = slider.value; refreshSummary(); });
      numeric.addEventListener("change", () => { step.ms = clamp(numeric.value, 0, msLimit()); numeric.value = step.ms; slider.value = step.ms; refreshSummary(); });
      const controls = document.createElement("div"); controls.className = "pattern-step-controls";
      for (const [symbol, delta, title] of [["↑",-1,"Move up"],["↓",1,"Move down"]]) {
        const btn = document.createElement("button"); btn.type = "button"; btn.textContent = symbol;
        btn.className = "btn btn-ghost pattern-step-move"; btn.title = title;
        btn.setAttribute("aria-label", title + " step " + (index + 1));
        btn.disabled = index + delta < 0 || index + delta >= steps.length;
        btn.addEventListener("click", () => {
          [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
          render();
        });
        controls.append(btn);
      }
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×";
      remove.className = "btn btn-ghost pattern-step-move"; remove.title = "Remove step";
      remove.setAttribute("aria-label", "Remove step " + (index + 1));
      remove.addEventListener("click", () => { steps.splice(index, 1); render(); });
      controls.append(remove);
      const duration = document.createElement("div"); duration.className = "pattern-duration";
      duration.append(slider, numeric, unit);
      row.append(head, duration, controls); list.append(row);
    });
    $("patternStepCount").textContent = steps.length + " / " + MAX_STEPS + " segments";
    refreshSummary();
  }
  function add(kind) {
    if (steps.length >= MAX_STEPS) { notify("32 steps maximum per pattern."); return; }
    steps.push({ kind, ms: kind === "on" ? 350 : 180 });
    render();
  }
  function load(id) {
    editingId = id && haptics.config.saved[id] ? id : null;
    if (editingId) {
      const item = haptics.config.saved[editingId];
      name.value = item.name;
      steps = patternToSteps(item.pattern);
    } else {
      name.value = "";
      steps = patternToSteps(haptics.config.custom);
    }
    library.value = editingId || "";
    render();
  }
  function save() {
    const title = name.value.trim().slice(0, 60);
    if (!title) { notify("Give this pattern a name before saving."); name.focus(); return; }
    const compiled = pattern();
    if (!compiled.length || !compiled.some((v, i) => !(i % 2) && v > 0)) {
      notify("Add at least one ON pulse before saving."); return;
    }
    try {
      editingId = haptics.saveNamed(title, compiled, editingId);
      haptics.setCustom(compiled);
      refreshLibrary();
      onCatalogChange();
      notify("Saved “" + title + "” locally. Assign it to any button group.");
    } catch (error) { notify(error.message); }
  }
  $("addPulse").addEventListener("click", () => add("on"));
  $("addPause").addEventListener("click", () => add("off"));
  $("clearPattern").addEventListener("click", () => { steps = []; editingId = null; library.value = ""; render(); });
  $("testCustom").addEventListener("click", () => playResult(haptics.play(pattern())));
  $("saveCustom").addEventListener("click", save);
  $("deletePattern").addEventListener("click", () => {
    if (!editingId || !haptics.config.saved[editingId]) { notify("Choose a saved pattern first."); return; }
    if (!confirm("Remove this saved pattern? Assignments will use Off.")) return;
    haptics.deleteNamed(editingId);
    editingId = null; refreshLibrary(); load(""); onCatalogChange();
    notify("Saved pattern removed.");
  });
  library.addEventListener("change", () => load(library.value));
  limit.addEventListener("change", () => {
    limit.value = clamp(limit.value, 1, 120);
    steps.forEach((step) => { step.ms = Math.min(msLimit(), step.ms); });
    render();
  });
  $("exportPatternModule").addEventListener("click", () => {
    const p = pattern();
    const js = "// Generated by MobiLab — browser timing only, no motor amplitude.\n" +
      "export const pattern = " + JSON.stringify(p) + ";\n" +
      "export const name = " + JSON.stringify(name.value.trim() || "Untitled") + ";\n" +
      "export function play() { return typeof navigator.vibrate === 'function' && navigator.vibrate(pattern); }\n" +
      "export function stop() { if (typeof navigator.vibrate === 'function') navigator.vibrate(0); }\n";
    download("mobilab-haptic-pattern.mjs", js, "text/javascript");
  });
  $("exportPatternJSON").addEventListener("click", () => {
    download("mobilab-haptic-pattern.json", JSON.stringify({
      schema: "MobiLab.HapticPattern.v2", name: name.value.trim() || "Untitled",
      pattern: pattern(), unit: "ms", amplitudeSupported: false
    }, null, 2));
  });
  refreshLibrary(); render();
  return { reset() { editingId = null; refreshLibrary(); load(""); },
    getPattern: pattern, load };
}
