# FaceFX Lab v0.3 — mobile-first

## Mobile: no PC required
Open **https://dormandel.github.io/MobiLab/labs/facefx/** on your phone using Chrome or Samsung Internet. Select **Mobile** (default), choose a clear single-face portrait with consent, tap **Start camera**, grant permission, and try **Photo Swap · local (2D)**.

The local pipeline is MediaPipe Face Landmarker → landmark matching → Delaunay triangulation → canvas texture warp → feathered face outline, with temporal smoothing and an up-to-12-FPS swap drawing cap. This does **not** run a generative face-swap model and is not expected to produce realistic results at large head rotations. For small phones, start at 640×480, 24 FPS, 10–15 detection FPS. No account, Python, Tailscale, desktop PC, or RTX is needed.

This is a *live 2D identity-texture transfer*, not a deepfake-quality generator. MediaPipe WASM and model load from Google and jsDelivr over HTTPS on first use (so the first launch requires Internet). **No source portrait or camera frames are uploaded in Mobile mode.** The source file is held in RAM until cleared or the tab closes. Camera permission is user-controlled and the Stop button closes the stream.

## Optional PC boost
Switch to **Compare** or **RTX** and expand **Use your RTX PC**. Configure a private Tailscale Serve HTTPS URL and ephemeral session token. The browser sends a camera track only after tapping **Connect PC**. The optional Python server uses WebRTC and supports debug/passthrough and licensed ONNX swap models after separate installation.

See [PC server README](../../facefx-server/README.md) for the separate Windows installation. GitHub Pages hosts only the browser client — it never runs Python/GPU computation.

## Testing status
- JavaScript syntax validated by Node.
- Browser-render test at 390, 832, and 1440 px widths passed; synthetic 478-point source detected into a valid triangle texture with opaque pixels.
- Live Samsung camera and real-time MediaPipe/GPU performance **not verified yet**.
- Device testing and independent model licensing required before production claims.
