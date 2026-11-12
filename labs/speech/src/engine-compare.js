/**
 * MobiLab: optional browser-native translation and comparison helpers.
 * No API key, network proxy, or third-party dependencies.
 * Browser Translator availability is currently desktop-only in Chrome/Edge.
 * The module does NOT claim that lexical agreement means translation accuracy.
 */
export function normalizeComparisonTokens(value) {
  return (value || "")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
}

/**
 * Compare two independent translations using token-set overlap.
 * Returns a lexical agreement estimate, NOT a correctness/confidence score.
 */
export function lexicalAgreement(first, second) {
  const a = new Set(normalizeComparisonTokens(first));
  const b = new Set(normalizeComparisonTokens(second));
  if (!a.size || !b.size) return null;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : null;
}

export function hasChromeTranslator(scope = globalThis) {
  return typeof scope.Translator?.availability === "function"
    && typeof scope.Translator?.create === "function";
}

/**
 * A lazy, user-opt-in adapter. A language pack may download the first time.
 * All status messages are emitted via callback, not assumed.
 */
export function createChromeTranslatorAdapter(scope = globalThis) {
  const instances = new Map();
  const inflight = new Map();
  let closed = false;

  async function ensure(sourceLanguage, targetLanguage, onStatus = () => {}) {
    if (closed) throw new Error("This adapter was disposed.");
    if (!hasChromeTranslator(scope)) {
      throw new Error("Chrome on-device Translator is unavailable in this browser.");
    }
    const pair = sourceLanguage + "|" + targetLanguage;
    if (instances.has(pair)) return instances.get(pair);
    if (inflight.has(pair)) return inflight.get(pair);

    const request = (async () => {
      const options = { sourceLanguage, targetLanguage };
      const availability = await scope.Translator.availability(options);
      if (availability === "unavailable") {
        throw new Error("On-device translation is unavailable for " + pair + ".");
      }
      if (availability === "downloadable" || availability === "downloading") {
        onStatus("Language model download may be required for " + pair + ".");
      } else {
        onStatus("On-device language model ready for " + pair + ".");
      }
      const instance = await scope.Translator.create({
        ...options,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (typeof event.loaded === "number") {
              onStatus("Downloading on-device language pack: " + Math.round(event.loaded * 100) + "%");
            }
          });
        }
      });
      if (closed) {
        instance.destroy?.();
        throw new Error("Adapter was disposed during download.");
      }
      instances.set(pair, instance);
      return instance;
    })().finally(() => inflight.delete(pair));

    inflight.set(pair, request);
    return request;
  }
  return {
    name: "Chrome on-device Translator",
    supported: () => hasChromeTranslator(scope),
    async translate(text, sourceLanguage, targetLanguage, onStatus) {
      if (sourceLanguage === targetLanguage) return text;
      const translator = await ensure(sourceLanguage, targetLanguage, onStatus);
      return translator.translate(text);
    },
    dispose() {
      closed = true;
      for (const instance of instances.values()) instance.destroy?.();
      instances.clear();
    }
  };
}
