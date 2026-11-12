/**
 * Pure benchmarking utilities and a bounded cancellable translation queue.
 * Phrases are processed sequentially, while enabled providers for one phrase
 * run concurrently. Aborted operations must not mutate current session state.
 */
export const tokenize = (value) =>
  (value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

export function wordErrorRate(reference, transcript) {
  const a = tokenize(reference), b = tokenize(transcript);
  if (!a.length) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = next;
  }
  return prev[b.length] / a.length;
}

/** Character n-gram F1 against a human supplied reference, NOT model confidence. */
export function characterSimilarity(reference, prediction, maxN = 3) {
  const normalize = (v) => (v || "").toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/gu, " ").trim();
  const a = Array.from(normalize(reference)), b = Array.from(normalize(prediction));
  if (!a.length || !b.length) return null;
  let sum = 0, terms = 0;
  for (let n = 1; n <= maxN; n++) {
    if (a.length < n || b.length < n) continue;
    const counts = (arr) => {
      const map = new Map();
      for (let i = 0; i <= arr.length - n; i++) {
        const gram = arr.slice(i, i + n).join("");
        map.set(gram, (map.get(gram) || 0) + 1);
      }
      return map;
    };
    const ref = counts(a), out = counts(b);
    let intersection = 0;
    for (const [key, count] of ref) intersection += Math.min(count, out.get(key) || 0);
    const precision = intersection / (b.length - n + 1);
    const recall = intersection / (a.length - n + 1);
    sum += precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    terms++;
  }
  return terms ? sum / terms : 0;
}

/**
 * Provider contract: { id, label, run(text, source, target, signal, onStatus) }
 * Notify: onChange(row, id, {status, text?, ms?, error?}).
 * active phrase serialized; providers for that phrase execute in parallel.
 */
export class TranslationQueue {
  constructor({ onChange, maxPending = 8, clock = () => performance.now() }) {
    this.onChange = onChange;
    this.maxPending = maxPending;
    this.clock = clock;
    this.pending = [];
    this.current = null;
    this.generation = 0;
    this.enabled = true;
    this.busy = false;
  }

  start() {
    this.enabled = true;
  }

  enqueue(row, providers) {
    if (!this.enabled) return false;
    if (!providers.length) {
      this.onChange(row, "queue", { status: "skipped", error: "No active translation providers." });
      return false;
    }
    if (this.pending.length >= this.maxPending) {
      this.onChange(row, "queue", { status: "skipped", error: "Queue full. Translate this phrase manually later." });
      return false;
    }
    this.pending.push({ row, providers });
    this.onChange(row, "queue", { status: "queued" });
    void this.drain();
    return true;
  }

  stop() {
    this.enabled = false;
    this.generation++;
    const current = this.current;
    if (current) {
      for (const task of current.tasks) {
        this.onChange(current.row, task.id, { status: "canceled", error: "Stopped by user." });
        task.controller.abort();
      }
    }
    for (const { row, providers } of this.pending) {
      for (const provider of providers) this.onChange(row, provider.id,
        { status: "canceled", error: "Stopped by user." });
    }
    this.pending.length = 0;
    this.onChange(null, "queue", { status: "stopped" });
  }

  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.enabled && this.pending.length) {
        const { row, providers } = this.pending.shift();
        const generation = this.generation;
        const tasks = providers.map(({ id }) => ({ id, controller: new AbortController() }));
        this.current = { row, tasks };
        await Promise.allSettled(providers.map(async (provider, i) => {
          const { controller } = tasks[i];
          const begin = this.clock();
          this.onChange(row, provider.id, { status: "running" });
          try {
            const text = await provider.run(row.text, row.source, row.target,
              controller.signal, (message) => {
                if (this.enabled && this.generation === generation) {
                  this.onChange(row, provider.id, { status: "running", message });
                }
              });
            if (this.enabled && generation === this.generation && !controller.signal.aborted) {
              this.onChange(row, provider.id, {
                status: "success", text, ms: Math.round(this.clock() - begin)
              });
            }
          } catch (error) {
            if (this.enabled && generation === this.generation && !controller.signal.aborted) {
              this.onChange(row, provider.id, {
                status: "error", error: error?.message || String(error),
                ms: Math.round(this.clock() - begin)
              });
            }
          }
        }));
        this.current = null;
      }
    } finally {
      this.current = null;
      this.busy = false;
      // If restarted while an earlier aborted provider was finishing,
      // resume any phrases queued after the new session begins.
      if (this.enabled && this.pending.length) void this.drain();
    }
  }
}

export function safeLibreEndpoint(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) {
    throw new Error("Enter an HTTPS LibreTranslate server URL without login/query parameters.");
  }
  if (u.pathname === "/" || !u.pathname.endsWith("/translate")) {
    u.pathname = u.pathname.replace(/\/+$/, "") + "/translate";
  }
  return u.toString();
}
