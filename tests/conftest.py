import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.test_lab import HEADERS, TEST_KEY, FakeEngine


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "test.db", FakeEngine(), TEST_KEY)
    with TestClient(
        app, base_url="http://127.0.0.1", headers=HEADERS, client=("127.0.0.1", 50000)
    ) as session:
        response = session.post("/api/auth/login", json={"key": TEST_KEY})
        assert response.status_code == 200
        session.headers["X-CSRF-Token"] = response.json()["csrf"]
        yield session
