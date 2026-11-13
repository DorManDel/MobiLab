# Speech & Translate Lab — Local Translation & Media Input beta 0.6

Entry point: ./index.html, linked as a tab and overview card in MobiLab.

## Beta 0.6 — independent local translation and optional media-file transcription

**Problem:** anonymous MyMemory HTTP429 exhausted the public quota. Connecting a different provider should not keep sending the same words to MyMemory. Hosted free APIs are never guaranteed unlimited.

**New desktop setup:** use [services/speech-node/README.md](../../services/speech-node/README.md). It includes a Docker Compose LibreTranslate engine with Hebrew-English Argos models on PC loopback only (no daily external API character quota) and a Python FastAPI Speech Node that serves the same web lab.

- Click **Use local PC node** from http://127.0.0.1:8765/labs/speech/ to choose LibreTranslate as the primary translation engine; **Test my engine** checks installed language pairs. When local is selected, cloud requests are suppressed unless the user explicitly checks the independent MyMemory comparison option.
- In GitHub Pages on Android, localhost means the phone itself. Use the PC node via an **authenticated HTTPS** tunnel/private hostname and the in-memory access token if remote; do not expose unauthenticated Docker/Node services.
- The local node can optionally load **faster-whisper** for uploaded WAV/MP3/M4A/MP4/etc media files. Choose a file, send it to the user's configured node and import the returned segments **with start/end timestamps** into the canonical transcript. Media is temporary on the node, deleted after completion. Files are not uploaded to MyMemory; full-file translation is not triggered automatically.
- Approximate session WebVTT is preserved for microphone segments; file-sourced segments export with their model's file-relative timestamps. JSON export includes mediaName/mediaStartMs/mediaEndMs. Real-time system/tab capture is a separate future source adapter.
- New Python API mock tests, existing browser mobile smoke tests and explicit provider-isolation check. Real container models, media decoder quality, GPU speed and Android connection remain unverified until physical setup.

## Beta 0.5 — fixed from real Android screen recording

### Diagnosed user-visible failures
- The attached Android recording (193.69s) showed a long accumulated Hebrew source paragraph and an untranslated caption error. When the user opened the Session transcript section, the MyMemory result explicitly reported **HTTP 429**. This is a rate/quota limit, not a successful empty translation.
- MyMemory anonymous usage has a documented **5,000-character/day** quota, and an individual get request is limited to 500 UTF-8 bytes. The MyMemory adapter already chunks requests but long conversations can exhaust the daily limit quickly.
- Speech output should never be framed as translated if only source text exists. Comparison engines are distinct; late results must never overwrite captions from a chosen provider.

### Canonical log → focused caption viewport
- `src/session-ledger.js` is the **only source transcript log**. Every finalized paragraph has a stable ID and immutable original text. Providers attach separate translated results, status, errors and timings.
- The live subtitle viewer now uses a **cursor into the log**: Previous / Next / Follow Live. One, two or three visible lines focus the **end of the selected paragraph** (not the first few words). The source text and translation are kept in separate viewport layers.
- Paragraphs/Rising/Ticker derive from that same canonical log, not independent streams; a late provider result does not reorder paragraph history. The full log remains exportable.
- The mobile `speech-floating-controls` UI-only Web Component now shows a compact **translated excerpt above the microphone button**. While translation is unavailable it visibly labels the original-source fallback. A hide/show button controls the floating subtitle.
- The older Subtitle stage below the fold is also clipped to a small scrollable view, not another unlimited copy of the transcript.

### API failure handling and model comparisons
- MyMemory HTTP 429 (including responseStatus=429) opens a clear quota warning and **opens a per-session circuit breaker** that blocks further repeated calls until an explicit Retry. The original transcript keeps accumulating.
- Only engines explicitly enabled by the user are candidates for fallback: supported Chrome on-device Translator, or a trusted HTTPS LibreTranslate-compatible endpoint. For hosted LibreTranslate servers requiring it, users can enter an optional API key **for the current tab only** (not saved to exports or source).
- A selected display engine retains ownership unless it fails; then the UI can explicitly fall back to another **already enabled** engine. If none is available, captions show "translation unavailable", not invented output.
- `src/provider-stats.js` generates a transparent engine scoreboard from the canonical log: completed responses, errors, canceled/skipped, p50 provider latency and similarity only where a human supplies a reference translation. Similarity is not a certified quality/accuracy score.
- Individual reference translations belong to the **focused log entry**, allowing per-paragraph quality comparisons across a long conversation.

### Long-session and privacy controls
- Session TXT and approximate VTT export retained; added **JSON log export** including original entries and per-provider attempts/status/latencies. No secret API key is included.
- Optional checkbox saves the text transcript locally in IndexedDB and restores it on reload. This is **off by default**. Disabling or clicking Delete saved local copy erases the persisted copy; source remains in RAM until cleared. No raw audio recording is created.
- Log UI shows a manageable batch (40 entries), Show older adds more; the full log remains in memory/export and a 3,000-paragraph safety cap guards against unbounded page growth.
- Final-fragment overlap de-duplication is conservative; it avoids repeated cumulative recognition tails only when five or more words overlap. It does not silently rewrite completed stored transcript entries.

### Verification boundary
- Node and mocked mobile Chromium regression checks include user-reported HTTP 429, blocked subsequent requests, fallback to user-enabled provider, floating caption display, log focus, tail viewport and IndexedDB opt-in/restore/delete.
- Real Android audio and latency, actual server quotas, browser speaker output, true TV/tab/system audio capture and physical-device stability are still **unverified** by automated tests.
- This beta uses the microphone/browser speech recognition only. Capturing another app's audio or transcribing a media file requires a separate authorized input + streaming STT adapter.

## New in beta 0.4 — stable paragraphs and floating microphone

- SpeechRecognition final fragments are **collected into one paragraph** until 0.9, 1.6 (default), or 2.5 seconds pass without a new interim/final event. That delay starts after the recognizer's *final result*, so it is a browser-visible approximation of silence, not a waveform-level voice activity detector. A hard paragraph length cap protects against unlimited memory. You can also choose Immediate mode to commit each final result.
- A paragraph is translated as **one unit**, preserving context. Choosing 1, 2 (default) or 3 visible subtitle lines changes the viewport clipping only; it does not send one API request per line. To read complete results use the Paragraphs append mode, which retains a bounded on-screen history while the full transcript remains in session memory.
- **Stable caption provider:** MyMemory by default, or explicitly Chrome/LibreTranslate, or first-success wins. The chosen result is locked for that paragraph; late outputs from other comparison providers still appear in their benchmark panels but never replace live subtitles. This is not multi-model fusion.
- A reusable, **UI-only floating Web Component** in `src/speech-floating-controls.js` provides a compact mobile mic start/stop and language/settings popover. The app owns microphone permissions and translates the component's events to the existing engine. Desktop full controls remain.
- Finish microphone cancels old pending provider work and **optionally translates only the last incomplete paragraph** when auto-translation is on. A background stop never starts new provider requests. Transcript is text-only.
- Tests: paragraph timeout/grouping, provider result lock, mobile floating UI, paragraph append mode and configurable subtitle line count (CI mock browser + Node). Actual phone speech timing and availability remain field-tested, not assumed.

## New in beta 0.3 — instantly accessible subtitles

- The live display is now **above the fold** on mobile: spoken/target language selectors and a one-button record control appear immediately under the MobiLab header.
- **Three GPU-friendly subtitle modes**: Bottom (current translated line), Rising (last three lyrics-like lines fading upward), and Ticker (horizontal RSS/news crawl). The full transcript remains below; animations use CSS and respect reduced-motion.
- **Interim speech** appears immediately as a provisional source caption. Only finalized speech is stored. Source/translation is written safely using DOM textContent.
- Finalized speech segmentation: **whole phrase**, **9-word caption lines** (default), or **4-word short chunks**. These are split after recognition; they do NOT make the recognizer finalize earlier and may worsen context in very small chunks.
- **Live priority** queue is now default while recording: at most two waiting lines; older waiting translations are flagged skipped (not silently dropped) so the latest captions can catch up. Stored text remains available for manual retranslation. Complete mode can backlog and lag.
- Optional **Early Draft** interim-text translation (off by default) runs with a minimum 650 ms debounce and 3.6s request spacing, plus cancellation guards. It uses translation quota and can be wrong; final output supersedes it.
- On-screen latency panel shows approximate browser **speechstart→final**, **queue wait**, **provider duration**, and **final speech event→first translated caption**, plus nearest-rank p50/p90 for up to 60 finalized translated lines. There is no claim of absolute acoustic-to-ear or model-only latency. The STT metric includes the time the person spent speaking.
- Accessible live text announcements and a quick TTS button appear at the top; sound still requires ending microphone recording to avoid echo.
- Pure caption splitter/statistics in `src/live-captions.js`, render-only view component in `src/live-view.js`, and responsive styles in `src/live-captions.css`.

The detailed instrumentation protocol, overload strategy, permissions and future desktop/audio adapters are in [LIVE_LATENCY.md](./LIVE_LATENCY.md). Actual live-system audio and video-source capture are **not** implemented.

## Changes in beta 0.2

### Mobile UX and recording sessions
- A **single, accessible Start recording / Finish recording toggle**, persistent on small screens, with an active REC state and recording timer. The timer resets for each recording, while transcript times stay session-relative.
- Browser STT still uses manually selected language; interim text is previewed and **only finalized speech** creates an in-memory transcript row.
- "Translate each finalized phrase" (on by default) can be disabled. "Translate saved phrases / re-run latest" processes stored phrases or re-evaluates a latest completed phrase with newly enabled providers.
- A bounded queue processes **one phrase at a time**, running selected translation providers in parallel for the same phrase. Eight queued phrases maximum. **Finish recording** aborts the browser recognizer, pending cloud fetches and queued translations; pending entries remain recorded as canceled. Results from a stopped session are never displayed as new translations. Some browser-local translation operations cannot truly be aborted; their late responses are ignored and do not block a new session.
- Speech recognizer restarts only while the toggle says REC, with a reconnect rate limit that stops repeated failures instead of looping indefinitely. Stop or page background ends recognition.

### Audible text-to-speech diagnostic
- A **Test voice** button produces a language-specific sample even before any translation. The phone's available voices populate a selector via the \`voiceschanged\` event; Auto chooses a language-matching voice when available.
- Read latest translation or an individual translated segment, from a real user tap; report \`onstart\`, \`onend\`, and \`onerror\` status. Adjustable volume (app gain, not the OS media volume) and reading speed.
- Stop the microphone before TTS to prevent feedback. A phone with muted media audio, no downloaded speech engine/voice or browser synthesis restrictions may still remain silent; **test on the physical Android device**.

### Multi-engine translation benchmark
- **MyMemory** (cloud) baseline; **Chrome on-device Translator** if supported on desktop and explicitly opted in; optional custom **LibreTranslate-compatible HTTPS server** via advanced configuration for a second independent translation engine on Android.
- A custom endpoint must be a trusted server that the user controls and supports cross-origin browser requests. The public managed LibreTranslate instance requires an API key; this project never ships credentials or silently selects an untrusted public mirror.
- Compare individual model outputs, errors and per-provider translation latency from **the identical finalized input**. A human-entered expected translation enables **character n-gram similarity** (not an actual semantic correctness percentage).
- WER evaluates speech recognition against the reference transcript. Browser STT candidate alternatives come from one recognizer and are **not** independent STT models. Majority voting or automatic accuracy claims are not implemented.

### Testing
- \`cd labs/speech && npm test\` runs provider adapter, cancellable queue, Unicode metrics and HTML DOM contract tests with Node 22, no dependencies. An optional GitHub Actions workflow performs these tests on PR/push. Real device tests still required.

## Implemented pipeline

1. Microphone STT: browser SpeechRecognition / webkitSpeechRecognition, with a manually selected spoken language. Interim speech is previewed, final results are kept in memory.
2. Translation: completed phrases and typed text go to MyMemory's public API. UTF-8 request chunks stay under 500 bytes. API failures are visible, never silently replaced.
3. Subtitles: preview original/interim speech and show the finalized translated caption; keep an in-memory session transcript.
4. Text to speech: optional playback of the latest translation using device voices. Microphone must be stopped first, to avoid feedback loops.
5. Benchmark: WER (word error rate) is calculated against a user-provided ground-truth reference; metric is not a model's self-reported confidence.
6. Export: TXT transcript and approximate VTT subtitles; VTT timestamps are session-relative estimates, not synchronized to any media file.
7. Automatic text language detection (experimental): script heuristics for Hebrew, Arabic and Russian; supported desktop Chrome Language Detector when available. No spoken-language auto-detection in this release.

Architecture:

Microphone → browser recognition → interim/final transcript → translation API → captions → optional TTS.

Manual text → optional text language detector → translation API → captions → optional TTS.

## Optional engine comparison — beta

- Engine A: MyMemory (cloud) receives the finalized text and returns a translation.
- Engine B: Chrome browser-native `Translator` (available on supported **desktop** Chrome/Edge only). Opt-in via checkbox; browser may download a language pack before the first result. Translation occurs on the device once available.
- When Engine B is enabled, both translations are launched in parallel against the **same finalized source text**. Each engine displays its own result or explicit error and latency.
- The UI shows lexical word-set overlap only when both engines have succeeded. **This is NOT translation accuracy**, and automatic merging/voting is not implemented. The user must compare meaning or supply a reference.
- Browser `SpeechRecognition.maxAlternatives=3` requests up to three candidates from **one recognizer**; this is not model ensembling and other browsers may return just one candidate.
- To compare two independent *speech recognition* models we will need a real second STT adapter (e.g. Whisper or an external API), a common audio sample, consent and meaningful benchmarks. Do not download big models automatically on mobile.
- Reusable engine module: `src/engine-compare.js` exports `createChromeTranslatorAdapter()`, `lexicalAgreement()` and language/token helpers. Pure adapter/caching tests live in `src/engine-compare.test.mjs` (run `npm test` from `labs/speech/` with Node installed).

## Data handling and limitations

- Microphone requires user permission and a secure browser context (HTTPS or localhost). Stopping, closing, or backgrounding the page ends recognition.
- Browser STT may send audio to a service run by the browser vendor; it is not guaranteed on-device.
- Translation sends finalized user text to MyMemory. Avoid sensitive content and use test phrases. This app has no server, analytics or stored transcript database.
- The MyMemory anonymous quota is 5,000 characters/day; the service may limit or reject requests. No private API keys in the public frontend.
- Does not transcribe telephone calls, other apps' protected audio, imported audio/video, or YouTube content. OCR and keyboard input are not implemented.
- The source language must be chosen for microphone recognition. The Auto option applies to typed text, and may fail to classify it reliably.

## QA checklist — beta 0.3 mobile acceptance

- [ ] On phone portrait, open the page: mic and language selectors are visible without scrolling.
- [ ] Test Bottom / Rising / Ticker with live text and translation; inspect reduced motion.
- [ ] Speak 20 utterances, record actual p50/p90 Final → subtitle, skipped count, provider delay and source language.
- [ ] Compare Sentence/Line/Short modes, explicitly checking for mistranslation caused by truncated context.
- [ ] Test Early Draft opt-in with interim results and verify the provisional label and request rate.
- [ ] Enable Live priority under provider overload; confirm backlog is bounded and transcript still saved.
- [ ] Test English/Hebrew RTL/LTR subtitle layout and stop/clear cancellation.


- [ ] In Chrome desktop where supported, explicitly enable local engine comparison and compare real independent translation outputs and latencies. Confirm no automatic model download without opt-in.
- [ ] In Android verify the unsupported local translator is gracefully disabled (no fake second-model output).
- [ ] In Android Chrome over HTTPS: allow microphone, dictate Hebrew and verify final transcript.
- [ ] Dictate English, then translate to Hebrew and inspect actual provider result.
- [ ] Repeat in Samsung Internet and desktop Chrome; record unsupported APIs/errors.
- [ ] Verify Finish recording aborts listening and all pending translations. Old canceled tasks must not append new results.
- [ ] Restart and verify new recordings are not blocked by canceled old provider operations.
- [ ] Toggle automatic translation off, dictate multiple phrases, finish, then translate saved phrases.
- [ ] Test Voice using each supported language and installed voice; verify real audibility with device media volume.
- [ ] Connect a trusted HTTPS LibreTranslate server, test CORS and independent outputs on Android.
- [ ] Verify Stop ends listening; page backgrounding stops recognition.
- [ ] Verify manual text translation works without microphone access.
- [ ] Disconnect network or exhaust provider quota; verify explicit errors instead of fake translations.
- [ ] Stop the microphone and use TTS. Test installed voices and pronunciation.
- [ ] Read a 20–50 word reference transcript aloud; calculate WER across several trials with different noise.
- [ ] Export TXT and approximate VTT; verify UTF-8 Hebrew text.
- [ ] Check portrait phone layout, large touch targets, no horizontal overflow.

## Benchmark data to collect

| Device/browser | Spoken language | Reference words | WER | API latency | Notes |
|---|---|---:|---:|---:|---|
| Chrome Android | he-IL | — | — | — | Not tested |
| Chrome Android | en-US | — | — | — | Not tested |
| Desktop Chrome | en-US | — | — | — | Not tested |

The UI's latency is finalized-text-to-translation timing, NOT full audio-to-subtitle latency. WER can exceed 100%, and needs verified ground truth.

## Next phases

- Add an opt-in multilingual STT engine (e.g. Whisper-family) with audio language identification.
- Introduce AudioSource adapters: microphone, user-uploaded media, authorized desktop tab capture, and optionally allowed native Android playback capture.
- Compare engines on the SAME consented test clips: WER, end-to-end latency, energy, battery, CPU and privacy.
- Add a video subtitle overlay, importable SRT/VTT, optional OCR translation for selected images, summarization, and later a keyboard integration.
- Keep call recording and protected system audio out of the web POC; do not promise unrestricted access.

Status: beta 0.2 source changes, real device voice/provider and mobile layout verification pending.
