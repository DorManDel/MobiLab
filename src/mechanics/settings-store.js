/**
 * Portable settings state, no DOM, framework or network requirements.
 * UI adapters may render the state as a drawer, sheet or modal.
 */
export const DEFAULT_SETTINGS = Object.freeze({
  layout: "right", panelSize: 46, opacity: 92, blur: 18, density: "comfortable",
  accent: "purple", animation: true, tabs: ["Appearance", "Interaction", "Accessibility", "Debug"]
});
const layouts = ["right", "bottom", "corner", "full"];
const densities = ["comfortable", "compact"];
const accents = ["purple", "yellow", "mint"];
const bounded = (v, low, high) => Math.max(low, Math.min(high, Number.isFinite(Number(v)) ? Math.round(Number(v)) : low));
export function normalizeSettings(input = {}) {
  const base = { ...DEFAULT_SETTINGS, ...(input && typeof input === "object" ? input : {}) };
  return {
    layout: layouts.includes(base.layout) ? base.layout : DEFAULT_SETTINGS.layout,
    panelSize: bounded(base.panelSize, 25, 100),
    opacity: bounded(base.opacity, 45, 100),
    blur: bounded(base.blur, 0, 40),
    density: densities.includes(base.density) ? base.density : DEFAULT_SETTINGS.density,
    accent: accents.includes(base.accent) ? base.accent : DEFAULT_SETTINGS.accent,
    animation: Boolean(base.animation),
    tabs: (Array.isArray(base.tabs) ? base.tabs : DEFAULT_SETTINGS.tabs).slice(0, 12)
      .map(value => String(value).trim().slice(0, 30)).filter(Boolean)
  };
}
export class SettingsStore {
  constructor(initial = DEFAULT_SETTINGS) {
    this.state = normalizeSettings(initial);
    this.listeners = new Set();
  }
  get() { return { ...this.state, tabs: [...this.state.tabs] }; }
  set(partial) {
    this.state = normalizeSettings({ ...this.state, ...partial });
    for (const listener of this.listeners) listener(this.get());
    return this.get();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.get());
    return () => this.listeners.delete(listener);
  }
  reset() { return this.set(DEFAULT_SETTINGS); }
  export() { return { schema: "MobiLab.SettingsMechanism.v1", ...this.get() }; }
  import(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    if (!data || data.schema !== "MobiLab.SettingsMechanism.v1") throw new Error("Unrecognized settings schema");
    return this.set(data);
  }
}
