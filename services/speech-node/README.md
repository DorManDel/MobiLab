# MobiLab Local Speech Node — beta 0.6

Self-hosted LibreTranslate and optional faster-whisper file transcription. The public GitHub Pages site does NOT host a translation model or a Python server. When your own PC runs these services, translations have no external *daily character quota*. Real throughput is still limited by your machine and the installed language models.

## Architecture

- Browser UI: MobiLab Speech Lab, canonical source log and focusable subtitle viewport.
- Local node: services/speech-node/server.py on 127.0.0.1:8765.
- Translator: LibreTranslate + Argos models in Docker on 127.0.0.1:5000.
- Optional file STT: faster-whisper called by the node; returns timed text segments which the UI imports into the same log. Translation of imported segments is opt-in and batched.
- MyMemory cloud remains an optional fallback/benchmark, NOT used when LibreTranslate is the selected engine unless the user explicitly checks the cloud comparison box.

## 1. Install LibreTranslate locally (Windows 11 / WSL)

Install Docker Desktop with WSL integration if appropriate. From the MobiLab repo root:

~~~sh
docker compose -f services/speech-node/docker-compose.yml up -d
docker compose -f services/speech-node/docker-compose.yml logs -f
~~~

The Compose file loads English/Hebrew Argos models, persists the model cache, and publishes port 5000 ONLY on the PC loopback. Initial downloads require Internet access. No anonymous MyMemory quota applies.

Confirm the API:

~~~sh
curl http://127.0.0.1:5000/languages
curl -X POST http://127.0.0.1:5000/translate -H "Content-Type: application/json" -d '{"q":"Hello","source":"en","target":"he","format":"text"}'
~~~

The response should include translatedText. Official LibreTranslate models support he->en and en->he. Other languages require extending LT_LOAD_ONLY and installing additional model packages. Models may use an English pivot.

Stop: docker compose -f services/speech-node/docker-compose.yml down (volume retained).

## 2. Run Speech Node and the workbench

From the repo root:

~~~sh
python -m venv .venv
# PowerShell activation: .\.venv\Scripts\Activate.ps1
# WSL activation: source .venv/bin/activate
pip install -r services/speech-node/requirements.txt
python services/speech-node/server.py
~~~

Open http://127.0.0.1:8765/labs/speech/ on the PC. Press **Use local PC node** and **Test my engine**. If Hebrew/English is installed, the page selects LibreTranslate as the main engine with **no MyMemory requests**. You can translate saved paragraphs in controlled batches.

A phone browsing GitHub Pages CANNOT reach the PC using 127.0.0.1: that address would mean the phone itself. Start with desktop use, then set up secured mobile access as described below.

## 3. Optional local Whisper for audio/video files

~~~sh
pip install -r services/speech-node/requirements-stt.txt
~~~

Before launching the node, enable Whisper. PowerShell example:

~~~powershell
$env:SPEECH_ENABLE_STT = "1"
$env:SPEECH_STT_MODEL = "small"
$env:SPEECH_STT_DEVICE = "auto"
python services/speech-node/server.py
~~~

WSL example:

~~~sh
SPEECH_ENABLE_STT=1 SPEECH_STT_MODEL=small SPEECH_STT_DEVICE=auto python services/speech-node/server.py
~~~

In the browser, expand **Audio / video file transcription**, choose a permitted file (max 100 MB by default), and press **Transcribe file locally**. The browser uploads the file only to the configured node; the server decodes it with faster-whisper and deletes its temporary file afterward. It returns timed segments for the source log. Use Translate saved in batches if translation is desired. Media-file cue timestamps are used in WebVTT export.

Official current faster-whisper GPU requirements include CUDA 12, cuBLAS and cuDNN 9. A compatible NVIDIA GPU can accelerate transcription; actual Windows/WSL library compatibility, speed and memory usage are NOT verified in this project. Initial model download requires Internet. CPU mode is also possible.

## 4. Secured mobile HTTPS — optional future setup

The local server binds only to 127.0.0.1 by default. NEVER expose ports 5000/8765 directly as an unauthenticated public API.

For mobile use, point a private authenticated HTTPS hostname (Cloudflare Tunnel + Access or equivalent) to **Speech Node**, not Docker port 5000. Require owner-only login and a strong SPEECH_NODE_API_TOKEN. The frontend supports a session-only Bearer token field. For cross-origin GitHub Pages calls, the node needs explicit CORS allowance and properly authenticated OPTIONS/preflight handling. If Access cookies/CORS are a problem, open the node-served workbench on its own private HTTPS hostname (same-origin) rather than GitHub Pages. CORS is NOT authentication; Access and the API token protect the service. PC must remain on.

## 5. HTTP contracts

- GET /health — node status (Bearer token if configured).
- GET /languages — installed Argos pairs.
- POST /translate — LibreTranslate-compatible JSON: q, source, target, format=text, returns translatedText.
- GET /api/status — translation and file-STT readiness.
- POST /api/transcribe?language=auto|he|en|... — multipart file, returns segments with start/end seconds, language, model and processing_ms.

The Python server serves only the public labs/speech static folder. It does not expose the repository, internal code or configuration files. No database and no permanent uploaded audio file. The optional browser IndexedDB transcript archive is separate and user-controlled.

## Current limitations and roadmap

Implemented: local translation bridge, optional file-upload STT with timestamps, provider-selection isolation, canonical transcript, JSON/TXT/VTT export and benchmark tools. Automated tests use a mocked translator/Whisper adapter, not real models.

NOT implemented: continuous capture of browser tabs/system audio, streaming STT with acoustic VAD, bidirectional translated TTS conversation, video-burned captions, parallel independent STT models. User-approved getDisplayMedia may include a tab audio track, but browser/OS support varies and this stream cannot be given directly to the existing Web Speech recognizer. This is a later source adapter for the local STT service.

NLLB-200 local translation is an optional quality-research path, but the common Meta weights are licensed CC BY-NC 4.0 (non-commercial); do not assume a public/commercial deployment is permitted.
