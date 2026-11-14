# VoiceBridge v0.7 — mobile dock & faster sentence commits (experiment)

Status: **feature branch / draft PR only**. Not released to GitHub Pages.
Base main SHA: `2aea2a3db6dd99e803fb1d209c04456a8a1949a4`.

## Source-informed pipeline (as implemented)

Microphone (browser Web Speech API) -> volatile interim -> final speech hypothesis -> ParagraphBuilder -> SessionLedger (canonical original) -> TranslationQueue -> opted-in provider -> per-row translated output -> LiveCaptionView + mobile dock -> optional TTS.

Manual text -> optional language detection -> same addPhrase() path. File upload -> authenticated Speech Node + optional faster-whisper -> timestamped SessionLedger rows. Speech Node is currently optional and not a realtime phone STT engine.

No full raw audio recording is persisted. Local transcript persistence is optional/opt-in. Existing TXT/VTT/JSON export is unchanged.

## Changes in this branch

- Mobile-only responsive glass dock (portfolio-inspired dark frosted surfaces, violet/gold accents). Retro chrome mesh microphone drawn as inline SVG, not an external image asset. Responsive two-way controls and reduced-motion styling.
- Transcript sheet reads existing SessionLedger rows: 80 recent entries initially; load older 80 at a time; three sheet-height presets and handle swipe; independent scrolling, source+target text, focus entry, speak focused translation (requires mic to be off).
- Faster sentence readiness: finalize punctuation-delimited >=6-word SpeechRecognition final result without a further silence wait; ordinary unpunctuated speech now uses 900ms default pause, with 1.6/2.5s options retained.
- Bounded, tab-memory exact-phrase translation cache: same provider/language pair/normalized *full phrase*, LRU limit 400, 24h TTL, never cache errors or interim. Existing MyMemory 429 breaker stays enforced.
- No new provider credentials. No forced concurrent calls or increased early-draft quota consumption.

## How to test

1. Open a mobile viewport or physical Android/Samsung browser on an authenticated test deployment of this branch; verify visual mic and transcript opening, resizing, scrolling, focus and language direction. **GitHub Pages main remains unchanged**.
2. Microphone English -> Hebrew and Hebrew -> English: 20 short complete sentences, 20 continuous/long speech chunks; annotate a human transcript and translation.
3. Test with punctuation present vs absent, 0.9s vs 1.6s vs immediate. Compare sentence-boundary delay, translation quality, duplicated final tokens, canceled/skipped rows. Make no claim of speedup until measured.
4. Perform one cold run per provider and >=20 warm phrases per provider, on the exact same input, note engine status and pair, measure final-event -> displayed translation p50/p90, provider processing p50/p90, WER and human-evaluated translation quality. Test circuit breaker for MyMemory 429.
5. TTS: Mic active -> tap Speak -> clear instruction (no playback); stop mic -> tap Speak -> audio on device; verify that onstart/onerror reflects actual result.
6. Check session TXT/VTT/JSON exports after 200 paragraphs and after browser reload with local opt-in. Test manually in Samsung Internet/Chrome, portrait/landscape and desktop.

Automated tests: `cd labs/speech && npm test`. Browser smoke tests use mocked SpeechRecognition/translation responses and do not prove actual phone latency or audible TTS. No real provider benchmark performed for this branch yet.

## Known boundaries / next engineering work

- Real-time phone/browser translation requires an HTTPS service or native/local adapter. GitHub Pages hosts static assets, not LibreTranslate/Whisper workloads.
- Never store API keys in frontend source or exports. A remote proxy must protect provider credentials and enforce user authentication/rate limits.
- Browser Web Speech interim results cannot be sent as an arbitrary audio stream to faster-whisper. A realtime STT service needs an actual MediaStream/AudioWorklet or native audio capture, chunking/VAD, transport and timestamp alignment.
- Translation quality should be compared on **identical sentence-level contexts**, not majority voting or n-gram similarity alone.
- Background phone recording, other-app audio, protected playback, echo-cancelled simultaneous TTS and mic capture are not solved by this UI change.
