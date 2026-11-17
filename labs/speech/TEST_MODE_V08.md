# VoiceBridge v0.8 — Test Mode

Status: feature-branch preview only. Do not merge to main until physical-phone QA and user approval.

## Mobile workflow
1. Open the HTTPS v0.8 feature preview on the phone.
2. On Live, select a Test Mode scenario, optionally add a label like A: VU on, and press Start Test.
3. Speak normally. Finish stops capture while already queued translations can finish.
4. Wait for REPORT READY. Choose View report on Diagnostics, then Export Test Bundle ZIP (or JSON / CSV individually).
5. Send the ZIP or JSON/CSV back for comparing the same script under different engine and UI settings.

## Scenarios
- live: current STT plus selected translation engine.
- stt-only: temporarily disables automatic translation, restores the checkbox after stopping.
- long-speech: same engine pipeline, aimed at measuring continuity and reconnections.
- compare: uses only providers already explicitly enabled in Settings (may use more API quota).

## Export
ZIP has summary.json, segments.csv and events.csv (schema voicebridge.test.bundle.v1).
The run has unique ID, ISO dates, selected provider/language settings, browser and viewport, event timestamps, provider timings, errors and per-segment states.
By default recognized and translated words, raw audio, API keys, tokens and service URLs are omitted. To include spoken text for accuracy review, explicitly check Include transcript words in the report. No upload takes place.

## What metrics mean
- First interim/final: time since mic-start event; browser event estimates, not exact audio timestamps.
- STT p50/p90: speech-start to browser final estimate; can be absent.
- Queue wait: final result to provider start, if available.
- Translator: the individual provider's measured duration.
- Final to caption: last STT final to accepted translated caption, if available.
- Suppressed duplicates: events filtered by the final guard; not a word error rate.
- Zero finalized segments: recognition was not confirmed. Check microphone permission and speech service.
- STT-only translation completion is N/A, not a failure.

## Suggested A/B checks
1. A (STT only, VU enabled) versus B (STT only, VU disabled) to isolate secondary audio capture.
2. C (Live, paragraph pause 900 ms) versus D (Live, pause 1600 ms) to isolate segmentation latency.
3. E (Live single provider) versus F (enabled comparison providers) to compare latency and quota usage.
Keep phone, room, script and network as constant as possible. Use 20+ samples when judging speed.

## Limits
- MyMemory usage quotas still apply.
- Static preview cannot safely store cloud provider API keys; use an authenticated backend.
- No actual phone microphone/provider benchmark has been completed yet.
- Per-run events are capped at 5,000; overflow is counted. No raw audio is saved.
- Stop waits for pending translations until a 20-second timeout; unfinished items remain visible in the report.