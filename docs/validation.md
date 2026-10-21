# Validation record

Date: 2026-10-21, Asia/Baku.

## Verified

- Python 3.12.14, Windows x64; installed versions captured in `requirements.lock.txt`.
- `python -m pytest -q`: **48 passed**. Includes authorization and Baku time boundaries, duplicate-event replay/conflict, enrollment consent/distinctness, malformed images, authentication/CSRF/expiry/rate limits, encryption/migration/lost-key/tampering/ciphertext swapping, non-finite scores/config, request queue saturation, filters/stats/settings and DB write failure.
- Tests use a deterministic fake face engine for rule/API isolation. They do not establish real biometric accuracy.
- Real model smoke: YuNet rejects a blank JPEG; SFace produces finite features from a synthetic crop. Both downloaded model hashes verified against pinned OpenCV Zoo LFS pointers.
- Browser: dark console and admin login rendered; API/database/model-file state displayed. No-camera verification showed NOT_CONFIRMED. User search showed the correct empty state. Changing threshold to 0.400 persisted and created an audit entry; 0.363 was restored afterward.
- Ruff lint/format, Prettier HTML/CSS/JS format and Node syntax checks passed.
- OSV-backed pip-audit: 19 pinned runtime distributions, no known vulnerabilities reported. npm lock audit: no known vulnerabilities reported. These are advisory checks, not proof of complete security.
- Read-only diagnostic CLI: localhost TCP, HTTP API and DB probes passed.
- Final running-server check: unknown ID denied and event successfully persisted. Only the self-check event was removed afterward.
- User reported that the v0.1 live camera test works; v0.2 retains browser capture and needs its own real-face end-to-end test.

## Still requires a real-camera session

- Three-sample enrollment and matching on the user's actual face.
- Wrong-person comparison with a consenting second participant.
- Threshold calibration on separate enrollment/test samples.
- Behavior across lighting, glasses, distance and camera quality.

No physical controller, turnstile, PAD, roles/MFA or LAN deployment has been tested. Responsive CSS is included; the v0.2 visual browser check was at desktop size. GitHub Actions definitions are included but remote CI has not run until repository publication. The app is a localhost educational prototype. One deprecation warning is emitted by Starlette's httpx test adapter; tests pass. Production camera functionality uses the browser, not that test adapter.
