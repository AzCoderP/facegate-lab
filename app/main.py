import ipaddress
import logging
import math
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal

import requests
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.objects import ObjectEngine
from app.rules import access_reason
from app.security import AdminAuth, ConfigurationError, RateLimiter, VaultError
from app.storage import Store, utc_now
from app.tracking import PresenceSessions
from app.vision import FaceEngine, VisionError
from app.watch import register_watch

ROOT = Path(__file__).resolve().parent.parent
Identifier = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")]
Image = Annotated[str, Field(min_length=4, max_length=2_000_000)]
VERSION = "0.2.0"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rules(StrictModel):
    active: bool = True
    door: Identifier = "Main-Gate"
    start_time: str = "00:00"
    end_time: str = "00:00"

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time(cls, value):
        try:
            return datetime.strptime(value, "%H:%M").strftime("%H:%M")
        except ValueError:
            raise ValueError("Use HH:MM, e.g. 09:00") from None


class Enrollment(Rules):
    id: Identifier
    name: str = Field(min_length=1, max_length=80)
    images: list[Image] = Field(min_length=3, max_length=3)
    consent: Literal[True]

    @field_validator("name")
    @classmethod
    def validate_name(cls, value):
        if not value.strip() or any(ord(char) < 32 for char in value):
            raise ValueError("Name cannot be blank or contain control characters")
        return value.strip()


class Attempt(StrictModel):
    event_id: Identifier
    user_id: Identifier
    door: Identifier = "Main-Gate"
    image: Image


class SelfCheck(StrictModel):
    user_id: Identifier
    image: Image
    consent: Literal[True]


class ObjectFrame(StrictModel):
    image: Image


class PresenceFrame(StrictModel):
    image: Image
    tracking_session: Identifier


class PresenceStop(StrictModel):
    tracking_session: Identifier


class Preview(StrictModel):
    user_id: Identifier
    door: Identifier = "Main-Gate"
    at: datetime

    @field_validator("at")
    @classmethod
    def timezone_required(cls, value):
        if value.tzinfo is None:
            raise ValueError("Include timezone, e.g. +04:00")
        return value


class Login(StrictModel):
    key: str = Field(min_length=1, max_length=128)


class Settings(StrictModel):
    threshold: float = Field(gt=0, le=1, allow_inf_nan=False)


def secure_headers(response):
    response.headers.update(
        {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
            "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
        }
    )
    return response


def create_app(db_path=None, engine=None, admin_key=None):
    app = FastAPI(
        title="FaceGate Lab", version=VERSION, docs_url=None, redoc_url=None, openapi_url=None
    )
    store = Store(Path(db_path or os.environ.get("FACEGATE_DB", ROOT / "data" / "facegate.db")))
    auth = AdminAuth(store.path.parent, admin_key)
    engine = engine or FaceEngine(ROOT / "models")
    default_threshold = float(os.environ.get("FACEGATE_THRESHOLD", "0.363"))
    if not math.isfinite(default_threshold) or not 0 < default_threshold <= 1:
        raise ValueError("FACEGATE_THRESHOLD must be finite, greater than 0 and at most 1")
    operation_lock = threading.Lock()
    slots = threading.BoundedSemaphore(3)
    writes, logins = RateLimiter(40), RateLimiter(5)
    presence_frames = RateLimiter(600)
    presence_sessions = PresenceSessions()
    object_engine = ObjectEngine(ROOT)
    register_watch(app, store, auth, object_engine, slots)
    app.state.store, app.state.auth = store, auth
    app.state.writes, app.state.logins = writes, logins

    @app.middleware("http")
    async def boundary(request: Request, call_next):
        def reject(status, code):
            result = JSONResponse({"detail": code}, status_code=status)
            if status == 429:
                result.headers["Retry-After"] = "60"
            return secure_headers(result)

        if request.url.hostname not in ("localhost", "127.0.0.1"):
            return reject(400, "INVALID_HOST")
        try:
            local_client = request.client and ipaddress.ip_address(request.client.host).is_loopback
        except ValueError:
            local_client = False
        if not local_client:
            return reject(403, "LOOPBACK_REQUIRED")
        origin = request.headers.get("origin")
        if (origin and origin != str(request.base_url).rstrip("/")) or request.headers.get(
            "sec-fetch-site"
        ) == "cross-site":
            return reject(403, "CROSS_ORIGIN_BLOCKED")
        write = request.method not in ("GET", "HEAD", "OPTIONS")
        if write and request.headers.get("x-facegate-lab") != "local":
            return reject(403, "LAB_HEADER_REQUIRED")
        path = request.url.path
        session = auth.session(request.cookies.get(auth.COOKIE), touch=write)
        public = path in ("/api/auth/login", "/api/auth/status", "/api/live")
        if path.startswith("/api/") and not public:
            if not session:
                return reject(401, "AUTH_REQUIRED")
            if write:
                csrf = request.headers.get("x-csrf-token", "")
                if not secrets.compare_digest(csrf, session["csrf"]):
                    return reject(403, "CSRF_INVALID")
                limiter = (
                    presence_frames
                    if path in ("/api/presence", "/api/objects", "/api/watch/frame")
                    else writes
                )
                if not limiter.allow(auth._digest(request.cookies[auth.COOKIE])):
                    return reject(429, "RATE_LIMITED")
        if path == "/api/auth/login" and write and not logins.allow("local-admin"):
            return reject(429, "RATE_LIMITED")
        if request.method in ("POST", "PUT", "PATCH") and not request.headers.get(
            "content-type", ""
        ).startswith("application/json"):
            return reject(415, "JSON_REQUIRED")
        body = bytearray()
        # Smaller limits for login and settings; cap actual streamed bytes, not just a header.
        maximum = (
            6_100_000
            if path == "/api/users"
            else 2_100_000
            if path
            in (
                "/api/verify",
                "/api/presence",
                "/api/objects",
                "/api/self-check",
                "/api/watch/frame",
            )
            else 4096
        )
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > maximum:
                return reject(413, "REQUEST_TOO_LARGE")
        request._body = bytes(body)
        return secure_headers(await call_next(request))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        # Pydantic's default error includes rejected image/key input. Never echo it.
        return JSONResponse(
            {
                "detail": "VALIDATION_ERROR",
                "fields": [".".join(str(v) for v in e["loc"]) for e in exc.errors()],
            },
            status_code=422,
        )

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, exc):
        logging.error("Database failure: %s", type(exc).__name__)
        return JSONResponse({"detail": "DATABASE_UNAVAILABLE"}, status_code=503)

    @app.exception_handler(VaultError)
    async def vault_error(request, exc):
        return JSONResponse({"detail": "TEMPLATE_UNAVAILABLE"}, status_code=503)

    @app.exception_handler(ConfigurationError)
    async def configuration_error(request, exc):
        return JSONResponse({"detail": "CONFIG_INVALID"}, status_code=503)

    @app.exception_handler(VisionError)
    async def vision_error(request, exc):
        status = 503 if exc.code in ("MODELS_MISSING", "MODEL_LOAD_FAILED", "VISION_ERROR") else 422
        return JSONResponse({"detail": exc.code}, status_code=status)

    @app.get("/api/live")
    def live():
        return {"status": "ok", "version": VERSION}

    @app.get("/api/auth/status")
    def auth_status(request: Request):
        session = auth.session(request.cookies.get(auth.COOKIE), touch=False)
        return {"authenticated": bool(session), "csrf": session["csrf"] if session else None}

    @app.post("/api/auth/login")
    def login(payload: Login, request: Request):
        result = auth.login(payload.key)
        if not result:
            raise HTTPException(401, "LOGIN_FAILED")
        token, csrf = result
        try:
            store.audit("ADMIN_LOGIN")
        except sqlite3.Error:
            auth.logout(token)
            raise
        auth.logout(request.cookies.get(auth.COOKIE))
        response = JSONResponse({"authenticated": True, "csrf": csrf})
        response.set_cookie(
            auth.COOKIE,
            token,
            httponly=True,
            samesite="strict",
            secure=False,
            max_age=auth.ABSOLUTE_SECONDS,
            path="/",
        )
        return response

    @app.post("/api/auth/logout")
    def logout(request: Request):
        auth.logout(request.cookies.get(auth.COOKIE))
        response = JSONResponse({"authenticated": False})
        response.delete_cookie(auth.COOKIE, path="/", samesite="strict", httponly=True)
        return response

    @app.get("/api/health")
    def health():
        with store.connection() as db:
            db.execute("SELECT 1").fetchone()
        return {
            "status": "ok",
            "database": "ok",
            "models": "available" if engine.ready else "missing",
            "threshold": store.threshold(default_threshold),
            "timezone": "Asia/Baku (UTC+04:00)",
            "server_time": utc_now(),
            "version": VERSION,
            "encrypted_templates": True,
            "pad": False,
            "physical_door": False,
        }

    @app.get("/api/shared-board")
    def shared_board(
        after: int = Query(-1, ge=-1, le=1_000_000_000), generation: str = Query("", max_length=80)
    ):
        # The browser keeps its existing FaceGate session. No phone or admin key in URLs.
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            with requests.Session() as bridge:
                bridge.trust_env = False
                response = bridge.get(
                    "http://127.0.0.1:8011/api/board/local",
                    params={"after": after, "generation": generation},
                    headers={"X-FaceGate-Board-Key": auth.key},
                    timeout=0.8,
                )
                if response.status_code != 200:
                    raise HTTPException(503, "BOARD_SERVICE_UNAVAILABLE")
                return response.json()
        except (requests.RequestException, ValueError):
            raise HTTPException(503, "BOARD_SERVICE_UNAVAILABLE") from None
        finally:
            slots.release()

    @app.get("/api/stats")
    def stats():
        return store.stats()

    @app.get("/api/audit")
    def audits():
        return store.audits()

    @app.get("/api/users")
    def users(
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0, le=1_000_000),
        q: str = Query("", max_length=80),
    ):
        return store.users(limit, offset, q)

    @app.post("/api/users", status_code=201)
    def enroll(payload: Enrollment):
        if len({engine.sample_key(image) for image in payload.images}) != 3:
            raise HTTPException(422, "DUPLICATE_SAMPLES")
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            with operation_lock:
                if store.user(payload.id):
                    raise HTTPException(409, "USER_EXISTS")
                templates = [engine.embedding(image) for image in payload.images]
                threshold = store.threshold(default_threshold)
                for i in range(3):
                    for j in range(i):
                        score = engine.similarity(templates[i], [templates[j]])
                        if not math.isfinite(score) or score < threshold:
                            raise HTTPException(422, "ENROLLMENT_INCONSISTENT")
                store.add_user(payload, templates)
                return {"id": payload.id, "samples": 3}
        finally:
            slots.release()

    @app.patch("/api/users/{user_id}")
    def update_user(user_id: Identifier, payload: Rules):
        with operation_lock:
            if not store.update_user(
                user_id, payload.active, payload.door, payload.start_time, payload.end_time
            ):
                raise HTTPException(404, "USER_NOT_FOUND")
        return {"updated": True}

    @app.delete("/api/users/{user_id}")
    def delete_user(user_id: Identifier):
        with operation_lock:
            if not store.delete_user(user_id):
                raise HTTPException(404, "USER_NOT_FOUND")
        return {"deleted": True}

    @app.put("/api/settings")
    def settings(payload: Settings):
        with operation_lock:
            store.set_threshold(payload.threshold)
        return {"threshold": payload.threshold}

    @app.post("/api/verify")
    def verify(payload: Attempt):
        started = time.perf_counter()
        fingerprint = store.vault.fingerprint(payload.model_dump_json())
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            with operation_lock:
                old = store.event(payload.event_id)
                if old:
                    if not secrets.compare_digest(old["fingerprint"], fingerprint):
                        raise HTTPException(409, "EVENT_ID_CONFLICT")
                    return {k: v for k, v in old.items() if k != "fingerprint"} | {"replayed": True}
                score, reason = None, "USER_NOT_FOUND"
                try:
                    user = store.user(payload.user_id)
                    if user:
                        feature = engine.embedding(payload.image)
                        score = engine.similarity(feature, user["templates"])
                        if not math.isfinite(score) or not -1.00001 <= score <= 1.00001:
                            raise VisionError("INVALID_FEATURE")
                        reason = (
                            "FACE_MISMATCH"
                            if score < store.threshold(default_threshold)
                            else access_reason(user, payload.door)
                        )
                except VisionError as exc:
                    reason, score = exc.code, None
                except VaultError:
                    reason, score = "TEMPLATE_UNAVAILABLE", None
                except ConfigurationError:
                    reason, score = "CONFIG_INVALID", None
                event = {
                    "event_id": payload.event_id,
                    "user_id": payload.user_id,
                    "door": payload.door,
                    "timestamp": utc_now(),
                    "mode": "FACE_VERIFICATION",
                    "decision": "GRANTED" if reason == "GRANTED" else "DENIED",
                    "reason": reason,
                    "score": score,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
                    "fingerprint": fingerprint,
                }
                store.add_event(event)
                return {k: v for k, v in event.items() if k != "fingerprint"} | {"replayed": False}
        finally:
            slots.release()

    @app.post("/api/self-check")
    def self_check(payload: SelfCheck):
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            with operation_lock:
                user = store.user(payload.user_id)
                if not user:
                    raise HTTPException(404, "USER_NOT_FOUND")
                if not user["active"]:
                    raise HTTPException(403, "USER_DISABLED")
                try:
                    feature = engine.embedding(payload.image)
                    score = engine.similarity(feature, user["templates"])
                except VisionError as exc:
                    return {"verified": False, "reason": exc.code}
                verified = math.isfinite(score) and score >= store.threshold(default_threshold)
                return {
                    "verified": verified,
                    "name": user["name"] if verified else None,
                    "reason": "MATCH" if verified else "FACE_MISMATCH",
                }
        finally:
            slots.release()

    @app.post("/api/objects")
    def objects(payload: ObjectFrame):
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            return {"objects": object_engine.detect(payload.image)}
        finally:
            slots.release()

    @app.post("/api/presence")
    def presence(payload: PresenceFrame, request: Request):
        if not slots.acquire(blocking=False):
            raise HTTPException(503, "SYSTEM_BUSY")
        try:
            started = time.perf_counter()
            boxes = engine.presence(payload.image)
            at = utc_now()
            result = presence_sessions.update(
                auth._digest(request.cookies[auth.COOKIE]), payload.tracking_session, boxes, at
            )
            return result | {
                "at": at,
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
            }
        finally:
            slots.release()

    @app.post("/api/presence/stop")
    def presence_stop(payload: PresenceStop, request: Request):
        presence_sessions.clear(
            auth._digest(request.cookies[auth.COOKIE]), payload.tracking_session
        )
        return {"stopped": True}

    @app.post("/api/policy-preview")
    def preview(payload: Preview):
        with operation_lock:
            user = store.user(payload.user_id)
            reason = access_reason(user, payload.door, payload.at) if user else "USER_NOT_FOUND"
        return {"simulation": True, "reason": reason, "biometric_checked": False}

    @app.get("/api/events")
    def events(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0, le=1_000_000),
        user_id: Identifier | None = None,
        decision: Literal["GRANTED", "DENIED"] | None = None,
    ):
        return store.events(limit, offset, user_id, decision)

    @app.get("/")
    def index():
        return FileResponse(ROOT / "web" / "index.html")

    app.mount("/static", StaticFiles(directory=ROOT / "web"), name="static")
    return app


app = create_app()
