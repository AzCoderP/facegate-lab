import json
import math
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from app.security import ConfigurationError, Vault


def utc_now():
    return datetime.now(UTC).isoformat()


class Store:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL,
                    door TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
                    templates TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS events (
                    event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, door TEXT NOT NULL,
                    timestamp TEXT NOT NULL, mode TEXT NOT NULL, decision TEXT NOT NULL,
                    reason TEXT NOT NULL, score REAL, elapsed_ms REAL NOT NULL, fingerprint TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_filter ON events(user_id,decision,timestamp);
                CREATE TABLE IF NOT EXISTS audit (
                    id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, action TEXT NOT NULL, subject TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            encrypted = db.execute(
                "SELECT 1 FROM users WHERE templates LIKE 'enc:v1:%' LIMIT 1"
            ).fetchone()
            self.vault = Vault(path.parent / "vault.key", bool(encrypted))
            legacy = db.execute(
                "SELECT id,templates FROM users WHERE templates NOT LIKE 'enc:v1:%'"
            ).fetchall()
            for row in legacy:
                db.execute(
                    "UPDATE users SET templates=? WHERE id=?",
                    (self.vault.encrypt(json.loads(row["templates"]), row["id"]), row["id"]),
                )
        if legacy:
            with self.connection() as db:
                db.execute("VACUUM")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA secure_delete=ON")
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _audit(self, db, action, subject="admin"):
        db.execute(
            "INSERT INTO audit(timestamp,action,subject) VALUES (?,?,?)",
            (utc_now(), action, self.vault.fingerprint(subject)[:24]),
        )

    def audit(self, action):
        with self.connection() as db:
            self._audit(db, action)

    def audits(self, limit=50):
        with self.connection() as db:
            return [
                dict(row)
                for row in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,))
            ]

    def users(self, limit=100, offset=0, search=""):
        pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        with self.connection() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT id,name,active,door,start_time,end_time,created_at FROM users "
                    "WHERE id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY id LIMIT ? OFFSET ?",
                    (pattern, pattern, limit, offset),
                )
            ]

    def user(self, user_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not row:
                return None
            user = dict(row)
            user["templates"] = self.vault.decrypt(user["templates"], user_id)
            return user

    def add_user(self, user, templates):
        with self.connection() as db:
            db.execute(
                "INSERT INTO users VALUES (?,?,?,?,?,?,?,?)",
                (
                    user.id,
                    user.name,
                    int(user.active),
                    user.door,
                    user.start_time,
                    user.end_time,
                    self.vault.encrypt(templates, user.id),
                    utc_now(),
                ),
            )
            self._audit(db, "USER_ENROLLED", user.id)

    def update_user(self, user_id, active, door, start_time, end_time):
        with self.connection() as db:
            count = db.execute(
                "UPDATE users SET active=?,door=?,start_time=?,end_time=? WHERE id=?",
                (int(active), door, start_time, end_time, user_id),
            ).rowcount
            if count:
                self._audit(db, "PERMISSIONS_UPDATED", user_id)
            return count

    def delete_user(self, user_id):
        with self.connection() as db:
            db.execute("DELETE FROM events WHERE user_id=?", (user_id,))
            count = db.execute("DELETE FROM users WHERE id=?", (user_id,)).rowcount
            if count:
                self._audit(db, "USER_DELETED", user_id)
            return count

    def event(self, event_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM events WHERE event_id=?", (event_id,)).fetchone()
            return dict(row) if row else None

    def add_event(self, event):
        with self.connection() as db:
            db.execute(
                "INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)",
                tuple(
                    event[k]
                    for k in (
                        "event_id",
                        "user_id",
                        "door",
                        "timestamp",
                        "mode",
                        "decision",
                        "reason",
                        "score",
                        "elapsed_ms",
                        "fingerprint",
                    )
                ),
            )

    def events(self, limit=50, offset=0, user_id=None, decision=None):
        filters, values = [], []
        for key, value in (("user_id", user_id), ("decision", decision)):
            if value:
                filters.append(f"{key}=?")
                values.append(value)
        where = " WHERE " + " AND ".join(filters) if filters else ""
        with self.connection() as db:
            return [
                dict(row)
                for row in db.execute(
                    "SELECT event_id,user_id,door,timestamp,mode,decision,reason,score,elapsed_ms FROM events"
                    + where
                    + " ORDER BY rowid DESC LIMIT ? OFFSET ?",
                    (*values, limit, offset),
                )
            ]

    def stats(self):
        with self.connection() as db:
            users = db.execute("SELECT count(*),coalesce(sum(active),0) FROM users").fetchone()
            events = db.execute(
                "SELECT count(*),coalesce(sum(decision='GRANTED'),0) FROM events"
            ).fetchone()
            last = db.execute("SELECT timestamp FROM events ORDER BY rowid DESC LIMIT 1").fetchone()
            return {
                "users": users[0],
                "active_users": users[1],
                "events": events[0],
                "granted": events[1],
                "denied": events[0] - events[1],
                "last_event": last[0] if last else None,
            }

    def threshold(self, default):
        with self.connection() as db:
            row = db.execute("SELECT value FROM settings WHERE key='threshold'").fetchone()
            try:
                value = float(row[0]) if row else default
                if not math.isfinite(value) or not 0 < value <= 1:
                    raise ValueError("Invalid threshold")
                return value
            except (TypeError, ValueError) as exc:
                raise ConfigurationError("Invalid stored threshold") from exc

    def set_threshold(self, value):
        with self.connection() as db:
            db.execute(
                "INSERT INTO settings VALUES ('threshold',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(value),),
            )
            self._audit(db, "THRESHOLD_UPDATED")
