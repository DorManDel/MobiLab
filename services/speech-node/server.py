"""Local Speech Node for MobiLab.

Same-origin desktop workbench + fixed-upstream LibreTranslate proxy + optional
local faster-whisper file transcription. No audio or text database on this node.

Default bind: 127.0.0.1 ONLY. Remote access needs a separate authenticated
HTTPS proxy, access policy and an explicit SPEECH_NODE_API_TOKEN.
"""
from __future__ import annotations

import asyncio
import hmac
import os
import tempfile
import time
from pathlib import Path
from threading import Lock
from typing import Literal

import httpx
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = os.environ.get("SPEECH_TRANSLATE_UPSTREAM", "http://127.0.0.1:5000").rstrip("/")
API_TOKEN = os.environ.get("SPEECH_NODE_API_TOKEN", "")
ENABLE_STT = os.environ.get("SPEECH_ENABLE_STT", "0") == "1"
STT_MODEL = os.environ.get("SPEECH_STT_MODEL", "small")
STT_DEVICE = os.environ.get("SPEECH_STT_DEVICE", "auto")
STT_COMPUTE = os.environ.get("SPEECH_STT_COMPUTE_TYPE", "auto")
MAX_MEDIA_MB = max(1, min(500, int(os.environ.get("SPEECH_MEDIA_MAX_MB", "100"))))
ALLOWED_MEDIA = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg",
                 ".webm", ".mp4", ".mkv", ".mov", ".opus"}
ORIGINS = [
    "https://dormandel.github.io",
    "http://127.0.0.1:8765",
    "http://localhost:8765",
]
ORIGINS.extend(x.strip() for x in os.environ.get("SPEECH_NODE_CORS_ORIGINS", "").split(",") if x.strip())

app = FastAPI(title="MobiLab Local Speech Node", version="0.6.0", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS,
                   allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type"],
                   allow_credentials=False)

_model = None
_model_guard = Lock()
_stt_slots = asyncio.Semaphore(1)


def require_token(request: Request) -> None:
    """A cross-origin website cannot turn this node into a public unauthenticated API."""
    if not API_TOKEN:
        return  # Only safe if server stays on 127.0.0.1 behind no public tunnel.
    received = request.headers.get("Authorization", "")
    if not received.startswith("Bearer ") or not hmac.compare_digest(received[7:], API_TOKEN):
        raise HTTPException(status_code=401, detail="Local node access token is required.")


class TranslatePayload(BaseModel):
    q: str = Field(min_length=1, max_length=20000)
    source: str = Field(pattern=r"^[a-zA-Z-]{2,14}$")
    target: str = Field(pattern=r"^[a-zA-Z-]{2,14}$")
    format: Literal["text"] = "text"


async def upstream_translate(payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(UPSTREAM + "/translate", json=payload)
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("translatedText"), str):
            raise HTTPException(status_code=502, detail="Local translator returned invalid output.")
        return {"translatedText": data["translatedText"]}
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Local translator HTTP {exc.response.status_code}") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(status_code=503,
                            detail="Local LibreTranslate is offline or failed. Start Docker Compose first.") from exc


async def upstream_languages() -> list:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(UPSTREAM + "/languages")
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, list):
            raise ValueError("Unexpected languages response")
        return data
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=503,
                            detail="Local translator is unreachable. Is Docker running?") from exc


@app.get("/health")
async def health(request: Request):
    require_token(request)
    return {"status": "ok", "node": "MobiLab Local Speech Node",
            "stt_enabled": ENABLE_STT, "media_max_mb": MAX_MEDIA_MB}


@app.get("/languages")
async def languages(request: Request):
    require_token(request)
    return await upstream_languages()


@app.post("/translate")
async def translate(request: Request, payload: TranslatePayload):
    require_token(request)
    if payload.source == payload.target:
        return {"translatedText": payload.q}
    return await upstream_translate(payload.model_dump())


@app.get("/api/status")
async def status(request: Request):
    require_token(request)
    try:
        models = await upstream_languages()
        translated = "online"
        installed = [item.get("code") for item in models if isinstance(item, dict)]
    except HTTPException:
        translated = "offline"
        installed = []
    return {"node": "MobiLab Local Speech Node", "translator": translated,
            "languages": installed, "stt_enabled": ENABLE_STT,
            "stt_model": STT_MODEL if ENABLE_STT else None}


def _load_whisper():
    global _model
    with _model_guard:
        if _model is None:
            from faster_whisper import WhisperModel  # optional: installed by user
            _model = WhisperModel(STT_MODEL, device=STT_DEVICE, compute_type=STT_COMPUTE)
        return _model


def _transcribe_file(path: str, language: str | None) -> dict:
    started = time.perf_counter()
    model = _load_whisper()
    segments, info = model.transcribe(path, language=language, beam_size=5, vad_filter=True)
    lines = [
        {"start": round(segment.start, 3), "end": round(segment.end, 3),
         "text": segment.text.strip()}
        for segment in segments if segment.text.strip()
    ]
    return {"segments": lines, "language": info.language,
            "language_probability": round(info.language_probability, 4),
            "model": STT_MODEL, "processing_ms": round((time.perf_counter() - started) * 1000)}


@app.post("/api/transcribe")
async def transcribe(request: Request, file: UploadFile = File(...), language: str = "auto"):
    require_token(request)
    if not ENABLE_STT:
        raise HTTPException(status_code=503, detail="File transcription disabled. Set SPEECH_ENABLE_STT=1 and install faster-whisper.")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_MEDIA:
        raise HTTPException(status_code=415, detail="Unsupported media file extension.")
    if language not in {"auto", "he", "en", "es", "fr", "de", "ar", "ru", "it"}:
        raise HTTPException(status_code=422, detail="Unsupported language.")
    max_size = MAX_MEDIA_MB * 1024 * 1024
    total = 0
    temp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    temp_path = temp.name
    try:
        with temp:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_size:
                    raise HTTPException(status_code=413, detail="Media file exceeds local upload limit.")
                temp.write(chunk)
        async with _stt_slots:
            try:
                return await asyncio.to_thread(_transcribe_file, temp_path,
                                               None if language == "auto" else language)
            except ModuleNotFoundError as exc:
                raise HTTPException(status_code=503, detail="Install faster-whisper from requirements-stt.txt first.") from exc
            except Exception as exc:
                raise HTTPException(status_code=422, detail=f"Local STT failed: {type(exc).__name__}") from exc
    finally:
        try:
            os.unlink(temp_path)
        except FileNotFoundError:
            pass
        await file.close()


@app.get("/")
async def root():
    return RedirectResponse("/labs/speech/")

# Mount only the public lab directory. Never expose .git/.env, recordings or service code.
app.mount("/labs/speech", StaticFiles(directory=PROJECT_ROOT / "labs" / "speech", html=True), name="speech")


if __name__ == "__main__":
    host = os.environ.get("SPEECH_NODE_HOST", "127.0.0.1")
    port = int(os.environ.get("SPEECH_NODE_PORT", "8765"))
    if host not in {"127.0.0.1", "localhost"} and not API_TOKEN:
        raise SystemExit("Refusing remote bind without SPEECH_NODE_API_TOKEN.")
    uvicorn.run(app, host=host, port=port, log_level="info")
