/**
 * Portable Settings Mechanism view. Mount in any HTML element.
 * Uses SettingsStore; bring settings-panel.css and your own section renderer as needed.
 */
export function mountSettingsPanel({ root, store, renderSection } = {}) {
  if (!root || !store || typeof store.subscribe !== "function") {
    throw new Error("mountSettingsPanel requires a root element and a SettingsStore");
  }
  let activeIndex = 0;
  const nav = document.createElement("nav");
  nav.className = "ml-settings-tabs";
  nav.setAttribute("aria-label", "Settings sections");
  const body = document.createElement("div");
  body.className = "ml-settings-content";
  root.classList.add("ml-settings-root");
  root.replaceChildren(nav, body);
  function render(config) {
    nav.replaceChildren();
    activeIndex = Math.min(activeIndex, Math.max(0, config.tabs.length - 1));
    config.tabs.forEach((tab, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tab;
      button.className = "ml-settings-tab";
      button.classList.toggle("is-selected", i === activeIndex);
      button.setAttribute("aria-selected", String(i === activeIndex));
      button.addEventListener("click", () => { activeIndex = i; render(store.get()); });
      nav.append(button);
    });
    body.replaceChildren();
    body.classList.toggle("compact", config.density === "compact");
    const tab = config.tabs[activeIndex] || "General";
    if (typeof renderSection === "function") {
      renderSection({ tab, container: body, config, update: (patch) => store.set(patch) });
      return;
    }
    const heading = document.createElement("h3");
    heading.textContent = tab;
    const intro = document.createElement("p");
    intro.textContent = "Reusable settings section. Replace this example using renderSection.";
    body.append(heading, intro);
    for (const label of ["Enable effect", "Sensitivity", "Advanced options"]) {
      const item = document.createElement("div");
      item.className = "ml-settings-field";
      item.textContent = label;
      body.append(item);
    }
  }
  const unsubscribe = store.subscribe(render);
  return {
    destroy() { unsubscribe(); root.replaceChildren(); root.classList.remove("ml-settings-root"); },
    selectTab(index) { activeIndex = Math.max(0, Math.floor(index)); render(store.get()); }
  };
}
