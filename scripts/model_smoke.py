"""Actual model smoke test with synthetic images; no personal face data."""

import base64
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.vision import FaceEngine, VisionError

engine = FaceEngine(ROOT / "models")
blank = np.zeros((480, 640, 3), np.uint8)
_, jpeg = cv2.imencode(".jpg", blank)
try:
    engine.embedding(base64.b64encode(jpeg).decode())
except VisionError as exc:
    assert exc.code == "FACE_NOT_DETECTED", exc.code
else:
    raise AssertionError("Blank image must not produce a face")

# Exercise the actual recognition model separately, not as proof of real-face accuracy.
crop = np.random.default_rng(7).integers(0, 256, (112, 112, 3), dtype=np.uint8)
feature = engine.recognizer.feature(crop)
assert np.isfinite(feature).all() and feature.size > 0
print("PASS: real YuNet rejects blank frame; real SFace produces finite features.")
print("Real-camera enrollment, matching accuracy and spoof resistance still require human testing.")
