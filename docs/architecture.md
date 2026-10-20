# Architecture and API — v0.2

Single-process localhost application. Browser camera, FastAPI API, OpenCV inference and SQLite. The host OS account is trusted. Launchers bind 127.0.0.1, disable proxy headers, and middleware rejects non-loopback peers and untrusted Host/origin values.

## Authentication

`GET /api/live` is a minimal unauthenticated liveness probe. `POST /api/auth/login` accepts a random local `key` (from data/admin.key), returns a CSRF token and sets an HttpOnly, SameSite=Strict cookie. Login is limited to 5/minute. `GET /api/auth/status` returns authenticated status and, only with a valid cookie, its CSRF token. `POST /api/auth/logout` revokes the session and deletes the cookie.

All other API paths require the session. Mutations additionally require `X-FaceGate-Lab: local` and `X-CSRF-Token`. JSON body endpoints require application/json. Max 40 mutations/minute/session. Idle timeout is 30 minutes since last authenticated mutation; absolute expiry 8 hours. Sessions are memory-only and capped at 8. GET polling does not extend idle expiry.

Cookies are not marked Secure on HTTP loopback; this is not a deployable LAN authentication design. No roles or MFA are provided.

## API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/health` | DB probe, model file presence, threshold, UTC time, version |
| GET | `/api/stats` | Total users, active users, event/decision counts |
| GET | `/api/audit` | Latest 50 pseudonymized admin operations |
| GET | `/api/users?limit=50&offset=0&q=` | Search and paginate public fields, never templates |
| POST | `/api/users` | Three distinct JPEG samples + consent, all-pairs consistency |
| PATCH | `/api/users/{id}` | Replace active, door and schedule |
| DELETE | `/api/users/{id}` | Remove user, templates and related access events |
| POST | `/api/verify` | Face verification, policy evaluation and committed event |
| POST | `/api/policy-preview` | Simulation only; no face/event/door action |
| GET | `/api/events` | Pagination, optional exact user_id and GRANTED/DENIED filter |
| PUT | `/api/settings` | Persist validated threshold and audit the operation |

Enrollment: `id`, `name`, `images` (exactly 3 JPEG base64 data URLs), `consent: true`, optional `active`, `door`, `start_time`, `end_time`. Duplicate encoded content is detected after base64 decoding. Different frames are not proof of liveness. IDs/doors: 1–40 ASCII letters/digits/underscore/hyphen. Time: HH:MM; equal endpoints mean all day; overnight schedules supported.

Verify: `event_id` (new UUID), `user_id`, `door`, `image`. Retry must reuse the exact payload. Existing identical events return `replayed: true`; this is a historical response, not a new access action. Changed payload with reused ID returns 409. Request fingerprints use HMAC. Pre-v0.2 event fingerprints cannot be replayed under the new HMAC scheme.

Policy preview: `user_id`, `door`, `at` (timezone-aware ISO timestamp). UI input is Baku wall time (UTC+04:00). Live verification uses the server's current clock.

## Inference and transactions

Bounded request bodies: enrollment 6.1MB, verification 2.1MB, other paths 4KB. JPEG dimensions checked before decoding; maximum 1920×1080. One face, minimum face dimension 90px, aligned-crop Laplacian variance at least 25. These are heuristic quality checks, not PAD.

YuNet → alignment → SFace → normalized feature. Cosine comparison validates dimensions, finite values and nonzero norms. Score is not an identity probability. Maximum over three templates is compared with the stored threshold; policy evaluation follows successful face matching.

Three pending inference operations maximum; excess returns 503. An operation lock serializes verification, enrollment, permission and threshold mutations to avoid in-process races. OpenCV objects have their own lock. SQLite primary keys protect event uniqueness. Run one worker; no distributed guarantees.

`GRANTED` is returned only after event commit. It never means a physical door opened. DB write failure returns 503 and the client displays NOT_CONFIRMED. New attempts, camera stop and errors clear old success state; timed-out verification may be retried with its original in-memory payload for at most two minutes. Invalid inputs rejected before the pipeline do not become access events.

## Data

Fernet encrypts each template payload including its user ID; ciphertext swapping between users fails. data/vault.key is required to decrypt and is excluded from Git. Missing key with encrypted rows refuses startup. Legacy plaintext templates are migrated transactionally and the DB vacuumed. Names, IDs and event metadata remain unencrypted.

Admin operations are recorded transactionally with pseudonymized HMAC subjects. Audit is not tamper-proof. User deletion leaves that pseudonymized audit while deleting templates and related access events. secure_delete is enabled; backups/forensic erasure are not guaranteed.

Face samples exist only in browser memory until submission/reset. Identity changes, successful enrollment, camera stop and page exit clear samples. No automatic camera start, no background frame uploads. Preview is mirrored, captured pixels are not. No localStorage for credentials or biometrics.
