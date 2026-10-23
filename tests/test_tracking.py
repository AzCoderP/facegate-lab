from app.tracking import PresenceSessions, Tracker


def test_multiple_faces_and_no_duplicate_arrivals():
    tracker = Tracker()
    first = tracker.update([[0.1, 0.1, 0.15, 0.2], [0.7, 0.1, 0.15, 0.2]], "first", 0)
    assert first["count"] == 2
    assert [t["id"] for t in first["arrivals"]] == [1, 2]
    for i in range(1, 20):
        step = tracker.update(
            [[0.7 - i * 0.005, 0.1, 0.15, 0.2], [0.1 + i * 0.005, 0.1, 0.15, 0.2]], str(i), i * 0.1
        )
        assert step["arrivals"] == []
        assert step["tracks"][0]["first"] == "first"
        assert step["tracks"][0]["last"] == str(i)
        assert step["tracks"][0]["box"][0] < step["tracks"][1]["box"][0]


def test_detector_dropout_keeps_track_but_does_not_count_it():
    tracker = Tracker()
    tracker.update([[0.1, 0.1, 0.2, 0.2]], "start", 0)
    blank = tracker.update([], "blank", 0.2)
    assert blank["count"] == 0
    back = tracker.update([[0.12, 0.1, 0.2, 0.2]], "back", 0.5)
    assert back["arrivals"] == []
    assert back["tracks"][0]["id"] == 1
    assert back["tracks"][0]["first"] == "start"
    assert back["tracks"][0]["last"] == "back"


def test_exit_and_new_entry_after_timeout():
    tracker = Tracker()
    tracker.update([[0.1, 0.1, 0.2, 0.2]], "start", 0)
    tracker.update([], "gone", 0.2)
    result = tracker.update([[0.1, 0.1, 0.2, 0.2]], "return", 2)
    assert result["arrivals"][0]["id"] == 2
    assert result["tracks"][0]["first"] == "return"


def test_two_detections_cannot_share_a_track():
    tracker = Tracker()
    tracker.update([[0.1, 0.1, 0.2, 0.2]], "first", 0)
    result = tracker.update([[0.1, 0.1, 0.2, 0.2], [0.12, 0.1, 0.2, 0.2]], "second", 0.2)
    assert len({t["id"] for t in result["tracks"]}) == 2
    assert len(result["arrivals"]) == 1


def test_session_isolation_clear_and_expiry(monkeypatch):
    clock = [0]
    monkeypatch.setattr("app.tracking.time.monotonic", lambda: clock[0])
    sessions = PresenceSessions()
    a = sessions.update("owner-a", "camera", [[0.1, 0.1, 0.2, 0.2]], "now")
    b = sessions.update("owner-b", "camera", [[0.1, 0.1, 0.2, 0.2]], "now")
    assert a["tracking_epoch"] != b["tracking_epoch"]
    sessions.clear("owner-a", "camera")
    assert ("owner-b", "camera") in sessions.sessions
    clock[0] = 31
    c = sessions.update("owner-b", "camera", [], "later")
    assert c["tracking_epoch"] != b["tracking_epoch"]
    assert len(sessions.sessions) == 1


def test_bounded_session_memory():
    sessions = PresenceSessions()
    for i in range(100):
        sessions.update("owner", str(i), [], "now")
    assert len(sessions.sessions) == sessions.capacity
