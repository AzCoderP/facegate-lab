import base64
import binascii
import hashlib
import threading
from pathlib import Path

import cv2
import numpy as np


class VisionError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


class FaceEngine:
    @staticmethod
    def sample_key(encoded):
        try:
            raw = base64.b64decode(encoded.split(",", 1)[-1], validate=True)
            return hashlib.sha256(raw).digest()
        except (ValueError, binascii.Error) as exc:
            raise VisionError("INVALID_IMAGE") from exc

    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.lock = threading.Lock()
        self.detector = None
        self.recognizer = None

    @property
    def ready(self):
        return all((self.model_dir / f).is_file() for f in ("yunet.onnx", "sface.onnx"))

    def _load(self):
        if not self.ready:
            raise VisionError("MODELS_MISSING")
        if self.detector is None:
            try:
                detector = cv2.FaceDetectorYN.create(
                    str(self.model_dir / "yunet.onnx"), "", (320, 320), 0.9
                )
                recognizer = cv2.FaceRecognizerSF.create(str(self.model_dir / "sface.onnx"), "")
                self.detector, self.recognizer = detector, recognizer
            except cv2.error as exc:
                raise VisionError("MODEL_LOAD_FAILED") from exc

    def embedding(self, encoded: str):
        if len(encoded) > 2_000_000:
            raise VisionError("IMAGE_TOO_LARGE")
        try:
            raw = base64.b64decode(encoded.split(",", 1)[-1], validate=True)
        except (ValueError, binascii.Error) as exc:
            raise VisionError("INVALID_IMAGE") from exc
        # Browser captures are JPEG, capped before full decompression.
        if len(raw) < 4 or raw[:2] != b"\xff\xd8":
            raise VisionError("INVALID_IMAGE")
        # OpenCV also has its own pixel cap; enforce encoded dimensions first using JPEG headers.
        from app.jpeg import dimensions

        width, height = dimensions(raw)
        if not (0 < width <= 1920 and 0 < height <= 1080):
            raise VisionError("IMAGE_DIMENSIONS")
        try:
            image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        except cv2.error as exc:
            raise VisionError("INVALID_IMAGE") from exc
        if image is None:
            raise VisionError("INVALID_IMAGE")
        with self.lock:
            self._load()
            try:
                self.detector.setInputSize((image.shape[1], image.shape[0]))
                _, faces = self.detector.detect(image)
                if faces is None or len(faces) == 0:
                    raise VisionError("FACE_NOT_DETECTED")
                if len(faces) != 1:
                    raise VisionError("MULTIPLE_FACES")
                face = faces[0]
                if min(face[2], face[3]) < 90:
                    raise VisionError("FACE_TOO_SMALL")
                crop = self.recognizer.alignCrop(image, face)
                gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
                if cv2.Laplacian(gray, cv2.CV_64F).var() < 25:
                    raise VisionError("IMAGE_BLURRY")
                feature = self.recognizer.feature(crop).flatten().astype(float)
                norm = np.linalg.norm(feature)
                if not np.isfinite(norm) or norm == 0:
                    raise VisionError("INVALID_FEATURE")
                return (feature / norm).tolist()
            except cv2.error as exc:
                raise VisionError("VISION_ERROR") from exc

    @staticmethod
    def similarity(feature, templates):
        try:
            vector = np.asarray(feature, dtype=float)
            matrix = np.asarray(templates, dtype=float)
            if (
                vector.ndim != 1
                or matrix.ndim != 2
                or matrix.shape[1] != vector.size
                or not matrix.shape[0]
            ):
                raise ValueError("Invalid feature dimensions")
            if not np.isfinite(vector).all() or not np.isfinite(matrix).all():
                raise ValueError("Non-finite features")
            norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(vector)
            if np.any(norms == 0):
                raise ValueError("Zero features")
            return float(np.clip(np.max((matrix @ vector) / norms), -1, 1))
        except (ValueError, TypeError) as exc:
            raise VisionError("INVALID_FEATURE") from exc
