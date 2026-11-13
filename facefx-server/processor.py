"""Pluggable, server-side FaceFX frame processing.

The free InsightFace pretrained models may carry non-commercial research-only terms.
Never publish the model weights or a person's source image in a public repository.
"""
from __future__ import annotations

from pathlib import Path
from typing import Protocol
import cv2
import numpy as np


class Processor(Protocol):
    def process(self, bgr: np.ndarray) -> np.ndarray: ...


class DemoProcessor:
    """A visual transport check. It is NOT an AI face swap."""

    def __init__(self, mode: str = "debug") -> None:
        self.mode = mode

    def process(self, bgr: np.ndarray) -> np.ndarray:
        if self.mode == "passthrough":
            return bgr
        out = bgr.copy()
        h, w = out.shape[:2]
        cv2.rectangle(out, (12, 12), (w - 12, h - 12), (200, 80, 180), 2)
        cv2.putText(out, "GPU BRIDGE - DEBUG (NO AI)", (24, min(h - 22, 47)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (30, 230, 240), 2, cv2.LINE_AA)
        return out


class InsightFaceProcessor:
    """Baseline face-swap model; GPU required, no tracking/temporal smoothing yet.

    A consenting person's one-face source photo is used to create a local identity
    embedding. The source image never leaves the Windows machine.
    """

    def __init__(self, source: Path, model: Path) -> None:
        if not source.is_file():
            raise ValueError(f"Source photo not found: {source}")
        if not model.is_file():
            raise ValueError(f"Face swap ONNX model not found: {model}")

        try:
            import onnxruntime as ort
            import insightface
            from insightface.app import FaceAnalysis
        except ImportError as exc:
            raise RuntimeError("Install the optional GPU/InsightFace dependencies (see README).") from exc

        providers = ort.get_available_providers()
        if "CUDAExecutionProvider" not in providers:
            raise RuntimeError("CUDAExecutionProvider is unavailable: fix ONNX Runtime GPU first.")
        provider_order = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self.detector = FaceAnalysis(name="buffalo_l", providers=provider_order)
        self.detector.prepare(ctx_id=0, det_size=(640, 640))
        self.swapper = insightface.model_zoo.get_model(str(model), providers=provider_order)

        face_photo = cv2.imread(str(source))
        if face_photo is None:
            raise ValueError("Cannot read source photo (try a JPG with an ASCII path).")
        faces = self.detector.get(face_photo)
        if len(faces) != 1:
            raise ValueError("Source photo must contain exactly one clear, consenting face.")
        self.source_face = faces[0]

    def process(self, bgr: np.ndarray) -> np.ndarray:
        faces = self.detector.get(bgr)
        if not faces:
            return bgr
        # Deliberately process only the largest/nearest face in v0.
        target = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        return self.swapper.get(bgr, target, self.source_face, paste_back=True)
