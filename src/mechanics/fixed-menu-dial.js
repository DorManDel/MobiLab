/**
 * FixedMenuDial: framework-free, mobile-first, six-station radial selector.
 * Stations never rotate/move during gestures; only selection and content update.
 * To reuse: import { FixedMenuDial } from "./fixed-menu-dial.js";
 */
export class FixedMenuDial {
  constructor({ root, items = [], visible = 6, onChange = () => {} } = {}) {
    if (!root) throw new Error("FixedMenuDial requires a root element");
    this.root = root;
    this.visible = Math.max(2, Math.min(8, Math.floor(visible)));
    this.onChange = onChange;
    this.items = [];
    this.selected = 0;
    this.pointer = null;
    this.buttons = [];
    root.replaceChildren();
    root.classList.add("fixed-menu-dial");
    root.style.setProperty("--dial-count", this.visible);
    for (let i = 0; i < this.visible; i++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fixed-menu-slot";
      button.dataset.slot = String(i);
      button.style.setProperty("--angle", (i * 360 / this.visible - 90) + "deg");
      button.style.setProperty("--index", String(i));
      button.addEventListener("click", () => {
        const itemIndex = Number(button.dataset.itemIndex);
        if (Number.isInteger(itemIndex)) this.select(itemIndex);
      });
      root.append(button);
      this.buttons.push(button);
    }
    const hub = document.createElement("div");
    hub.className = "fixed-menu-hub";
    hub.textContent = "MENU DIAL";
    hub.setAttribute("aria-hidden", "true");
    root.append(hub);
    this.onPointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = root.getBoundingClientRect();
      this.pointer = { id: event.pointerId, x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        angle: Math.atan2(event.clientY - (rect.top + rect.height / 2),
          event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI };
      root.setPointerCapture?.(event.pointerId);
    };
    this.onPointerMove = (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const angle = Math.atan2(event.clientY - this.pointer.y, event.clientX - this.pointer.x) * 180 / Math.PI;
      let delta = angle - this.pointer.angle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (Math.abs(delta) >= 22) {
        this.step(delta > 0 ? 1 : -1);
        this.pointer.angle = angle;
      }
    };
    this.onPointerUp = () => { this.pointer = null; };
    this.onKeyDown = (event) => {
      if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); this.step(1); }
      if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); this.step(-1); }
    };
    root.addEventListener("pointerdown", this.onPointerDown);
    root.addEventListener("pointermove", this.onPointerMove);
    root.addEventListener("pointerup", this.onPointerUp);
    root.addEventListener("pointercancel", this.onPointerUp);
    root.addEventListener("keydown", this.onKeyDown);
    this.setItems(items);
  }
  setItems(items) {
    this.items = (Array.isArray(items) ? items : []).slice(0, 500).map((entry, index) => ({
      id: typeof entry === "string" ? "item-" + index : String(entry.id ?? index),
      label: (typeof entry === "string" ? entry : entry.label ?? entry.id ?? "Item").toString().slice(0, 48)
    }));
    this.selected = Math.min(this.selected, Math.max(0, this.items.length - 1));
    this.render();
  }
  select(index) {
    if (!this.items.length) return;
    const next = ((index % this.items.length) + this.items.length) % this.items.length;
    this.selected = next;
    this.render();
    this.onChange(this.items[next], next);
  }
  step(amount) { this.select(this.selected + amount); }
  render() {
    const start = Math.floor(this.selected / this.visible) * this.visible;
    this.buttons.forEach((button, slot) => {
      const position = start + slot;
      const item = this.items[position];
      button.textContent = item ? item.label : "—";
      button.disabled = !item;
      button.dataset.itemIndex = item ? String(position) : "";
      button.classList.toggle("is-selected", Boolean(item && position === this.selected));
      button.setAttribute("aria-label", item ? "Select " + item.label : "Empty slot");
      button.setAttribute("aria-pressed", String(Boolean(item && position === this.selected)));
    });
    this.root.setAttribute("aria-label", this.items.length
      ? "Fixed dial: " + this.items[this.selected].label + ", " + (this.selected + 1) + " of " + this.items.length
      : "Fixed dial: no items");
  }
  getConfig() { return { schema: "MobiLab.FixedMenuDial.v1", visible: this.visible, items: this.items, selected: this.selected }; }
  destroy() {
    this.root.removeEventListener("pointerdown", this.onPointerDown);
    this.root.removeEventListener("pointermove", this.onPointerMove);
    this.root.removeEventListener("pointerup", this.onPointerUp);
    this.root.removeEventListener("pointercancel", this.onPointerUp);
    this.root.removeEventListener("keydown", this.onKeyDown);
    this.root.replaceChildren();
  }
}
