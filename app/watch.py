"""YOLO line crossing and local encrypted Telegram delivery configuration."""

import base64
import binascii
import json
import math
import queue
import re
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone

import requests
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BotSettings(Strict):
    token: str = Field(default="", max_length=180)
    chat_id: str = Field(default="", max_length=25)
    enabled: bool = False
    send_photos: bool = True


class Frame(Strict):
    image: str = Field(min_length=4, max_length=2_000_000)
    session: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,40}$")
    line: list[list[float]]
    mode: str = Field(default="crossing", pattern="^(crossing|people)$")


def side(point, line):
    a, b = line
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    return (dx * (point[1] - a[1]) - dy * (point[0] - a[0])) / length


def crosses(a, b, line):
    # Check the finite line segment, not its infinite extension.
    return side(line[0], [a, b]) * side(line[1], [a, b]) <= 0


class CrossingTracker:
    def __init__(self):
        self.tracks, self.next_id = [], 1

    def update(self, objects, line, now):
        self.tracks = [t for t in self.tracks if now - t["seen"] < 1.5]
        available = list(self.tracks)
        events = []
        for obj in objects[:64]:
            x, y, w, h = obj["bbox"]
            center = ((x + w / 2) / 480, (y + h / 2) / 360)
            choices = [
                (math.dist(center, t["center"]), t) for t in available if t["class"] == obj["class"]
            ]
            best = min(choices, key=lambda v: v[0]) if choices else None
            if best and best[0] < 0.20:
                track = best[1]
                available.remove(track)
            else:
                track = {
                    "id": self.next_id,
                    "class": obj["class"],
                    "stable": 0,
                    "origin": center,
                    "candidate": 0,
                    "hits": 0,
                    "sent": -1e9,
                }
                self.next_id += 1
                self.tracks.append(track)
            track.update(center=center, seen=now, box=obj["bbox"])
            distance = side(center, line)
            sign = 1 if distance > 0.025 else -1 if distance < -0.025 else 0
            if not sign:
                continue
            if track["candidate"] != sign:
                track.update(candidate=sign, hits=1)
            else:
                track["hits"] += 1
            if track["hits"] < 2:
                continue
            if track["stable"] and track["stable"] != sign:
                if (
                    now - track["sent"] >= 5
                    and math.dist(track["origin"], center) > 1e-5
                    and crosses(track["origin"], center, line)
                ):
                    events.append(
                        {
                            "track_id": track["id"],
                            "class": track["class"],
                            "direction": "A → B" if sign == -1 else "B → A",
                        }
                    )
                    track["sent"] = now
            track["stable"] = sign
            track["origin"] = center
        self.tracks = self.tracks[-128:]
        return events


def baku_time():
    return datetime.now(timezone(timedelta(hours=4))).isoformat()


class PeopleTracker:
    """Temporary geometry tracks: two-frame confirmation, three-second loss grace."""

    def __init__(self):
        self.tracks = []
        self.next_id = 1

    def update(self, objects, now, at):
        expired = [t for t in self.tracks if now - t["seen"] >= 3]
        self.tracks = [t for t in self.tracks if now - t["seen"] < 3]
        available = list(self.tracks)
        matched, arrivals = [], []
        for obj in [o for o in objects if o["class"] == "person"][:64]:
            x, y, w, h = obj["bbox"]
            center = ((x + w / 2) / 480, (y + h / 2) / 360)
            choices = [(math.dist(center, t["center"]), t) for t in available]
            best = min(choices, key=lambda v: v[0]) if choices else None
            if best and best[0] < 0.20:
                track = best[1]
                available.remove(track)
                track["hits"] += 1
            else:
                track = dict(id=self.next_id, first_seen=at, hits=1, confirmed=False)
                self.next_id += 1
                self.tracks.append(track)
            track.update(center=center, seen=now, last_seen=at, bbox=obj["bbox"])
            if track["hits"] >= 2 and not track["confirmed"]:
                track["confirmed"] = True
                track["notified"] = now
                arrivals.append(track)
            matched.append(track)
        for track in available:
            track["hits"] = 0
        visible = [t for t in matched if t["confirmed"]]
        count = len(visible)
        events = []
        reminders = [t for t in visible if now - t["notified"] >= 60]
        for track in reminders:
            track["notified"] = now
        for kind, tracks in [
            ("arrival", arrivals),
            ("reminder", reminders),
            ("departure", expired),
        ]:
            for track in tracks:
                if track["confirmed"]:
                    events.append(
                        dict(
                            kind=kind,
                            track_id=track["id"],
                            **{"class": "person"},
                            direction={
                                "arrival": "Göründü",
                                "reminder": "Hələ görünür (1 dəqiqə)",
                                "departure": "Görüntüdən çıxdı",
                            }[kind],
                            visible_count=count,
                            first_seen=track["first_seen"],
                            last_seen=track["last_seen"],
                        )
                    )
        self.tracks = self.tracks[-128:]
        people = [
            dict(
                track_id=t["id"],
                first_seen=t["first_seen"],
                last_seen=t["last_seen"],
                bbox=t["bbox"],
            )
            for t in visible
        ]
        return people, events


def message_text(event):
    if event.get("kind") in ("arrival", "reminder", "departure"):
        return (
            f"FaceGate · {event['direction']} · Person #{event['track_id']}\n"
            f"Hazırda görünən: {event['visible_count']} nəfər\n"
            f"İlk görünmə (Bakı): {event['first_seen']}\n"
            f"Son görünmə (Bakı): {event['last_seen']}\n"
            f"Bildiriş vaxtı: {event['at']}"
        )
    return f"FaceGate: {event['class']} · {event['direction']}\nBakı: {event['at']}\nHadisə: {event['id']}"


class TelegramAlerts:
    def __init__(self, store):
        self.path = store.path.parent / "telegram.enc"
        self.cipher = store.vault.cipher
        self.lock = threading.Lock()
        self.events = deque(maxlen=200)
        self.jobs = queue.Queue(maxsize=20)
        self.thread = None
        self.config = {"token": "", "chat_id": "", "enabled": False, "send_photos": True}
        if self.path.exists():
            self.config.update(json.loads(self.cipher.decrypt(self.path.read_bytes())))

    def public(self):
        with self.lock:
            return {
                "configured": bool(self.config["token"]),
                "chat_id": self.config["chat_id"],
                "enabled": self.config["enabled"],
                "send_photos": self.config["send_photos"],
            }

    def save(self, value):
        with self.lock:
            token = value.token or self.config["token"]
            if token and not re.fullmatch(r"[0-9]+:[a-zA-Z0-9_-]{20,160}", token):
                raise HTTPException(422, "BOT_TOKEN_INVALID")
            if value.chat_id and not re.fullmatch(r"-?[0-9]{1,22}", value.chat_id):
                raise HTTPException(422, "CHAT_ID_INVALID")
            if value.enabled and not (token and value.chat_id):
                raise HTTPException(422, "BOT_SETTINGS_REQUIRED")
            self.config = {
                "token": token,
                "chat_id": value.chat_id,
                "enabled": value.enabled,
                "send_photos": value.send_photos,
            }
            temporary = self.path.with_suffix(".tmp")
            temporary.write_bytes(self.cipher.encrypt(json.dumps(self.config).encode()))
            temporary.replace(self.path)
        return self.public()

    def discover(self):
        with self.lock:
            token = self.config["token"]
        if not token:
            raise HTTPException(422, "BOT_TOKEN_REQUIRED")
        try:
            response = requests.get(
                f"https://api.telegram.org/bot{token}/getUpdates",
                params={"timeout": 0, "limit": 100},
                timeout=8,
            )
            data = response.json()
            if not response.ok or not data.get("ok"):
                raise ValueError()
            chats = {
                str(m["message"]["chat"]["id"]): m["message"]["chat"].get("title")
                or m["message"]["chat"].get("first_name", "Chat")
                for m in data["result"]
                if "message" in m
            }
            return [{"id": key, "title": value} for key, value in chats.items()]
        except (requests.RequestException, ValueError, KeyError):
            raise HTTPException(502, "TELEGRAM_UPDATES_FAILED") from None

    def add(self, event, force=False, snapshot=None):
        event = dict(
            event,
            id=str(uuid.uuid4()),
            at=baku_time(),
            delivery="disabled",
            attachment="none",
        )
        with self.lock:
            config = dict(self.config)
            self.events.appendleft(event)
            if not config["enabled"] and not force:
                return event
            if not config["token"] or not config["chat_id"]:
                event["delivery"] = "not_configured"
                return event
            try:
                photo = (
                    snapshot if config["send_photos"] and event.get("kind") != "departure" else None
                )
                self.jobs.put_nowait((event, config, photo))
                event["attachment"] = "photo" if photo else "none"
                event["delivery"] = "queued"
            except queue.Full:
                event["delivery"] = "queue_full"
                return event
            if not self.thread or not self.thread.is_alive():
                self.thread = threading.Thread(target=self.run, daemon=True)
                self.thread.start()
        return event

    def run(self):
        while True:
            try:
                event, config, photo = self.jobs.get()
            except queue.Empty:
                return
            with self.lock:
                current = dict(self.config)
            if current != config:
                with self.lock:
                    event["delivery"] = "cancelled"
                photo = None
                self.jobs.task_done()
                continue
            try:
                text = message_text(event)
                if photo:
                    r = requests.post(
                        f"https://api.telegram.org/bot{config['token']}/sendPhoto",
                        data={
                            "chat_id": config["chat_id"],
                            "caption": (text + "\nŞəkil: bildiriş anındakı kamera görüntüsü")[
                                :1024
                            ],
                        },
                        files={"photo": ("facegate-event.jpg", photo, "image/jpeg")},
                        timeout=12,
                    )
                else:
                    r = requests.post(
                        f"https://api.telegram.org/bot{config['token']}/sendMessage",
                        json={"chat_id": config["chat_id"], "text": text},
                        timeout=8,
                    )
                result = "sent" if r.ok and r.json().get("ok") else "failed"
            except (requests.RequestException, ValueError):
                result = "failed"
            with self.lock:
                event["delivery"] = result
            # Release image and response payload references while the worker is idle.
            photo = None
            r = None
            self.jobs.task_done()


def register_watch(app, store, auth, engine, slots):
    alerts = TelegramAlerts(store)
    sessions = {}
    lock = threading.Lock()

    @app.get("/api/watch/settings")
    def settings():
        return alerts.public()

    @app.put("/api/watch/settings")
    def save_settings(value: BotSettings):
        return alerts.save(value)

    @app.get("/api/watch/chats")
    def chats():
        return alerts.discover()

    @app.post("/api/watch/test")
    def test():
        return alerts.add({"class": "Test bildirişi", "direction": "Bağlantı sınağı"}, force=True)

    @app.get("/api/watch/events")
    def events():
        with alerts.lock:
            return [dict(e) for e in alerts.events]

    @app.post("/api/watch/frame")
    def frame(payload: Frame, request: Request):
        line = payload.line
        if (
            len(line) != 2
            or any(
                len(p) != 2 or any(not math.isfinite(v) or not 0 <= v <= 1 for v in p) for p in line
            )
            or math.dist(*line) < 0.1
        ):
            raise HTTPException(422, "LINE_INVALID")
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            objects = engine.detect(payload.image)
            now = time.monotonic()
            key = (auth._digest(request.cookies[auth.COOKIE]), payload.session)
            signature = (payload.mode, *(v for p in line for v in p))
            with lock:
                for k in list(sessions):
                    if now - sessions[k][0] > 30:
                        del sessions[k]
                if key not in sessions or sessions[key][1] != signature:
                    if len(sessions) >= 32:
                        del sessions[next(iter(sessions))]
                    sessions[key] = (
                        now,
                        signature,
                        PeopleTracker() if payload.mode == "people" else CrossingTracker(),
                    )
                tracker = sessions[key][2]
                sessions[key] = (now, signature, tracker)
                people = []
                if payload.mode == "people":
                    people, arrivals = tracker.update(objects, now, baku_time())
                else:
                    arrivals = tracker.update(objects, line, now)
            snapshot = None
            if (
                any(e.get("kind") != "departure" for e in arrivals)
                and alerts.public()["send_photos"]
            ):
                try:
                    snapshot = base64.b64decode(payload.image.split(",", 1)[-1], validate=True)
                except (ValueError, binascii.Error):
                    pass  # Inference already validates real frames; retain text delivery on failure.
            return {
                "objects": objects,
                "people": people,
                "visible_count": len(people),
                "events": [alerts.add(e, snapshot=snapshot) for e in arrivals],
            }
        finally:
            slots.release()
