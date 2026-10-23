from tests.test_lab import enroll


def test_self_check_requires_selected_profile_and_consent(client):
    assert enroll(client).status_code == 201
    payload = {"user_id": "ST001", "image": "face-one", "consent": True}
    assert client.post("/api/self-check", json=payload).json()["name"] == "Test User"
    assert (
        client.post("/api/self-check", json=payload | {"image": "other-face"}).json()["name"]
        is None
    )
    assert client.post("/api/self-check", json=payload | {"consent": False}).status_code == 422
    assert (
        client.post("/api/self-check", json=payload | {"image": "no-face"}).json()["verified"]
        is False
    )
    assert client.get("/api/events").json() == []
