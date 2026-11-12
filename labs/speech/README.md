# Speech & Translate Lab — POC 0.1

Entry point: ./index.html, linked as a tab and overview card in MobiLab.

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

## Data handling and limitations

- Microphone requires user permission and a secure browser context (HTTPS or localhost). Stopping, closing, or backgrounding the page ends recognition.
- Browser STT may send audio to a service run by the browser vendor; it is not guaranteed on-device.
- Translation sends finalized user text to MyMemory. Avoid sensitive content and use test phrases. This app has no server, analytics or stored transcript database.
- The MyMemory anonymous quota is 5,000 characters/day; the service may limit or reject requests. No private API keys in the public frontend.
- Does not transcribe telephone calls, other apps' protected audio, imported audio/video, or YouTube content. OCR and keyboard input are not implemented.
- The source language must be chosen for microphone recognition. The Auto option applies to typed text, and may fail to classify it reliably.

## QA checklist — before merging

- [ ] In Android Chrome over HTTPS: allow microphone, dictate Hebrew and verify final transcript.
- [ ] Dictate English, then translate to Hebrew and inspect actual provider result.
- [ ] Repeat in Samsung Internet and desktop Chrome; record unsupported APIs/errors.
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

Status: code and static checks completed; real audio/browser testing and user approval remain pending.
