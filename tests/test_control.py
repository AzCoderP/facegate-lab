"""Drawing service authorization, retry handling, version boundaries and removed camera routes."""

from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.board import DrawPatch, SharedBoard
from app.control import Approval, ControlHub, Pair, create_control_app

ROOT = Path(__file__).resolve().parent.parent
KEY = "test-drawing-admin-key-123456789"


def paired(hub):
    return hub.pair(Pair(code=hub.invite()["code"], name="Phone"))["token"]


def patch(hub, seq=1, **kwargs):
    return DrawPatch(
        generation=hub.board.generation,
        seq=seq,
        op="begin",
        stroke="stroke1",
        points=[(0.1, 0.2)],
        **kwargs,
    )


def test_pair_attempt_limit_expiry_and_single_use():
    clock = [0]
    hub = ControlHub(clock=lambda: clock[0])
    code = hub.invite()["code"]
    wrong = "00000000" if code != "00000000" else "11111111"
    for _ in range(5):
        with pytest.raises(HTTPException):
            hub.pair(Pair(code=wrong, name="x"))
    with pytest.raises(HTTPException):
        hub.pair(Pair(code=code, name="Phone"))
    token = paired(hub)
    assert not hub.state(token)["approved"]
    with pytest.raises(HTTPException):
        hub.pair(Pair(code=code, name="x"))
    code = hub.invite()["code"]
    clock[0] = 121
    with pytest.raises(HTTPException):
        hub.pair(Pair(code=code, name="x"))


def test_drawing_requires_approval_and_identical_retry_is_idempotent():
    hub = ControlHub()
    token = paired(hub)
    value = patch(hub)
    with pytest.raises(HTTPException):
        hub.draw(token, value)
    hub.approve()
    response = hub.draw(token, value)
    assert hub.draw(token, value) == response
    assert len(hub.board.strokes) == 1 and len(hub.board.strokes[0]["points"]) == 1
    different = value.model_copy(update={"color": "#ff0000"})
    with pytest.raises(HTTPException):
        hub.draw(token, different)
    hub.draw(
        token,
        DrawPatch(
            generation=hub.board.generation,
            seq=2,
            op="append",
            stroke="stroke1",
            points=[(0.3, 0.4)],
        ),
    )
    assert len(hub.board.strokes[0]["points"]) == 2
    hub.approve(Approval(drawing=False))
    with pytest.raises(HTTPException):
        hub.draw(token, value)


def test_revocation_idle_and_absolute_expiry_clear_board():
    clock = [0]
    hub = ControlHub(clock=lambda: clock[0])
    token = paired(hub)
    hub.approve()
    hub.draw(token, patch(hub))
    clock[0] = 30
    with pytest.raises(HTTPException):
        hub.state(token)
    assert hub.board.strokes == []
    token = paired(hub)
    for second in range(31, 1830, 10):
        clock[0] = second
        hub.state(token)
    clock[0] = 1830
    with pytest.raises(HTTPException):
        hub.state(token)
    token = paired(hub)
    hub.revoke()
    with pytest.raises(HTTPException):
        hub.state(token)


def test_deltas_clear_undo_and_stale_generation():
    board = SharedBoard()
    generation = board.generation
    old_revision = board.revision
    board.apply(
        DrawPatch(generation=generation, seq=1, op="begin", stroke="s", points=[(0.1, 0.2)])
    )
    board.apply(
        DrawPatch(generation=generation, seq=2, op="append", stroke="s", points=[(0.2, 0.3)])
    )
    board.apply(DrawPatch(generation=generation, seq=3, op="end", stroke="s"))
    assert [e["op"] for e in board.read(old_revision, generation)["events"]] == [
        "begin",
        "append",
        "end",
    ]
    assert len(board.read()["strokes"][0]["points"]) == 2
    board.apply(DrawPatch(generation=generation, seq=4, op="undo"))
    assert board.strokes == []
    board.apply(DrawPatch(generation=generation, seq=5, op="clear"))
    assert generation != board.generation
    with pytest.raises(HTTPException):
        board.apply(
            DrawPatch(generation=generation, seq=6, op="begin", stroke="s", points=[(0.2, 0.3)])
        )


def test_storage_limits_and_old_delta_resync():
    board = SharedBoard()
    generation = board.generation
    start = board.revision
    board.apply(DrawPatch(generation=generation, seq=1, op="begin", stroke="s", points=[(0, 0)]))
    for i in range(300):
        board.apply(
            DrawPatch(
                generation=generation, seq=i + 2, op="append", stroke="s", points=[(0.5, 0.5)]
            )
        )
    assert len(board.events) == 256
    assert "strokes" in board.read(start, generation)
    for _ in range(15):
        board.apply(
            DrawPatch(
                generation=generation, seq=1, op="append", stroke="s", points=[(0.5, 0.5)] * 48
            )
        )
    with pytest.raises(HTTPException):
        board.apply(
            DrawPatch(
                generation=generation, seq=1, op="append", stroke="s", points=[(0.5, 0.5)] * 48
            )
        )
    for point in ([(-0.1, 0.2)], [(float("nan"), 0.2)]):
        with pytest.raises(ValidationError):
            DrawPatch(generation=generation, seq=1, op="begin", points=point)


def test_removed_camera_and_os_input_routes_and_approved_board_roundtrip():
    hub = ControlHub()
    operator = create_control_app(ROOT, hub, admin_key=KEY)
    phone = create_control_app(ROOT, hub, public_origin="https://example.ts.net")
    headers = {"X-Secure-Control": "1"}
    with (
        TestClient(operator, base_url="http://127.0.0.1:8011", headers=headers) as desktop,
        TestClient(phone, base_url="http://127.0.0.1:8010", headers=headers) as mobile,
    ):
        desktop.headers["Authorization"] = (
            "Bearer " + desktop.post("/api/login", json={"key": KEY}).json()["token"]
        )
        invite = desktop.post("/api/invite", json={}).json()
        mobile.headers["Authorization"] = (
            "Bearer "
            + mobile.post("/api/pair", json={"code": invite["code"], "name": "Phone"}).json()[
                "token"
            ]
        )
        assert mobile.get("/api/board").status_code == 403
        assert desktop.post("/api/approve", json={"drawing": True}).status_code == 200
        assert desktop.post("/api/approve", json={"camera": True}).status_code == 422
        value = patch(hub).model_dump(mode="json")
        assert mobile.post("/api/board", json=value).status_code == 200
        assert len(desktop.get("/api/board").json()["strokes"]) == 1
        assert desktop.get("/api/board/local").status_code == 401
        bridge = desktop.get("/api/board/local", headers={"X-FaceGate-Board-Key": KEY})
        assert len(bridge.json()["strokes"]) == 1
        assert "token" not in mobile.get("/api/state").json()
        for client in (desktop, mobile):
            for path in (
                "/api/frame",
                "/api/stream",
                "/api/screen",
                "/api/users",
                "/data/admin.key",
            ):
                assert client.get(path).status_code == 404
            for path in (
                "/api/camera/start",
                "/api/camera/frame",
                "/api/camera/stop",
                "/api/command",
                "/api/lease/on",
            ):
                assert client.post(path, json={}).status_code == 404
            assert "camera=()" in client.get("/").headers["permissions-policy"]
        assert mobile.get("/api/board/local").status_code == 404
        assert mobile.get("/static/control-admin.js").status_code == 404
        assert mobile.post("/api/approve", json={"drawing": True}).status_code == 404
        assert desktop.post("/api/revoke", json={}).status_code == 200
        assert hub.board.strokes == [] and mobile.get("/api/board").status_code == 401


def test_origin_host_limits_and_no_secret_echo():
    hub = ControlHub()
    app = create_control_app(ROOT, hub, admin_key=KEY)
    phone = create_control_app(ROOT, hub, public_origin="https://example.ts.net")
    with TestClient(
        app, base_url="http://127.0.0.1:8011", headers={"X-Secure-Control": "1"}
    ) as client:
        r = client.post("/api/login", json={"key": "SECRET", "extra": "SECRET"})
        assert r.status_code == 422 and "SECRET" not in r.text
        assert client.post("/api/login", json={"key": "x" * 5000}).status_code == 403
        assert (
            client.post(
                "/api/login", json={"key": KEY}, headers={"Origin": "https://evil.test"}
            ).status_code
            == 403
        )
        assert client.get("/", headers={"Host": "evil.test"}).status_code == 403
    with TestClient(phone, base_url="http://127.0.0.1:8010") as client:
        assert (
            client.get(
                "/", headers={"Host": "example.ts.net", "Origin": "https://example.ts.net"}
            ).status_code
            == 200
        )
        assert client.get("/api/board").status_code == 401


def test_main_board_bridge_uses_local_key_without_returning_it(client, monkeypatch):
    class Response:
        status_code = 200

        def json(self):
            return {"generation": "test-generation", "revision": 1, "strokes": []}

    class Session:
        trust_env = True

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def get(self, url, **kwargs):
            assert self.trust_env is False
            assert url == "http://127.0.0.1:8011/api/board/local"
            assert kwargs["headers"]["X-FaceGate-Board-Key"] == client.app.state.auth.key
            return Response()

    monkeypatch.setattr("app.main.requests.Session", Session)
    r = client.get("/api/shared-board")
    assert r.status_code == 200 and client.app.state.auth.key not in r.text
    client.cookies.clear()
    assert client.get("/api/shared-board").status_code == 401
