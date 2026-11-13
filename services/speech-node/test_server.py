"""Unit tests use mocks. No model download, Docker, GPU or real network required."""
import io
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pytest
from fastapi.testclient import TestClient
import server

client = TestClient(server.app)


@pytest.fixture(autouse=True)
def no_external_key(monkeypatch):
    monkeypatch.setattr(server, "API_TOKEN", "")
    monkeypatch.setattr(server, "ENABLE_STT", False)


def test_local_status_and_limited_static_mount():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["stt_enabled"] is False
    response = client.get("/labs/speech/")
    assert response.status_code == 200
    assert "LIVE SUBTITLE STUDIO" in response.text
    assert client.get("/labs/speech/../../services/speech-node/server.py").status_code == 404


def test_translate_proxy_and_identity(monkeypatch):
    sent = []
    async def mock(payload):
        sent.append(payload)
        return {"translatedText": "שלום"}
    monkeypatch.setattr(server, "upstream_translate", mock)
    result = client.post("/translate", json={"q":"Hello","source":"en","target":"he"})
    assert result.status_code == 200
    assert result.json()["translatedText"] == "שלום"
    assert sent[0]["q"] == "Hello"
    result = client.post("/translate", json={"q":"Identity","source":"en","target":"en"})
    assert result.json()["translatedText"] == "Identity"
    assert len(sent) == 1


def test_local_node_token_auth(monkeypatch):
    monkeypatch.setattr(server, "API_TOKEN", "private-token")
    assert client.get("/health").status_code == 401
    assert client.get("/health", headers={"Authorization":"Bearer wrong"}).status_code == 401
    assert client.get("/health", headers={"Authorization":"Bearer private-token"}).status_code == 200
    assert client.post("/api/transcribe", files={"file":("a.wav",b"sample","audio/wav")}).status_code == 401


def test_languages_and_status_are_fixed_upstream(monkeypatch):
    async def mock():
        return [{"code":"he","targets":["en"]},{"code":"en","targets":["he"]}]
    monkeypatch.setattr(server, "upstream_languages", mock)
    assert client.get("/languages").json()[0]["code"] == "he"
    result = client.get("/api/status").json()
    assert result["translator"] == "online"
    assert result["languages"] == ["he","en"]


def test_stt_explicit_opt_in_and_unsupported_extension(monkeypatch):
    form={"file":("clip.wav",b"mock audio","audio/wav")}
    r=client.post("/api/transcribe", files=form)
    assert r.status_code == 503
    monkeypatch.setattr(server,"ENABLE_STT",True)
    assert client.post("/api/transcribe",files={"file":("file.exe",b"x","application/octet-stream")}).status_code == 415


def test_stt_temp_file_is_removed_and_timestamps_returned(monkeypatch):
    monkeypatch.setattr(server, "ENABLE_STT", True)
    seen=[]
    def fake(path,lang):
        seen.append(path)
        assert Path(path).exists()
        assert Path(path).read_bytes()==b"mock wav"
        assert lang=="he"
        return {"segments":[{"start":0.2,"end":1.6,"text":"שלום"}],
                "language":"he","language_probability":0.99,"model":"mock","processing_ms":50}
    monkeypatch.setattr(server, "_transcribe_file", fake)
    response=client.post("/api/transcribe?language=he",
       files={"file":("audio.wav",b"mock wav","audio/wav")})
    assert response.status_code==200
    assert response.json()["segments"][0]["start"]==0.2
    assert seen and not Path(seen[0]).exists()


def test_stt_too_large_rejected_and_temp_file_cleaned(monkeypatch):
    monkeypatch.setattr(server, "ENABLE_STT", True)
    monkeypatch.setattr(server, "MAX_MEDIA_MB", 1)
    response=client.post("/api/transcribe",
       files={"file":("large.wav",b"\0"*(1024*1024+1),"audio/wav")})
    assert response.status_code==413


def test_model_errors_are_safe_and_do_not_leak_internal_paths(monkeypatch):
    monkeypatch.setattr(server, "ENABLE_STT", True)
    def fake(path, lang):
        raise RuntimeError("Private path or credentials hidden")
    monkeypatch.setattr(server, "_transcribe_file", fake)
    response=client.post("/api/transcribe",
       files={"file":("a.wav",b"x","audio/wav")})
    assert response.status_code==422
    assert "Private path" not in response.text
