"""Local YOLO inference; input frames are discarded after inference."""

import base64
import binascii
import os
import threading
from pathlib import Path

import cv2
import numpy as np
from fastapi import HTTPException

from app.jpeg import dimensions


class ObjectEngine:
    def __init__(self, root):
        self.path = Path(
            os.environ.get("FACEGATE_OBJECT_MODEL", Path(root) / "models" / "yolo11n.pt")
        )
        self.model = None
        self.lock = threading.Lock()

    def detect(self, encoded):
        try:
            raw = base64.b64decode(encoded.split(",", 1)[-1], validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "INVALID_IMAGE") from None
        w, h = dimensions(raw)
        if not 0 < w <= 960 or not 0 < h <= 720:
            raise HTTPException(422, "IMAGE_DIMENSIONS")
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise HTTPException(422, "INVALID_IMAGE")
        if not self.path.is_file():
            raise HTTPException(503, "YOLO_MODEL_MISSING")
        with self.lock:
            if self.model is None:
                from ultralytics import YOLO

                self.model = YOLO(str(self.path))
            result = self.model.predict(image, imgsz=480, conf=0.45, device="cpu", verbose=False)[0]
            return [
                {
                    "class": result.names[int(b.cls.item())],
                    "label": result.names[int(b.cls.item())],
                    "score": float(b.conf.item()),
                    "bbox": [
                        float(b.xyxy[0][0]),
                        float(b.xyxy[0][1]),
                        float(b.xyxy[0][2] - b.xyxy[0][0]),
                        float(b.xyxy[0][3] - b.xyxy[0][1]),
                    ],
                }
                for b in result.boxes
            ]
