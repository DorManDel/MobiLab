# FaceFX Lab v0.4.1 — mobile-first + CDN recovery and portraits

## Mobile: no PC required
Open **https://dormandel.github.io/MobiLab/labs/facefx/** on your phone using Chrome or Samsung Internet. Select **Mobile** (default), pick one of the three synthetic sample portraits or choose a clear single-face portrait with consent, tap **Start camera**, grant permission, and try **Photo Swap · local (2D)**.

The local pipeline is MediaPipe Face Landmarker → landmark matching → Delaunay triangulation → canvas texture warp → feathered face outline, with temporal smoothing and an up-to-12-FPS swap drawing cap. This does **not** run a generative face-swap model and is not expected to produce realistic results at large head rotations. For small phones, start at 640×480, 24 FPS, 10–15 detection FPS. No account, Python, Tailscale, desktop PC, or RTX is needed.

This is a *live 2D identity-texture transfer*, not a deepfake-quality generator. MediaPipe WASM and model load from Google and jsDelivr or the unpkg fallback over HTTPS on first use (so the first launch requires Internet). **No source portrait or camera frames are uploaded in Mobile mode.** The source file is held in RAM until cleared or the tab closes. Camera permission is user-controlled and the Stop button closes the stream.

## Optional PC boost
Switch to **Compare** or **RTX** and expand **Use your RTX PC**. Configure a private Tailscale Serve HTTPS URL and ephemeral session token. The browser sends a camera track only after tapping **Connect PC**. The optional Python server uses WebRTC and supports debug/passthrough and licensed ONNX swap models after separate installation.

See [PC server README](../../facefx-server/README.md) for the separate Windows installation. GitHub Pages hosts only the browser client — it never runs Python/GPU computation.

## Testing status
- JavaScript syntax validated by Node.
- Browser-render test at 390, 832, and 1440 px widths passed; synthetic 478-point source detected into a valid triangle texture with opaque pixels.
- Live Samsung camera and real-time MediaPipe/GPU performance **not verified yet**.
- Device testing and independent model licensing required before production claims.

### v0.4 reliability fix
The original CDN `+esm` import produced `Failed to fetch dynamically imported module` on a real Samsung phone. This version uses MediaPipe's documented `vision_bundle.mjs` for the verified available `0.10.35` package, with unpkg as a fallback. The interface includes `Retry face engine` and short actionable messages; details appear in Diagnostics. Three generated, fictional studio faces are shipped in `presets/` as **local WebP files**, not remotely hosted pictures. User gallery sources are processed only in RAM on the device.

**Limitations:** Live phone camera and external CDN remain unverified until a physical-device retest; no claim of photorealistic generative face swap. The sample portraits are synthetic. PC remains optional.

### v0.4.1 version correction
An actual Chromium network test revealed that `0.10.22/vision_bundle.mjs` returned HTTP 404. Moved to version `0.10.35`, which publishes `vision_bundle.mjs`; the module and the `/wasm` loader are always pinned to the same release. An on-device Samsung retest is still required.
