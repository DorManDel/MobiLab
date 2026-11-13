# Live Subtitle Studio — beta 0.4

## Goals
Give a phone-first, legible live translation experience while exposing the real sources of latency. Three display modes share one transcript and provider pipeline; visual transitions do not represent changes in recognition speed.

## UI
- **Bottom:** current subtitle at the bottom of a compact preview; interim source above it.
- **Rising:** last three translated caption lines rise and fade like lyrics. CSS composited animations; no growing DOM.
- **Ticker:** one translated line scrolls horizontally like an RSS/news feed. CSS animation; motion stops when reduced-motion is requested.
- Language selectors + Start/Finish recording appear before advanced controls at the top, without needing to scroll on a phone.
- Quick sound button runs the latest translated text through existing speech synthesis (mic must be stopped to prevent feedback).

## Paragraph grouping and display engine stability (v0.4)

- The browser's finalized speech fragments are accumulated until an inactivity threshold (default 1.6 s) measured from browser result updates; ongoing interim updates reset the timer. A word cap triggers a safety flush. This approximates a speaking turn; it is **not** a physical silence detector.
- Translate one completed paragraph at a time. The prior 4/9-word segmentation is no longer the default, so punctuation and adjacent speech fragments can retain context.
- Select the subtitle viewport line count independently (1–3). A visual clamp does not cut up the translation request. In Paragraphs view, complete translated paragraphs append to a bounded scrollable window. Full text session history is still retained separately.
- The selected **display translation provider** (default MyMemory) controls the rendered subtitle. Once set on a paragraph, its result is immutable even if other translators finish later; model comparison remains available below.
- The floating microphone/language UI is exposed as a self-contained Web Component. It emits `speech:toggle`, `speech:language-change` and `speech:display-change`. Host invokes `setState({listening,source,target,mode})`. The component never captures microphone or sends network requests.
- Late provider timestamps are still recorded for benchmarking, but final-to-subtitle latency is measured when the selected provider's result becomes displayable.
- Finishing recording cancels outstanding earlier work; the final unfinished paragraph may make one new explicit translation request when auto-translate is enabled. This should not be confused with the prior endless-queue behavior.

## Processing and low-latency tradeoffs
1. Web Speech API delivers provisional (interim) text and eventually a final result; it does **not** expose low-level audio buffers to the page or a guarantee for when finalization occurs.
2. **Interim source** is shown immediately; it is not stored as an accurate transcript.
3. Optional **Early Draft** (off by default): after an interim hypothesis of at least four words settles for 650ms, request an early MyMemory translation. Throttle to at most about one attempt per 3.6s, cap draft size and abort/ignore superseded or stopped results. Costs provider quota and may be wrong.
4. On a final result, save the finalized text. **Sentence** mode keeps the entire phrase; **Line** splits that finalized text at 9 words (or punctuation); **Short** at 4 words. This is text segmentation after STT and does NOT cause earlier STT finalization or guarantee semantically correct word boundaries.
5. **Live priority** (default when microphone on): one active phrase is translated at a time and at most two waiting translations are kept. If speech outpaces the provider, older waiting translations are explicitly skipped in the queue to catch up; *their transcript rows remain*, and the user can retranslate them later. **Complete** mode keeps every queued phrase up to the configured queue cap and can lag behind.
6. A sentence/line may be translated through multiple selected providers concurrently (cloud, desktop Chrome on-device, or optional user-controlled LibreTranslate server), but this does not combine independent STT engines.

## Latency metrics — what they mean
- **Speech start → final**: time between the browser's speechstart event and the final result event. This includes speaking duration and recognition; it is **not** STT compute latency or full acoustic-to-display time.
- **Queue wait**: from the browser's final result event until a provider starts processing a specific queued finalized line. If several lines were created from one final result, this includes earlier lines.
- **Provider**: from beginning of provider processing to its answer (can include local model initialization/download). Provider duration excludes queue wait.
- **Final → subtitle**: from final STT event to the first successful translation of that saved line, rendered in the preview. This is our current most useful final-text-to-caption latency measurement.
- **p50 / p90**: nearest-rank percentiles of the most recent 60 completed finalized lines; measurements exclude canceled/skipped lines, which must be reported separately to assess experience honestly.
- **Early Draft latency**: separately described as the time from early translation request to receiving its result. It is *not* audio-to-subtitle delay.
- We cannot measure absolute speech onset from samples, true end-of-word timing, or end-to-end acoustic latency without a timestamped audio input adapter.

## Measuring fairly
- Collect at least 20 utterances in a quiet environment and then noise; record device/browser, spoken/source language, target language, provider(s), chunk setting, early draft setting and auto-translate setting.
- Record p50/p90 Final → subtitle, total skipped/canceled phrases, STT WER against a human reference and translation quality against a human-verified reference (character n-gram similarity alone is not a semantic metric).
- To compare providers, send the exact same finalized text and show per-provider latency, errors and raw text; do not average unrelated runs or call lexical overlap accuracy.

## Future input adapters (not implemented)
- **Desktop Chrome** may offer opt-in tab/window/system-audio capture with navigator.mediaDevices.getDisplayMedia({video:true,audio:true}) in a secure context. Audio availability depends on browser/OS/user selection and the returned stream may have no audio track. Critically: a returned MediaStream cannot be fed directly into the existing Web Speech SpeechRecognition API as arbitrary audio; we need an audio streaming STT adapter.
- **Android web** does not provide arbitrary other-app audio capture. A native Android app may use permitted MediaProjection/playback capture for eligible audio with consent, subject to restrictions; telephone calls/protected media are not freely capturable.
- For simultaneous spoken translation, build turn-taking with echo cancellation, a true streaming multilingual STT adapter, incremental machine translation and a TTS output queue. The current browser synthesizer needs a user gesture and we deliberately avoid playing audio into the listening mic.

## Runtime status
Node unit/DOM tests and mocked mobile Chromium interaction tests pass in CI. Real phone mic, TTS, provider response, latency numbers and Pages release must be tested separately. No made-up timing benchmarks.
