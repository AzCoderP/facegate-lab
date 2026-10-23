from app.objects import ObjectEngine


def test_objects_security_and_no_persistent_events(client, monkeypatch):
    monkeypatch.setattr(
        ObjectEngine,
        "detect",
        lambda self, image: [
            {"class": "book", "label": "book", "score": 0.9, "bbox": [1, 2, 3, 4]}
        ],
    )
    assert (
        client.post("/api/objects", json={"image": "jpeg"}).json()["objects"][0]["class"] == "book"
    )
    assert client.get("/api/events").json() == []
    assert (
        client.post(
            "/api/objects", json={"image": "jpeg"}, headers={"X-CSRF-Token": "wrong"}
        ).status_code
        == 403
    )
    client.cookies.clear()
    assert client.post("/api/objects", json={"image": "jpeg"}).status_code == 401
