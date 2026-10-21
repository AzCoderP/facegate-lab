# Security policy

FaceGate Lab v0.2 is a single-user localhost teaching application. It is **not certified access-control software** and is not suitable for physical entry decisions.

## Report a vulnerability

Use GitHub's private vulnerability reporting if enabled for the repository. Otherwise ask the repository owner for a private channel without publishing exploit details or personal data. Never attach face samples, database files, access keys or encryption keys to an issue.

## Controls implemented

- Loopback peer and Host restrictions; same-origin and Fetch Metadata checks.
- Random local administrator key; HttpOnly SameSite=Strict expiring cookie sessions.
- Per-session CSRF tokens, bounded session count, login/write rate limits.
- JPEG request/decode limits; validation errors do not echo image/key payloads.
- Authenticated encryption of biometric templates bound to user ID (Fernet).
- HMAC request fingerprints and audit subject pseudonyms.
- Serialized mutations, unique event IDs, explicit replay responses, no success on DB write failure.
- Strict CSP, framing restrictions, safe DOM text rendering, microphone/geolocation disabled.
- Optional gesture lab uses same-origin MediaPipe assets in a worker; CSP permits WASM compilation (`wasm-unsafe-eval`), without JavaScript `unsafe-eval` or external runtime script origins. Hand frames/landmarks remain in browser memory. Gesture rules never authorize entry. See `docs/gesture-lab.az.md`.

## Trust boundary and residual risk

The OS user is trusted. Admin/vault keys are stored in the local data directory; protect that account and its filesystem permissions. Encryption helps when a database is copied without its key. It does not protect against an attacker who can read both the database and key or run code as the same OS user. Names, IDs and event metadata remain plaintext. Audit entries are not tamper-proof.

The session cookie is not Secure because the app uses HTTP over loopback. Do not reverse-proxy, expose on a LAN or publish the running server. Launchers disable forwarded-header trust. There is no PAD/liveness, identity proofing, MFA, hardware controller or guarantee of biometric accuracy. A photographed face may pass.

The idle timeout is 30 minutes after the last authenticated mutation, with an 8-hour absolute maximum. Background GET polling does not extend the idle timeout. Sessions are memory-only and expire on server restart. Limits are process-local; run one worker. Login is limited to 5 attempts/minute and authenticated mutations to 40/minute/session.

Deleting a user removes templates and associated access events; a pseudonymized administrative audit remains. SQLite secure_delete is enabled; this is not a guarantee of forensic erasure, SSD cleanup or backup deletion. Existing v0.1 plaintext templates are encrypted on first startup and the DB is vacuumed; pre-existing backups remain the owner's responsibility.

## Dependency checks

Runtime and development versions are recorded in separate lock files. GitHub Actions references are commit-pinned. The audit job checks known advisories via OSV. No advisory result establishes complete application security. Model downloads verify SHA-256 against official OpenCV Zoo Git LFS pointers at a pinned commit.
