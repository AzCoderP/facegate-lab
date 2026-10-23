import base64
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.vision import FaceEngine, VisionError
from tests.test_lab import FakeEngine


def test_presence_api_anonymous_and_no_access_events(client, monkeypatch):
    monkeypatch.setattr(
        FakeEngine, "presence", lambda self, image: [[0.1, 0.2, 0.3, 0.4]], raising=False
    )
    result = client.post(
        "/api/presence", json={"image": "frame", "tracking_session": "test-camera"}
    )
    assert result.status_code == 200
    assert set(result.json()) == {
        "tracks",
        "arrivals",
        "count",
        "tracking_epoch",
        "at",
        "elapsed_ms",
    }
    assert result.json()["tracks"][0]["box"] == [0.1, 0.2, 0.3, 0.4]
    assert len(result.json()["arrivals"]) == 1
    repeat = client.post(
        "/api/presence", json={"image": "frame", "tracking_session": "test-camera"}
    )
    assert repeat.json()["arrivals"] == []
    assert repeat.json()["tracks"][0]["id"] == 1
    assert client.post("/api/presence/stop", json={"tracking_session": "test-camera"}).json() == {
        "stopped": True
    }
    assert client.get("/api/events").json() == []
    client.cookies.clear()
    assert (
        client.post(
            "/api/presence", json={"image": "frame", "tracking_session": "test-camera"}
        ).status_code
        == 401
    )


def test_presence_rejects_invalid_and_oversized_images(tmp_path):
    engine = FaceEngine(tmp_path)
    with pytest.raises(VisionError, match="INVALID_IMAGE"):
        engine.presence("invalid")
    _, data = cv2.imencode(".jpg", np.zeros((721, 960, 3), dtype=np.uint8))
    with pytest.raises(VisionError, match="IMAGE_DIMENSIONS"):
        engine.presence(base64.b64encode(data).decode())


def test_real_detector_blank_frame_has_no_people():
    root = Path(__file__).resolve().parent.parent
    if not (root / "models" / "yunet.onnx").exists():
        pytest.skip("Local YuNet model not installed")
    engine = FaceEngine(root / "models")
    _, data = cv2.imencode(".jpg", np.zeros((480, 640, 3), dtype=np.uint8))
    assert engine.presence(base64.b64encode(data).decode()) == []
    assert engine.recognizer is None


def test_presence_rate_budget_and_csrf(client, monkeypatch):
    monkeypatch.setattr(FakeEngine, "presence", lambda self, image: [], raising=False)
    for _ in range(45):
        assert (
            client.post(
                "/api/presence", json={"image": "frame", "tracking_session": "camera"}
            ).status_code
            == 200
        )
    assert (
        client.post(
            "/api/presence",
            json={"image": "frame", "tracking_session": "camera"},
            headers={"X-CSRF-Token": "wrong"},
        ).status_code
        == 403
    )
    assert client.post("/api/presence", json={"image": "frame"}).status_code == 422
