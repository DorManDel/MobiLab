// MobiLab — shared haptic feedback engine (web implementation).
// Timing-only: the Web Vibration API does NOT expose motor amplitude.
export const GROUPS = [
  { id: "navigation", name: "Navigation", description: "Tabs, menu items, moving between screens", defaultPreset: "tick", button: "Open menu" },
  { id: "primary", name: "Primary actions", description: "Main CTA, start, submit, play", defaultPreset: "light", button: "Launch action" },
  { id: "confirmation", name: "Confirmation", description: "Saved, applied, completed", defaultPreset: "success", button: "Confirm" },
  { id: "warning", name: "Warning", description: "Important but non-destructive prompts", defaultPreset: "warning", button: "Show warning" },
  { id: "error", name: "Error", description: "Invalid field, failed action", defaultPreset: "error", button: "Try invalid" },
  { id: "carousel", name: "Carousel / dial", description: "Small tactile ticks on movement", defaultPreset: "tick", button: "Next item" }
];

export const PRESETS = {
  off:     { name: "Off",       pattern: [], note: "Silent" },
  tick:    { name: "Tick",      pattern: [12], note: "One tiny tap" },
  light:   { name: "Light",     pattern: [22], note: "Short pulse" },
  medium:  { name: "Medium",    pattern: [42], note: "Medium pulse" },
  strong:  { name: "Long",      pattern: [85], note: "Longer duration, not necessarily higher physical intensity" },
  double:  { name: "Double",    pattern: [20, 55, 20], note: "Two taps" },
  whisper: { name: "Micro",     pattern: [8], note: "Very short request; hardware may ignore pulses this brief" },
  snap:    { name: "Snap",      pattern: [30, 25, 15], note: "Sharp-feeling two-step timing" },
  triple:  { name: "Triple",    pattern: [20, 45, 20, 45, 20], note: "Three short taps" },
  heartbeat: { name: "Heartbeat", pattern: [25, 90, 55, 230, 25], note: "Low-high spaced rhythm" },
  bounce:  { name: "Bounce",    pattern: [75, 35, 42, 35, 20], note: "Three decreasing pulse lengths" },
  ripple:  { name: "Ripple",    pattern: [12, 60, 25, 60, 40], note: "Three increasing pulse lengths" },
  roll:    { name: "Drumroll",  pattern: [20, 25, 20, 25, 20, 25, 20, 25, 20], note: "Five rapid taps" },
  rhythm:  { name: "Rhythm",    pattern: [70, 85, 30, 75, 70], note: "Long-short-long motif" },
  sweep:   { name: "Sweep",     pattern: [35, 130, 80, 110, 140], note: "Progressive pulse durations, NOT a motor frequency sweep" },
  rumble:  { name: "Rumble",    pattern: [150, 40, 150, 40, 150], note: "Repeated sustained pulses; use only for short tests" },
  orbit:   { name: "Orbit",     pattern: [105, 85, 105, 85, 105], note: "Three evenly spaced longer pulses" },
  success: { name: "Success",   pattern: [17, 48, 45], note: "Short then long" },
  warning: { name: "Warning",   pattern: [45, 55, 45], note: "Two clear taps" },
  error:   { name: "Error",     pattern: [65, 45, 65, 45, 85], note: "Triple pulse" },
  custom:  { name: "Custom",    pattern: [25, 45, 35], note: "User-defined pattern" }
};
const KEY="mobilab.haptics.v1";
function clamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : min;
}
export function sanitizePattern(pattern) {
  if (!Array.isArray(pattern)) return [];
  return pattern.slice(0, 9).map((value) => clamp(value, 0, 300));
}
function makeDefaults() {
  return {
    enabled: true,
    groups: Object.fromEntries(GROUPS.map((group) => [group.id, group.defaultPreset])),
    custom: [25, 45, 35]
  };
}
export class HapticEngine {
  constructor() {
    this.config = makeDefaults();
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "null");
      if (stored && typeof stored === "object") {
        this.config.enabled = stored.enabled !== false;
        for (const group of GROUPS) {
          const value = stored.groups?.[group.id];
          if (typeof value === "string" && Object.hasOwn(PRESETS, value)) {
            this.config.groups[group.id] = value;
          }
        }
        if (Array.isArray(stored.custom)) this.config.custom = sanitizePattern(stored.custom);
      }
    } catch (_) { /* Browser storage can be disabled. Defaults still work. */ }
  }
  get supported() { return typeof navigator.vibrate === "function"; }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.config)); } catch (_) {}
  }
  setEnabled(value) {
    this.config.enabled = Boolean(value);
    if (!this.config.enabled) this.stop();
    this.save();
  }
  setGroup(groupId, presetId) {
    if (!GROUPS.some((group) => group.id === groupId) || !Object.hasOwn(PRESETS, presetId)) return;
    this.config.groups[groupId] = presetId;
    this.save();
  }
  setCustom(pattern) {
    this.config.custom = sanitizePattern(pattern);
    this.save();
  }
  pattern(presetId) {
    return presetId === "custom" ? [...this.config.custom] : [...(PRESETS[presetId]?.pattern || [])];
  }
  play(pattern, { ignoreEnabled = false } = {}) {
    if (!ignoreEnabled && !this.config.enabled) return { ok: false, reason: "Haptics disabled" };
    if (!this.supported) return { ok: false, reason: "Vibration API unavailable" };
    const safePattern = sanitizePattern(pattern);
    if (!safePattern.length || safePattern.every((entry) => entry === 0)) {
      this.stop();
      return { ok: true, reason: "Silent pattern" };
    }
    const ok = navigator.vibrate(safePattern);
    return { ok: Boolean(ok), reason: ok ? "Pattern requested" : "Vibration request rejected" };
  }
  playPreset(presetId) { return this.play(this.pattern(presetId)); }
  playGroup(groupId) { return this.playPreset(this.config.groups[groupId] || "off"); }
  stop() { if (this.supported) navigator.vibrate(0); }
  reset() { this.config = makeDefaults(); this.stop(); this.save(); }
  export() {
    return JSON.stringify({
      schema: "MobiLab.HapticProfiles.v1",
      exportedAt: new Date().toISOString(),
      ...this.config
    }, null, 2);
  }
}
