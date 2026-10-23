from app.objects import ObjectEngine
from app.watch import CrossingTracker


def obj(x, y=0.5):
    return {"class": "book", "score": 0.9, "bbox": [x * 480 - 20, y * 360 - 20, 40, 40]}


def test_crossing_once_and_no_boundary_jitter():
    t = CrossingTracker()
    line = [[0.5, 0.05], [0.5, 0.95]]
    events = []
    for i, x in enumerate([0.35, 0.35, 0.43, 0.49, 0.51, 0.56, 0.56, 0.58, 0.58]):
        events += t.update([obj(x)], line, i * 0.2)
    assert len(events) == 1
    assert events[0]["direction"] == "A → B"
    assert t.update([obj(0.59)], line, 2) == []


def test_line_extension_and_disappearance_do_not_trigger():
    t = CrossingTracker()
    line = [[0.5, 0.2], [0.5, 0.8]]
    events = []
    for i, x in enumerate([0.4, 0.4, 0.48, 0.56, 0.56]):
        events += t.update([obj(x, 0.95)], line, i * 0.2)
    assert events == []
    t = CrossingTracker()
    t.update([obj(0.4)], line, 0)
    t.update([obj(0.4)], line, 0.2)
    assert t.update([obj(0.6)], line, 3) == []


def test_encrypted_settings_and_no_secret_echo(client):
    token = "123456:" + "A" * 30
    r = client.put(
        "/api/watch/settings", json={"token": token, "chat_id": "123456", "enabled": False}
    )
    assert r.status_code == 200 and token not in r.text
    assert client.get("/api/watch/settings").json()["configured"]
    # Test endpoint stays local when configuration is absent, tested separately.
    assert (
        client.put(
            "/api/watch/settings", json={"token": "bad", "chat_id": "1", "enabled": True}
        ).status_code
        == 422
    )


def test_watch_frame_auth_validation_and_events(client, monkeypatch):
    monkeypatch.setattr(ObjectEngine, "detect", lambda self, image: [obj(0.3)])
    payload = {"image": "jpeg", "session": "test", "line": [[0.5, 0], [0.5, 1]]}
    r = client.post("/api/watch/frame", json=payload)
    assert r.status_code == 200 and len(r.json()["objects"]) == 1
    assert (
        client.post(
            "/api/watch/frame", json=payload | {"line": [[0.5, 0.5], [0.5, 0.5]]}
        ).status_code
        == 422
    )
    client.cookies.clear()
    assert client.get("/api/watch/settings").status_code == 401


def test_telegram_failure_never_claims_delivery(client):
    r = client.post("/api/watch/test", json={})
    assert r.json()["delivery"] == "not_configured"


def test_telegram_transport_success_and_failure_without_network(client, monkeypatch):
    from app.watch import BotSettings, TelegramAlerts

    alerts = TelegramAlerts(client.app.state.store)
    alerts.save(BotSettings(token="123456:" + "A" * 30, chat_id="123", enabled=True))

    class Response:
        ok = True

        def json(self):
            return {"ok": True}

    calls = []

    def post(url, **kwargs):
        calls.append(kwargs["json"])
        return Response()

    monkeypatch.setattr("app.watch.requests.post", post)
    event = alerts.add({"class": "book", "direction": "A → B"})
    alerts.jobs.join()
    assert event["delivery"] == "sent"
    assert calls[0]["chat_id"] == "123"
    assert "book" in calls[0]["text"]
    assert "123456:" not in alerts.path.read_text()
    Response.ok = False
    event = alerts.add({"class": "book", "direction": "B → A"})
    alerts.jobs.join()
    assert event["delivery"] == "failed"


def person(x):
    return obj(x) | {"class": "person"}


def test_people_arrival_count_loss_grace_and_departure():
    from app.watch import PeopleTracker, message_text

    tracker = PeopleTracker()
    assert tracker.update([person(0.2), person(0.8)], 0, "22:00:00")[1] == []
    people, events = tracker.update([person(0.21), person(0.79)], 0.3, "22:00:01")
    assert len(people) == 2 and len(events) == 2
    assert all(e["visible_count"] == 2 for e in events)
    assert events[0]["first_seen"] == "22:00:00"
    assert tracker.update([person(0.22), person(0.78)], 0.6, "22:00:02")[1] == []
    assert tracker.update([], 1, "22:00:03")[1] == []
    assert tracker.update([person(0.23)], 1.3, "22:00:04")[1] == []
    people, events = tracker.update([person(0.24)], 3.7, "22:00:05")
    assert len(people) == 1 and len(events) == 1
    assert events[0]["kind"] == "departure"
    assert events[0]["last_seen"] == "22:00:02"
    text = message_text(events[0] | {"at": "22:00:05"})
    assert "1 nəfər" in text and "22:00:02" in text
    _, events = tracker.update([], 7, "22:00:08")
    assert events[0]["visible_count"] == 0
    assert tracker.update([], 8, "22:00:09")[1] == []


def test_people_ignores_objects_and_single_frame_noise():
    from app.watch import PeopleTracker

    tracker = PeopleTracker()
    tracker.update([person(0.2), obj(0.8)], 0, "a")
    tracker.update([], 0.3, "b")
    assert tracker.update([person(0.2)], 0.6, "c")[1] == []
    assert tracker.update([], 4, "d") == ([], [])


def test_people_api_count_and_no_duplicate_events(client, monkeypatch):
    monkeypatch.setattr(ObjectEngine, "detect", lambda self, image: [person(0.3), person(0.8)])
    payload = {"image": "jpeg", "session": "people", "mode": "people", "line": [[0.5, 0], [0.5, 1]]}
    assert client.post("/api/watch/frame", json=payload).json()["visible_count"] == 0
    data = client.post("/api/watch/frame", json=payload).json()
    assert data["visible_count"] == 2 and len(data["events"]) == 2
    assert all(e["kind"] == "arrival" and e["delivery"] == "disabled" for e in data["events"])
    assert client.post("/api/watch/frame", json=payload).json()["events"] == []


def test_photo_delivery_and_disable_without_saving_image(client, monkeypatch):
    from app.watch import BotSettings, TelegramAlerts

    alerts = TelegramAlerts(client.app.state.store)
    settings = dict(token="123456:" + "A" * 30, chat_id="123", enabled=True)
    alerts.save(BotSettings(**settings))
    calls = []

    class Response:
        ok = True

        def json(self):
            return {"ok": True}

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return Response()

    monkeypatch.setattr("app.watch.requests.post", post)
    snapshot = b"temporary-jpeg-bytes"
    e = alerts.add({"class": "person", "direction": "Gorundu"}, snapshot=snapshot)
    alerts.jobs.join()
    assert e["delivery"] == "sent" and e["attachment"] == "photo"
    assert calls[0][0].endswith("/sendPhoto")
    assert calls[0][1]["files"]["photo"] == ("facegate-event.jpg", snapshot, "image/jpeg")
    assert len(calls[0][1]["data"]["caption"]) <= 1024
    assert snapshot not in alerts.path.read_bytes()
    assert "snapshot" not in e and "photo" not in e
    e = alerts.add(
        {
            "class": "person",
            "direction": "Görüntüdən çıxdı",
            "kind": "departure",
            "track_id": 1,
            "visible_count": 0,
            "first_seen": "start",
            "last_seen": "end",
        },
        snapshot=snapshot,
    )
    alerts.jobs.join()
    assert e["attachment"] == "none" and calls[-1][0].endswith("/sendMessage")
    alerts.save(BotSettings(**settings, send_photos=False))
    e = alerts.add({"class": "book", "direction": "A → B"}, snapshot=snapshot)
    alerts.jobs.join()
    assert e["attachment"] == "none" and calls[-1][0].endswith("/sendMessage")


def test_photo_frame_uses_same_detection_frame(client, monkeypatch):
    import base64
    import threading

    monkeypatch.setattr(ObjectEngine, "detect", lambda self, image: [person(0.3)])
    captured = []
    finished = threading.Event()

    def post(url, **kwargs):
        captured.append((url, kwargs))
        finished.set()

        class Response:
            ok = True

            def json(self):
                return {"ok": True}

        return Response()

    monkeypatch.setattr("app.watch.requests.post", post)
    client.put(
        "/api/watch/settings",
        json={
            "token": "123456:" + "A" * 30,
            "chat_id": "123",
            "enabled": True,
            "send_photos": True,
        },
    )
    image = base64.b64encode(b"frame-that-triggered-arrival").decode()
    payload = {"image": image, "session": "photo", "mode": "people", "line": [[0.5, 0], [0.5, 1]]}
    client.post("/api/watch/frame", json=payload)
    response = client.post("/api/watch/frame", json=payload)
    assert response.json()["events"][0]["attachment"] == "photo"
    assert finished.wait(2)
    assert captured[0][1]["files"]["photo"][1] == b"frame-that-triggered-arrival"
    assert image not in client.get("/api/watch/events").text


def test_person_photos_once_per_minute_and_new_person_immediately():
    from app.watch import PeopleTracker

    tracker = PeopleTracker()
    tracker.update([person(0.2)], 0, "start")
    _, events = tracker.update([person(0.2)], 1, "confirmed")
    assert len(events) == 1 and events[0]["kind"] == "arrival"
    for second in range(2, 61):
        assert tracker.update([person(0.2)], second, str(second))[1] == []
    _, events = tracker.update([person(0.2)], 61, "minute")
    assert len(events) == 1 and events[0]["kind"] == "reminder"
    assert events[0]["first_seen"] == "start"
    tracker.update([person(0.2), person(0.8)], 62, "new person")
    _, events = tracker.update([person(0.2), person(0.8)], 63, "confirmed second")
    assert len(events) == 1 and events[0]["kind"] == "arrival"
    assert events[0]["track_id"] == 2 and events[0]["visible_count"] == 2
    for second in range(64, 121):
        assert tracker.update([person(0.2), person(0.8)], second, str(second))[1] == []
    _, events = tracker.update([person(0.2), person(0.8)], 121, "second minute")
    assert len(events) == 1 and events[0]["track_id"] == 1
    tracker.update([person(0.2), person(0.8)], 122, "122")
    _, events = tracker.update([person(0.2), person(0.8)], 123, "123")
    assert len(events) == 1 and events[0]["track_id"] == 2
