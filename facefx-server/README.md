# FaceFX private PC server

Run only on your Windows machine behind Tailscale Serve; never use Funnel. Need Python 3.11, Tailscale and optionally compatible NVIDIA CUDA/ONNX Runtime for an individually licensed face swap model.

```powershell
py -3.11 -m venv facefx-server\.venv
.\facefx-server\.venv\Scripts\python.exe -m pip install -r facefx-server\requirements.txt
.\facefx-server\.venv\Scripts\python.exe facefx-server\server.py
```

Copy the randomly printed session token. In a second terminal run `tailscale serve 8080`. The private HTTPS URL and session token are entered in the FaceFX site's PC Setup section. The default debug overlay requires no AI model. The `--source`/`--model` flags enable optional face swapping after installing `requirements-ai.txt` and verifying model permissions and CUDA provider. Never publish photos or model weights.

Note: the browser supports a fully independent local 2D Photo Swap; RTX is explicitly opt-in. The Python static file allow-list includes swap.js as of v0.3.
