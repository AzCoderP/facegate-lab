"""Session-limited phone drawing board. No remote camera or desktop control routes."""

import hashlib
import secrets
import threading
import time
from collections import deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from app.board import DrawPatch, SharedBoard
from app.security import RateLimiter


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(Strict):
    key: str = Field(min_length=24, max_length=256)


class Pair(Strict):
    code: str = Field(pattern=r"^\d{8}$")
    name: str = Field(min_length=1, max_length=40)


class Approval(Strict):
    drawing: bool = True


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class ControlHub:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.RLock()
        self.code = None
        self.code_until = 0
        self.attempts = 0
        self.session = None
        self.audit = deque(maxlen=100)
        self.board = SharedBoard()
        self.draw_writes = RateLimiter(30, 1)

    def record(self, action):
        self.audit.appendleft({"action": action, "at": time.strftime("%H:%M:%S")})

    def revoke(self):
        with self.lock:
            self.session = None
            self.code = None
            self.board.reset()
            self.record("Sessiya dayandırıldı")

    def invite(self):
        with self.lock:
            self.revoke()
            self.code = f"{secrets.randbelow(100_000_000):08d}"
            self.code_until = self.clock() + 120
            self.attempts = 0
            return {"code": self.code, "expires_in": 120}

    def pair(self, value):
        with self.lock:
            self.attempts += 1
            if (
                self.attempts > 5
                or self.clock() >= self.code_until
                or not self.code
                or not secrets.compare_digest(value.code, self.code)
            ):
                if self.attempts >= 5:
                    self.code = None
                raise HTTPException(401, "PAIRING_FAILED")
            token = secrets.token_urlsafe(32)
            self.code = None
            self.session = dict(
                token=digest(token),
                name=value.name,
                approved=False,
                created=self.clock(),
                last=self.clock(),
                permissions={"drawing": False},
                draw_seq=0,
                draw_hash=None,
                draw_result=None,
            )
            self.record("Telefon təsdiq gözləyir")
            return {"token": token}

    def prune(self):
        s = self.session
        if s and (self.clock() - s["created"] >= 1800 or self.clock() - s["last"] >= 30):
            self.session = None
            self.board.reset()

    def active(self, token):
        self.prune()
        s = self.session
        if not s or not secrets.compare_digest(s["token"], digest(token)):
            raise HTTPException(401, "SESSION_ENDED")
        return s

    def state(self, token):
        with self.lock:
            s = self.active(token)
            s["last"] = self.clock()
            return dict(
                name=s["name"],
                approved=s["approved"],
                permissions=dict(s["permissions"]),
                expires_in=max(0, int(1800 - (self.clock() - s["created"]))),
            )

    def approve(self, value=None):
        value = value or Approval()
        with self.lock:
            self.prune()
            if not self.session:
                raise HTTPException(409, "NO_PENDING_PHONE")
            self.session["approved"] = value.drawing
            self.session["permissions"] = value.model_dump()
            self.record(
                "Telefonun lövhə icazəsi təsdiqləndi"
                if value.drawing
                else "Yazı icazəsi dayandırıldı"
            )

    def drawing_session(self, token):
        s = self.active(token)
        if not s["approved"] or not s["permissions"]["drawing"]:
            raise HTTPException(403, "DRAWING_NOT_ALLOWED")
        return s

    def draw(self, token, value):
        with self.lock:
            s = self.drawing_session(token)
            fingerprint = digest(value.model_dump_json())
            if value.seq == s["draw_seq"] and fingerprint == s["draw_hash"]:
                return s["draw_result"]
            if value.seq != s["draw_seq"] + 1:
                raise HTTPException(409, "DRAW_SEQUENCE_INVALID")
            if not self.draw_writes.allow("phone"):
                raise HTTPException(429, "TOO_FAST")
            result = self.board.apply(value)
            s.update(
                draw_seq=value.seq,
                draw_hash=fingerprint,
                draw_result=dict(result, seq=value.seq),
                last=self.clock(),
            )
            return s["draw_result"]


def create_control_app(root, hub, admin_key=None, public_origin=None):
    admin = admin_key is not None
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    limiter = RateLimiter(5, 60)
    tokens = {}
    port = 8011 if admin else 8010
    allowed = {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}
    if public_origin and not admin:
        allowed.add(public_origin)

    @app.middleware("http")
    async def boundary(request, call_next):
        origin = request.headers.get("origin")
        host_origin = f"{request.url.scheme}://{request.headers.get('host', '')}"
        proxy_origin = (
            public_origin.replace("https://", "http://", 1) if public_origin and not admin else None
        )
        code = None
        if host_origin not in allowed and host_origin != proxy_origin:
            code = "HOST_DENIED"
        if (
            origin
            and origin not in allowed
            or request.headers.get("sec-fetch-site") == "cross-site"
        ):
            code = "ORIGIN_DENIED"
        if request.method == "POST":
            if request.headers.get("x-secure-control") != "1":
                code = "CONTROL_HEADER_REQUIRED"
            if not request.headers.get("content-type", "").startswith("application/json"):
                code = "JSON_REQUIRED"
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > (4096):
                    code = "BODY_TOO_LARGE"
                    break
            request._body = bytes(body)
        response = (
            JSONResponse({"detail": code}, status_code=403) if code else await call_next(request)
        )
        response.headers.update(
            {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "X-Frame-Options": "DENY",
                "Permissions-Policy": "camera=()" + ", microphone=(), geolocation=()",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; worker-src 'none'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
            }
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation(request, exc):
        return JSONResponse({"detail": "INVALID_REQUEST"}, status_code=422)

    def bearer(request):
        value = request.headers.get("authorization", "")
        if not value.startswith("Bearer ") or len(value) > 200:
            raise HTTPException(401, "AUTH_REQUIRED")
        token = value[7:]
        if admin and tokens.get(digest(token), 0) <= hub.clock():
            raise HTTPException(401, "ADMIN_LOGIN_REQUIRED")
        return token

    @app.get("/")
    def index():
        return FileResponse(
            root / "web" / ("control-admin.html" if admin else "control-phone.html")
        )

    @app.get("/static/{asset:path}")
    def asset(asset: str):
        approved = {"control.css", "control-admin.js" if admin else "control-phone.js"}
        approved |= {"board-core.mjs", "board-ui.js", "shared-board.css"}
        if asset not in approved or not (root / "web" / asset).is_file():
            raise HTTPException(404, "ASSET_NOT_FOUND")
        return FileResponse(root / "web" / asset)

    if admin:

        @app.post("/api/login")
        def login(value: Login):
            if not limiter.allow("admin"):
                raise HTTPException(429, "WAIT_ONE_MINUTE")
            if not secrets.compare_digest(digest(value.key), digest(admin_key)):
                raise HTTPException(401, "LOGIN_FAILED")
            tokens.clear()
            token = secrets.token_urlsafe(32)
            tokens[digest(token)] = hub.clock() + 1800
            return {"token": token}

        @app.get("/api/state")
        def operator_state(request: Request):
            bearer(request)
            with hub.lock:
                hub.prune()
                s = hub.session
                return {
                    "phone": {
                        "name": s["name"],
                        "approved": s["approved"],
                        "permissions": dict(s["permissions"]),
                    }
                    if s
                    else None,
                    "audit": list(hub.audit),
                }

        @app.get("/api/board")
        def operator_board(request: Request, after: int = -1, generation: str = ""):
            bearer(request)
            with hub.lock:
                return hub.board.read(after, generation[:80])

        @app.get("/api/board/local")
        def local_board(request: Request, after: int = -1, generation: str = ""):
            # Authenticated FaceGate backend bridge, never available on the phone listener.
            supplied = request.headers.get("x-facegate-board-key", "")
            if not secrets.compare_digest(digest(supplied), digest(admin_key)):
                raise HTTPException(401, "AUTH_REQUIRED")
            with hub.lock:
                return hub.board.read(after, generation[:80])

        @app.post("/api/invite")
        def invite(request: Request):
            bearer(request)
            return hub.invite()

        @app.post("/api/approve")
        def approve(value: Approval, request: Request):
            bearer(request)
            hub.approve(value)
            return {"approved": True}

        @app.post("/api/revoke")
        def revoke(request: Request):
            bearer(request)
            hub.revoke()
            return {"revoked": True}
    else:

        @app.post("/api/pair")
        def pair(value: Pair):
            if not limiter.allow("pair"):
                raise HTTPException(429, "WAIT_ONE_MINUTE")
            return hub.pair(value)

        @app.get("/api/state")
        def phone_state(request: Request):
            return hub.state(bearer(request))

        @app.get("/api/board")
        def phone_board(request: Request, after: int = -1, generation: str = ""):
            with hub.lock:
                s = hub.drawing_session(bearer(request))
                result = hub.board.read(after, generation[:80])
                return dict(result, seq=s["draw_seq"])

        @app.post("/api/board")
        def draw(value: DrawPatch, request: Request):
            return hub.draw(bearer(request), value)

        @app.post("/api/disconnect")
        def disconnect(request: Request):
            with hub.lock:
                hub.active(bearer(request))
                hub.revoke()
            return {"revoked": True}

    return app
