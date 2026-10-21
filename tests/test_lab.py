import sqlite3
from datetime import datetime

import pytest

from app.rules import access_reason
from app.vision import VisionError

HEADERS = {"X-FaceGate-Lab": "local"}
TEST_KEY = "test-only-admin-key-0123456789"


class FakeEngine:
    """Deterministic replacement ONLY for rule/API tests, never production."""

    ready = True

    @staticmethod
    def sample_key(image):
        return image

    def embedding(self, image):
        if image == "no-face":
            raise VisionError("FACE_NOT_DETECTED")
        if image == "models-missing":
            raise VisionError("MODELS_MISSING")
        return [0.0, 1.0] if image == "other-face" else [1.0, 0.0]

    def similarity(self, feature, templates):
        return max(sum(a * b for a, b in zip(feature, template)) for template in templates)


def enroll(client, **updates):
    payload = {
        "id": "ST001",
        "name": "Test User",
        "images": ["face-one-1", "face-one-2", "face-one-3"],
        "consent": True,
    }
    return client.post("/api/users", json=payload | updates)


def attempt(client, **updates):
    payload = {"event_id": "test-event", "user_id": "ST001", "image": "face-one"}
    return client.post("/api/verify", json=payload | updates)


def test_face_then_permission_and_logged_grant(client):
    assert enroll(client).status_code == 201
    result = attempt(client).json()
    assert result["decision"] == "GRANTED"
    assert result["mode"] == "FACE_VERIFICATION"
    assert len(client.get("/api/events").json()) == 1
    assert "templates" not in client.get("/api/users").text
    assert "fingerprint" not in result


@pytest.mark.parametrize(
    "updates,image,reason",
    [
        ({}, "other-face", "FACE_MISMATCH"),
        ({}, "no-face", "FACE_NOT_DETECTED"),
        ({}, "models-missing", "MODELS_MISSING"),
        ({"active": False}, "face-one", "USER_DISABLED"),
        ({"door": "Lab-A"}, "face-one", "DOOR_NOT_ALLOWED"),
    ],
)
def test_fail_closed(client, updates, image, reason):
    assert enroll(client, **updates).status_code == 201
    result = attempt(client, image=image).json()
    assert result["decision"] == "DENIED"
    assert result["reason"] == reason


def test_retry_idempotency_and_payload_conflict(client):
    enroll(client)
    original = attempt(client).json()
    replay = attempt(client).json()
    assert replay.pop("replayed") is True
    assert replay == {k: v for k, v in original.items() if k != "replayed"}
    assert len(client.get("/api/events").json()) == 1
    assert attempt(client, door="Other-Gate").status_code == 409


def test_unknown_user_cannot_pass(client):
    assert attempt(client).json()["reason"] == "USER_NOT_FOUND"


def test_inconsistent_enrollment(client):
    result = enroll(client, images=["face-one", "other-face", "face-one"])
    assert result.status_code == 422
    assert client.get("/api/users").json() == []


def test_edit_and_delete_removes_templates_and_events(client):
    enroll(client)
    attempt(client)
    changed = client.patch("/api/users/ST001", json={"active": False, "door": "Lab-A"})
    assert changed.status_code == 200
    assert not client.get("/api/users").json()[0]["active"]
    assert client.delete("/api/users/ST001").status_code == 200
    assert client.app.state.store.user("ST001") is None
    assert client.get("/api/events").json() == []


def test_preview_is_not_a_biometric_grant_or_event(client):
    enroll(client)
    result = client.post(
        "/api/policy-preview", json={"user_id": "ST001", "at": "2026-10-21T12:00:00+04:00"}
    ).json()
    assert result["simulation"] is True and result["biometric_checked"] is False
    assert "decision" not in result
    assert client.get("/api/events").json() == []


def test_time_window_baku_boundary_overnight_and_all_day():
    user = {"active": True, "door": "Main-Gate", "start_time": "09:00", "end_time": "18:00"}

    def check(iso):
        return access_reason(user, "Main-Gate", datetime.fromisoformat(iso))

    assert check("2026-10-21T05:00:00+00:00") == "GRANTED"
    assert check("2026-10-21T14:00:00+00:00") == "OUTSIDE_SCHEDULE"
    user.update(start_time="22:00", end_time="06:00")
    assert check("2026-10-21T23:00:00+04:00") == "GRANTED"
    assert check("2026-10-21T06:00:00+04:00") == "OUTSIDE_SCHEDULE"
    user.update(start_time="00:00", end_time="00:00")
    assert check("2026-10-21T14:00:00+00:00") == "GRANTED"


def test_database_write_failure_does_not_return_grant(client, monkeypatch):
    enroll(client)

    def fail(*args):
        raise sqlite3.OperationalError("disk unavailable")

    monkeypatch.setattr(client.app.state.store, "add_event", fail)
    response = attempt(client)
    assert response.status_code == 503
    assert "GRANTED" not in response.text


def test_cross_origin_and_missing_header_blocked(client):
    assert (
        client.post("/api/users", json={}, headers={"Origin": "https://example.com"}).status_code
        == 403
    )
    assert client.post("/api/users", json={}, headers={"X-FaceGate-Lab": ""}).status_code == 403
    assert client.get("/", headers={"Host": "evil.example"}).status_code == 400


def test_request_size_limited(client):
    response = client.post(
        "/api/users", content=b"x" * 6_100_001, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 413


def test_bad_input_rejected(client):
    assert enroll(client, id="../../file").status_code == 422
    assert enroll(client, start_time="25:00").status_code == 422
    assert enroll(client, name="  ").status_code == 422
    assert enroll(client, images=["one"]).status_code == 422
    assert client.get("/api/events?limit=999").status_code == 422


def test_static_assets_and_security_headers(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "FaceGate" in response.text
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    assert client.get("/static/app.js").status_code == 200
