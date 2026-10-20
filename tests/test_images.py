import base64

import cv2
import numpy as np
import pytest

from app.jpeg import dimensions
from app.vision import FaceEngine, VisionError


def test_jpeg_dimensions():
    _, data = cv2.imencode(".jpg", np.zeros((480, 640, 3), np.uint8))
    assert dimensions(data.tobytes()) == (640, 480)


@pytest.mark.parametrize(
    "value,code",
    [
        ("not-base64", "INVALID_IMAGE"),
        ("YWJjZA==", "INVALID_IMAGE"),
        ("a" * 2_000_001, "IMAGE_TOO_LARGE"),
    ],
    ids=["bad-base64", "not-jpeg", "oversized"],
)
def test_reject_bad_images(tmp_path, value, code):
    with pytest.raises(VisionError, match=code):
        FaceEngine(tmp_path).embedding(value)


def test_dimensions_limit_before_model_loading(tmp_path):
    _, data = cv2.imencode(".jpg", np.zeros((1100, 2000, 3), np.uint8))
    with pytest.raises(VisionError, match="IMAGE_DIMENSIONS"):
        FaceEngine(tmp_path).embedding(base64.b64encode(data).decode())


def test_missing_models_fail_closed(tmp_path):
    _, data = cv2.imencode(".jpg", np.zeros((480, 640, 3), np.uint8))
    with pytest.raises(VisionError, match="MODELS_MISSING"):
        FaceEngine(tmp_path).embedding(base64.b64encode(data).decode())
