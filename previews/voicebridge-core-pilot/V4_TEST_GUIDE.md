# VoiceBridge v4 - Adaptive Translation & Interim Replay Lab

Feature-branch Preview only; draft PR #38. **Do not merge to main** until the user tests it on Samsung.

## Phone procedure

1. Open v4 preview over HTTPS and use `Quick 3` / `VU OFF` for a short functional test.
2. Choose `Adaptive v4` (default), `Draft request budget = 1` and explicitly select MyMemory or Chrome/local if available.
3. Use `Test translation engine` to verify service connectivity before running; 429 means no quota, not a JavaScript failure.
4. Read each prompt normally. A `LIVE DRAFT` is provisional. At Final, the authoritative translation supersedes it.
5. Press `Save & Next` and finish the Pilot. Open the `Replay Lab` section in the report and choose a captured case.
6. View v3 baseline / Fast / Adaptive / Final-only side by side on the same *captured* STT interim event sequence.
7. Download JSON (and optional CSV) and send it for comparing the v3 run with v4 on the same device.

## What Replay measures

- First **eligible draft request** timestamp, measured from the mic-onset UI action (not a physical audio onset).
- Number of candidate prefixes chosen by the planner under the configured draft budget.
- Whether those prefix words disagree with the confirmed Final STT text (rough stability proxy).
- Does **not** measure what an actual translation service would return or the time to rendered captions. Replay performs **zero** provider calls.

## Controls

- `v3 baseline`: 4 stable words, one unstable trailing word held, growth 4 words, cooldown 1300 ms.
- `Fast`: 3 stable words, growth 3, hold one trailing word, cooldown 850 ms, only 1 draft.
- `Adaptive`: 4 stable words for an initial stable pair, can relax to 3 on a third consistent interim or stability for >=450 ms; min growth adapts, 950ms subsequent cooldown.
- `Final-only`: skip Interim translations and wait for Final.
- Default live setting: Adaptive with one draft + Final. More drafts may consume a third-party translator's daily quota.

## Privacy & interpretation

- Text is kept in browser localStorage for resume/replay; avoid recording private conversations in the Pilot.
- JSON and CSV default to no recognized/translatable text. In JSON, raw Interim event samples are exported only when `Include spoken words` is explicitly checked.
- Export always includes redacted aggregate replay metrics and final/first-draft timings.
- If Final translator errors, the last draft remains explicitly marked unverified.
- Word-error statistics are based on confirmed Final STT, not speculative Interim speech.

## Suggested A/B test (one variable at a time)

Run A: Adaptive, one draft, VU off. Run B: v3 baseline, one draft, VU off.
Use identical sentences, similar speaking rate and same network. Optionally test Fast vs Adaptive.
Before judging, compare real firstDraftMs, finalCaptionMs, draftErrors, WER, and the offline Replay results.
Do not infer superior translation accuracy from lower request eligibility time.

## Technical limitations

- Web Speech Interim behavior depends on browser and underlying STT service.
- The optional VU path requests separate microphone capture; this is not an STT output.
- MyMemory API remains rate-limited. This lab does not replace provider credentials/quotas.
- No on-device Samsung test or actual live MyMemory benchmark has been performed on this v4 build yet.