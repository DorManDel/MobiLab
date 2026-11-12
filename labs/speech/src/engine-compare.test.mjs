import assert from "node:assert/strict";
import { lexicalAgreement, normalizeComparisonTokens, createChromeTranslatorAdapter } from "./engine-compare.js";

assert.deepEqual(normalizeComparisonTokens("שלום, עולם!"), ["שלום", "עולם"]);
assert.equal(lexicalAgreement("hello world", "world hello"), 1);
assert.equal(lexicalAgreement("hello world", "hello there"), 1 / 3);
assert.equal(lexicalAgreement("", "hello"), null);

let availabilityCalls = 0;
let createCalls = 0;
let translateCalls = 0;
let destroyCalls = 0;
const fakeScope = {
  Translator: {
    async availability({ sourceLanguage, targetLanguage }) {
      availabilityCalls++;
      assert.equal(sourceLanguage, "he");
      assert.equal(targetLanguage, "en");
      return "available";
    },
    async create({sourceLanguage, targetLanguage}) {
      createCalls++;
      return {
        async translate(text) { translateCalls++; return "translated:" + text; },
        destroy() { destroyCalls++; }
      };
    }
  }
};
const adapter = createChromeTranslatorAdapter(fakeScope);
assert.equal(adapter.supported(), true);
const out = await Promise.all([
  adapter.translate("שלום", "he", "en"),
  adapter.translate("עולם", "he", "en")
]);
assert.deepEqual(out, ["translated:שלום", "translated:עולם"]);
assert.equal(availabilityCalls, 1);
assert.equal(createCalls, 1);
assert.equal(translateCalls, 2);
adapter.dispose();
assert.equal(destroyCalls, 1);
assert.equal(createChromeTranslatorAdapter({}).supported(), false);

console.log("Speech engine adapter checks passed: tokens, overlap, adapter caching, parallel reuse and disposal.");
