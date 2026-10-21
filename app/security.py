"""Local admin sessions, bounded rate limiting and encrypted template storage."""

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class VaultError(Exception):
    pass


class ConfigurationError(Exception):
    pass


def private_file(path: Path, value: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return path.read_bytes()
    with os.fdopen(fd, "wb") as output:
        output.write(value)
    return value


class Vault:
    def __init__(self, path: Path, encrypted_data_exists=False):
        if encrypted_data_exists and not path.exists():
            raise VaultError(
                "Encryption key missing. Restore the original vault.key; do not replace it."
            )
        try:
            key = private_file(path, Fernet.generate_key())
            self.cipher = Fernet(key)
            self.hmac_key = hashlib.sha256(key + b"facegate-audit-v1").digest()
        except (ValueError, OSError) as exc:
            raise VaultError("Cannot open encryption key") from exc

    def encrypt(self, templates, subject):
        return (
            "enc:v1:"
            + self.cipher.encrypt(
                json.dumps({"subject": subject, "templates": templates}, allow_nan=False).encode()
            ).decode()
        )

    def decrypt(self, token, subject):
        try:
            if not token.startswith("enc:v1:"):
                raise VaultError("Unencrypted template")
            payload = json.loads(self.cipher.decrypt(token[7:].encode()))
            if not isinstance(payload, dict) or payload.get("subject") != subject:
                raise VaultError("Template subject mismatch")
            return payload["templates"]
        except (InvalidToken, ValueError, TypeError, AttributeError, KeyError) as exc:
            raise VaultError("Template cannot be decrypted") from exc

    def fingerprint(self, value: str):
        return hmac.new(self.hmac_key, value.encode(), hashlib.sha256).hexdigest()


class RateLimiter:
    def __init__(self, maximum=30, window=60):
        self.maximum, self.window = maximum, window
        self.buckets = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self.lock:
            for item in list(self.buckets):
                while self.buckets[item] and self.buckets[item][0] <= now - self.window:
                    self.buckets[item].popleft()
                if not self.buckets[item]:
                    del self.buckets[item]
            queue = self.buckets[key]
            if len(queue) >= self.maximum:
                return False
            queue.append(now)
            return True


class AdminAuth:
    COOKIE = "facegate_session"
    IDLE_SECONDS = 1800
    ABSOLUTE_SECONDS = 8 * 3600

    def __init__(self, data_dir: Path, key=None):
        self.key = (
            key
            or private_file(data_dir / "admin.key", secrets.token_urlsafe(32).encode())
            .decode()
            .strip()
        )
        if len(self.key) < 24:
            raise ValueError("Administrator key must contain at least 24 characters")
        self.sessions = {}
        self.lock = threading.Lock()

    def login(self, supplied):
        if not secrets.compare_digest(
            hashlib.sha256(supplied.encode()).digest(), hashlib.sha256(self.key.encode()).digest()
        ):
            return None
        now = time.monotonic()
        with self.lock:
            self._prune(now)
            if len(self.sessions) >= 8:
                oldest = min(self.sessions, key=lambda item: self.sessions[item]["created"])
                del self.sessions[oldest]
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            self.sessions[self._digest(token)] = {"csrf": csrf, "created": now, "last": now}
            return token, csrf

    @staticmethod
    def _digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def _prune(self, now):
        for key, session in list(self.sessions.items()):
            if (
                now - session["last"] >= self.IDLE_SECONDS
                or now - session["created"] >= self.ABSOLUTE_SECONDS
            ):
                del self.sessions[key]

    def session(self, token, touch=True):
        if not token:
            return None
        now = time.monotonic()
        with self.lock:
            self._prune(now)
            session = self.sessions.get(self._digest(token))
            if session and touch:
                session["last"] = now
            return dict(session) if session else None

    def logout(self, token):
        if token:
            with self.lock:
                self.sessions.pop(self._digest(token), None)
