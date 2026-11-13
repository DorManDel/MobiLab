"""FaceFX Lab private Windows GPU WebRTC bridge.

Serves the identical FaceFX client through / and processes a single video session.
Use only behind Tailscale Serve (NOT Funnel) and never expose a public port.
"""
from __future__ import annotations
import argparse
import asyncio
import hmac
import json
import logging
import os
import re
import secrets
from pathlib import Path
from time import perf_counter
from urllib.parse import urlparse

from aiohttp import web
from aiortc import RTCPeerConnection, RTCSessionDescription, VideoStreamTrack
from av import VideoFrame

from processor import DemoProcessor, InsightFaceProcessor

LOG = logging.getLogger("facefx")
CLIENT_DIR = Path(__file__).resolve().parents[1] / "labs" / "facefx"
CONNECTIONS: set[RTCPeerConnection] = set()


def trusted_origin(origin: str, request: web.Request) -> bool:
    """Restrict browser CORS to our MobiLab Pages app and the PC's own UI."""
    if origin == "https://dormandel.github.io":
        return True
    if re.fullmatch(r"http://(?:localhost|127\.0\.0\.1)(?::\d+)?", origin):
        return True
    try:
        parsed = urlparse(origin)
        return (parsed.scheme == "https" and parsed.hostname is not None
                and parsed.hostname.endswith(".ts.net")
                and parsed.netloc.lower() == request.host.lower())
    except ValueError:
        return False


@web.middleware
async def browser_policy(request: web.Request, handler):
    origin = request.headers.get("Origin")
    if origin and not trusted_origin(origin, request):
        return web.Response(status=403, text="Untrusted browser origin")
    if request.method == "OPTIONS":
        response = web.Response(status=204)
    else:
        try:
            response = await handler(request)
        except web.HTTPException as exc:
            response = exc
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-FaceFX-Token"
        if request.headers.get("Access-Control-Request-Private-Network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
    response.headers["Cache-Control"] = "no-store"
    return response


class LatestFrameTransform(VideoStreamTrack):
    """One queued frame maximum; process in a worker to avoid backlogging."""
    kind = "video"

    def __init__(self, upstream, processor):
        super().__init__()
        self.upstream = upstream
        self.processor = processor
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=1)
        self.last_processing_ms = 0.0
        self.frames_processed = 0
        self.pump_task = asyncio.create_task(self._pump())

    async def _pump(self):
        try:
            while True:
                frame = await self.upstream.recv()
                if self.queue.full():
                    self.queue.get_nowait()
                self.queue.put_nowait(frame)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            LOG.info("Video input ended: %s", exc)
        finally:
            if self.queue.full():
                self.queue.get_nowait()
            self.queue.put_nowait(None)

    async def recv(self):
        from aiortc.mediastreams import MediaStreamError
        frame = await self.queue.get()
        if frame is None:
            raise MediaStreamError
        bgr = frame.to_ndarray(format="bgr24")
        start = perf_counter()
        processed = await asyncio.to_thread(self.processor.process, bgr)
        self.last_processing_ms = (perf_counter() - start) * 1000
        self.frames_processed += 1
        result = VideoFrame.from_ndarray(processed, format="bgr24")
        result.pts = frame.pts
        result.time_base = frame.time_base
        return result

    def stop(self):
        self.pump_task.cancel()
        self.upstream.stop()
        super().stop()


def make_app(source: Path | None, model: Path | None, session_token: str):
    app = web.Application(middlewares=[browser_policy], client_max_size=128 * 1024)
    app["processors"] = {}

    def require_token(request):
        supplied = request.headers.get("X-FaceFX-Token", "")
        if not hmac.compare_digest(supplied, session_token):
            raise web.HTTPUnauthorized(text="Invalid pairing token. Check the PC terminal.")

    async def page(request):
        return web.FileResponse(CLIENT_DIR / "index.html")

    async def static(request):
        filename = request.match_info["file"]
        if filename not in {"client.js", "style.css", "swap.js"}:
            raise web.HTTPNotFound()
        return web.FileResponse(CLIENT_DIR / filename)

    async def health(request):
        require_token(request)
        has_model = bool(source and model and source.is_file() and model.is_file())
        return web.json_response({"service": "MobiLab FaceFX v0.2", "swap_configured": has_model,
                                  "recording": False, "transport": "WebRTC encrypted"})

    async def offer(request):
        require_token(request)
        if len(CONNECTIONS) >= 1:
            raise web.HTTPConflict(text="One session allowed. Disconnect the previous browser first.")
        try:
            body = await request.json()
            mode = body.get("mode", "debug")
            if mode not in {"debug", "passthrough", "swap"}:
                raise ValueError("Unsupported mode")
            if mode == "swap":
                if not source or not model or not source.is_file() or not model.is_file():
                    raise ValueError("No licensed local ONNX model/source image configured.")
                if "swap" not in app["processors"]:
                    app["processors"]["swap"] = await asyncio.to_thread(InsightFaceProcessor, source, model)
                processor = app["processors"]["swap"]
            else:
                processor = DemoProcessor(mode)
            description = RTCSessionDescription(sdp=body["sdp"], type=body["type"])
        except (ValueError, KeyError, TypeError, RuntimeError) as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        except Exception as exc:
            LOG.exception("AI processor init failure")
            raise web.HTTPBadRequest(text=f"Processor initialization failed: {type(exc).__name__}: {exc}") from exc

        pc = RTCPeerConnection()
        CONNECTIONS.add(pc)
        holder = {"transform": None}

        @pc.on("datachannel")
        def on_channel(channel):
            @channel.on("message")
            def on_message(message):
                try:
                    obj = json.loads(message)
                    if obj.get("type") != "ping":
                        return
                    transform = holder["transform"]
                    channel.send(json.dumps({"type": "pong", "nonce": obj.get("nonce"),
                        "processing_ms": round(transform.last_processing_ms, 1) if transform else None,
                        "processed_frames": transform.frames_processed if transform else 0}))
                except (ValueError, TypeError):
                    return

        @pc.on("track")
        def on_track(track):
            if track.kind == "video":
                result = LatestFrameTransform(track, processor)
                holder["transform"] = result
                pc.addTrack(result)

        @pc.on("connectionstatechange")
        async def connection_changed():
            LOG.info("Peer state: %s", pc.connectionState)
            if pc.connectionState in {"closed", "failed"}:
                await pc.close()
                CONNECTIONS.discard(pc)

        try:
            await pc.setRemoteDescription(description)
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            for _ in range(300):
                if pc.iceGatheringState == "complete":
                    break
                await asyncio.sleep(.05)
            else:
                raise web.HTTPGatewayTimeout(text="PC ICE gathering timeout")
            return web.json_response({"sdp": pc.localDescription.sdp, "type": pc.localDescription.type})
        except Exception:
            CONNECTIONS.discard(pc)
            await pc.close()
            raise

    async def close_session(request):
        require_token(request)
        for pc in tuple(CONNECTIONS):
            await pc.close()
            CONNECTIONS.discard(pc)
        return web.json_response({"ok": True})

    async def shutdown(_):
        for pc in tuple(CONNECTIONS):
            await pc.close()
        CONNECTIONS.clear()

    app.router.add_get("/health", health)
    app.router.add_post("/offer", offer)
    app.router.add_post("/close", close_session)
    for route in ("/", "/labs/facefx/"):
        app.router.add_get(route, page)
    for prefix in ("/", "/labs/facefx/"):
        app.router.add_get(prefix + "{file}", static)
    app.on_shutdown.append(shutdown)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Private FaceFX AI processor")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--source", type=Path, help="Local consented source portrait")
    parser.add_argument("--model", type=Path, help="Local licensed face swap ONNX model")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    session_token = os.environ.get("FACEFX_TOKEN") or secrets.token_urlsafe(18)
    print("\nFaceFX private pairing token (copy into the phone tab):\n" + session_token + "\n", flush=True)
    print("Run 'tailscale serve 8080' in another PowerShell window. Do NOT run Funnel.\n", flush=True)
    web.run_app(make_app(args.source, args.model, session_token), host="127.0.0.1", port=args.port)
