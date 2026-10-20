import json
import math
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.security import AdminAuth, RateLimiter, VaultError
from app.storage import Store
from app.vision import FaceEngine, VisionError
from tests.test_lab import HEADERS, TEST_KEY, FakeEngine, attempt, enroll


def test_auth_required_for_all_private_data(tmp_path):
    app = create_app(tmp_path / "test.db", FakeEngine(), TEST_KEY)
    with TestClient(
        app, base_url="http://127.0.0.1", headers=HEADERS, client=("127.0.0.1", 50000)
    ) as session:
        for path in ("/api/users", "/api/events", "/api/health", "/api/stats", "/api/audit"):
            assert session.get(path).status_code == 401
        assert session.get("/api/live").status_code == 200
        assert session.get("/openapi.json").status_code == 404
        assert session.get("/api/auth/status").json()["authenticated"] is False


def test_session_cookie_csrf_and_logout(client):
    assert client.cookies.get(AdminAuth.COOKIE)
    assert (
        client.post("/api/auth/logout", json={}, headers={"X-CSRF-Token": "wrong"}).status_code
        == 403
    )
    response = client.post("/api/auth/logout", json={})
    assert response.status_code == 200
    assert client.get("/api/users").status_code == 401
    assert not client.cookies.get(AdminAuth.COOKIE)


def test_cookie_flags(tmp_path):
    with TestClient(
        create_app(tmp_path / "test.db", FakeEngine(), TEST_KEY),
        base_url="http://127.0.0.1",
        headers=HEADERS,
        client=("127.0.0.1", 50000),
    ) as session:
        response = session.post("/api/auth/login", json={"key": TEST_KEY})
        cookie = response.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=strict" in cookie and "max-age=" in cookie
        assert "csrf" in response.json()


def test_login_rate_limit_and_no_secret_echo(tmp_path):
    with TestClient(
        create_app(tmp_path / "test.db", FakeEngine(), TEST_KEY),
        base_url="http://127.0.0.1",
        headers=HEADERS,
        client=("127.0.0.1", 50000),
    ) as session:
        for _ in range(5):
            assert session.post("/api/auth/login", json={"key": "wrong"}).status_code == 401
        response = session.post("/api/auth/login", json={"key": TEST_KEY})
        assert response.status_code == 429 and response.headers["retry-after"] == "60"
        assert TEST_KEY not in response.text


def test_session_idle_and_absolute_expiry(tmp_path, monkeypatch):
    auth = AdminAuth(tmp_path, TEST_KEY)
    token, _ = auth.login(TEST_KEY)
    created = time.monotonic()
    monkeypatch.setattr("app.security.time.monotonic", lambda: created + 1801)
    assert auth.session(token) is None
    token, _ = auth.login(TEST_KEY)
    monkeypatch.setattr("app.security.time.monotonic", lambda: created + 1801 + 8 * 3600 + 1)
    assert auth.session(token) is None


def test_templates_are_encrypted_at_rest(client):
    assert enroll(client).status_code == 201
    store = client.app.state.store
    with store.connection() as db:
        raw = db.execute("SELECT templates FROM users").fetchone()[0]
    assert raw.startswith("enc:v1:") and "[1.0" not in raw
    assert store.user("ST001")["templates"] == [[1.0, 0.0]] * 3
    assert "templates" not in client.get("/api/users").text
    assert "enc:v1" not in client.get("/api/users").text


def test_tampered_templates_fail_closed(client):
    enroll(client)
    with client.app.state.store.connection() as db:
        db.execute("UPDATE users SET templates='enc:v1:broken'")
    result = attempt(client).json()
    assert result["decision"] == "DENIED" and result["reason"] == "TEMPLATE_UNAVAILABLE"


def test_lost_encryption_key_refuses_startup(client):
    enroll(client)
    path = client.app.state.store.path
    (path.parent / "vault.key").unlink()
    with pytest.raises(VaultError):
        Store(path)


def test_legacy_template_migration(tmp_path):
    path = tmp_path / "legacy.db"
    store = Store(path)
    with store.connection() as db:
        db.execute(
            "INSERT INTO users VALUES (?,?,?,?,?,?,?,?)",
            (
                "OLD",
                "Old User",
                1,
                "Main-Gate",
                "00:00",
                "00:00",
                json.dumps([[1, 0]]),
                "2026-10-21",
            ),
        )
    upgraded = Store(path)
    assert upgraded.user("OLD")["templates"] == [[1, 0]]
    with upgraded.connection() as db:
        assert db.execute("SELECT templates FROM users").fetchone()[0].startswith("enc:v1:")


def test_nan_score_never_grants(client, monkeypatch):
    enroll(client)
    monkeypatch.setattr(FakeEngine, "similarity", lambda *args: math.nan)
    result = attempt(client).json()
    assert result["decision"] == "DENIED" and result["reason"] == "INVALID_FEATURE"


@pytest.mark.parametrize(
    "feature,templates",
    [([math.nan, 0], [[1, 0]]), ([1, 0], [[0, 0]]), ([1, 0], []), ([1, 0], [[1, 0, 0]])],
)
def test_invalid_feature_vectors_rejected(feature, templates):
    with pytest.raises(VisionError, match="INVALID_FEATURE"):
        FaceEngine.similarity(feature, templates)


def test_consent_and_distinct_enrollment_required(client):
    assert enroll(client, consent=False).status_code == 422
    assert enroll(client, images=["face-one"] * 3).json()["detail"] == "DUPLICATE_SAMPLES"
    assert client.get("/api/users").json() == []


def test_validation_never_echoes_biometrics_or_admin_key(client):
    sensitive = "private-image-contents"
    response = enroll(client, images=[sensitive])
    assert sensitive not in response.text
    response = client.post("/api/auth/login", json={"key": "s" * 200})
    assert "s" * 200 not in response.text
    assert response.status_code == 422


def test_search_filters_pagination_and_stats(client):
    enroll(client)
    assert len(client.get("/api/users?q=ST001").json()) == 1
    assert client.get("/api/users?q=%25").json() == []
    assert client.get("/api/users?offset=1").json() == []
    attempt(client)
    attempt(client, event_id="second-event", door="Other-Gate")
    assert len(client.get("/api/events?decision=DENIED").json()) == 1
    assert len(client.get("/api/events?user_id=ST001&limit=1&offset=1").json()) == 1
    stats = client.get("/api/stats").json()
    assert stats["events"] == 2 and stats["granted"] == 1 and stats["denied"] == 1


def test_settings_are_persistent_validated_and_audited(client):
    assert client.put("/api/settings", json={"threshold": 0}).status_code == 422
    assert client.put("/api/settings", json={"threshold": 0.45}).status_code == 200
    assert client.get("/api/health").json()["threshold"] == 0.45
    assert Store(client.app.state.store.path).threshold(0.363) == 0.45
    assert any(row["action"] == "THRESHOLD_UPDATED" for row in client.get("/api/audit").json())


def test_rate_limiter():
    limiter = RateLimiter(2)
    assert limiter.allow("a") and limiter.allow("a") and not limiter.allow("a")
    assert limiter.allow("b")


def test_early_errors_have_security_headers(client):
    result = client.post("/api/auth/logout", json={}, headers={"Origin": "https://evil.example"})
    assert result.status_code == 403
    assert result.headers["X-Frame-Options"] == "DENY"
    assert "camera=(self)" in result.headers["Permissions-Policy"]


def test_remote_peer_rejected_even_with_localhost_header(tmp_path):
    app = create_app(tmp_path / "test.db", FakeEngine(), TEST_KEY)
    with TestClient(app, base_url="http://127.0.0.1", client=("192.168.1.5", 50000)) as session:
        assert session.get("/").status_code == 403


def test_swapped_ciphertext_cannot_impersonate_another_user(client):
    enroll(client)
    assert enroll(client, id="ST002").status_code == 201
    with client.app.state.store.connection() as db:
        token = db.execute("SELECT templates FROM users WHERE id='ST001'").fetchone()[0]
        db.execute("UPDATE users SET templates=? WHERE id='ST002'", (token,))
    result = attempt(client, user_id="ST002").json()
    assert result["decision"] == "DENIED" and result["reason"] == "TEMPLATE_UNAVAILABLE"


def test_corrupt_threshold_never_grants(client):
    enroll(client)
    with client.app.state.store.connection() as db:
        db.execute("INSERT INTO settings VALUES ('threshold','nan')")
    result = attempt(client).json()
    assert result["decision"] == "DENIED" and result["reason"] == "CONFIG_INVALID"


def test_equivalent_encoded_samples_have_same_digest():
    assert FaceEngine.sample_key("data:image/jpeg;base64,YWJjZA==") == FaceEngine.sample_key(
        "YWJjZA=="
    )


def test_model_request_queue_fails_when_saturated(client, monkeypatch):
    # Operation limit itself is exercised through a concurrent, blocking fake engine.
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event

    enroll(client)
    started, release = Event(), Event()
    original = FakeEngine.embedding

    def block(self, image):
        started.set()
        assert release.wait(8)
        return original(self, image)

    monkeypatch.setattr(FakeEngine, "embedding", block)
    with ThreadPoolExecutor(max_workers=4) as pool:
        first = pool.submit(attempt, client, event_id="parallel-1")
        assert started.wait(3)
        second = pool.submit(attempt, client, event_id="parallel-2")
        third = pool.submit(attempt, client, event_id="parallel-3")
        # At least one of four requests exceeds the three pending-operation slots.
        fourth = pool.submit(attempt, client, event_id="parallel-4")
        try:
            import concurrent.futures

            done, _ = concurrent.futures.wait(
                [first, second, third, fourth],
                timeout=3,
                return_when=concurrent.futures.FIRST_COMPLETED,
            )
            assert done and next(iter(done)).result().status_code == 503
        finally:
            release.set()
        responses = [task.result() for task in [first, second, third, fourth]]
        assert sum(response.status_code == 503 for response in responses) >= 1
