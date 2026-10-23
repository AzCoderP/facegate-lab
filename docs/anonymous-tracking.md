# FaceGate Lab: real-time anonymous tracking

Implemented in the existing project at:
`C:\Users\cavid\Documents\Codex\2026-10-19\az-rbaycan-texniki-universitetind-aztu-yeni\outputs\facegate-lab`

## Run

The updated preview runs at http://127.0.0.1:8001/ during this session.
For a later restart, open CMD and run:

```cmd
cd /d "C:\Users\cavid\Documents\Codex\2026-10-19\az-rbaycan-texniki-universitetind-aztu-yeni\outputs\facegate-lab"
start.cmd
```

This uses port 8000. Stop the old FaceGate instance with Ctrl+C in its terminal before restarting it, then reload the browser. To use 8001 explicitly instead:

```cmd
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --no-proxy-headers
```

Open the matching localhost URL. Sign in with the local admin key and choose **Canlı müşahidə → Kameranı başlat**. Allow camera access. Analysis starts automatically; there is no verification or per-face action. Export CSV before starting a fresh camera session because restarting clears the prior session's browser history.

## Implementation

- OpenCV YuNet detects multiple faces, using the existing independently cached anonymous detector. The anonymous path never invokes the SFace recognizer, enrollment, templates, or identity comparison.
- `app/tracking.py` adds an OpenCV 8-state Kalman filter for box position, size and velocity, plus globally ranked spatial matching using predicted overlap and size-relative distance. Each detection can match only one track.
- A 1.5-second absence tolerance prevents repeated arrivals from brief detector dropouts. Only currently detected faces count as visible; absent tracks do not extend last-seen timestamps. After expiration, a returning face receives a new ID. Crossing, overlap, severe blur and occlusion can still swap or split spatial IDs; these are not identity claims.
- A newly created track emits one arrival event. Browser notification watermarks prevent duplicate notifications on repeated responses. Tracker epochs handle server restarts or expiration without mixing IDs.
- Capture is capped at 640 × 480 with JPEG quality 0.7. Analysis targets about 6 updates/second and slows automatically when inference takes longer. Exactly one frame request is in flight; no frame queue builds up. Video requests a 30 fps preview, with requestAnimationFrame box interpolation. Actual camera and inference speeds depend on the device.
- Camera-frame requests have a separate authenticated 600/minute budget; normal mutations keep the original 40/minute allowance. Host/origin, admin session, CSRF, image-size limits and bounded inference slots remain in effect. Rate limiting pauses and retries rather than flooding the server.
- Tracker state is RAM-only: up to 32 camera sessions and 256 active/recent tracks per session. Idle sessions expire after 30 seconds and are pruned on the next tracker request; stop clears the session immediately when the request succeeds. Camera IDs are scoped to the signed-in administrator and random camera session. Only geometry, timestamps and counters are retained, never images, crops or embeddings.
- The browser keeps the last 500 metadata rows for the current camera session. Stop preserves them for CSV export; restart and logout clear them. Changing sections, hiding the tab, logout, disconnect or navigation stop camera capture.

## Changed and added files

- `app/main.py`: tracked-frame/stop API, request schema, separate frame rate budget.
- `app/tracking.py`: new OpenCV Kalman tracker and bounded temporary sessions.
- `app/vision.py`: existing anonymous YuNet detection implementation included in this update bundle.
- `web/presence.js`: automatic camera loop, green overlays, count, one-time arrivals, timestamps, CSV and lifecycle cleanup.
- `web/presence-core.mjs`: bounded metadata history and duplicate-notification prevention.
- `web/presence.css`: existing page styling plus count and arrival notification.
- `web/index.html`: existing navigation and live observation section with count, notification and timestamp table.
- `web/app.js`: camera ownership and control integration with the existing dashboard.
- `package.json`: adds presence JavaScript syntax checking to the existing checks.
- `tests/test_presence.py`: API authentication/CSRF, frame budget, no access-event writes, invalid images and real-model blank-frame smoke test.
- `tests/test_tracking.py`: multi-face continuity, motion/reordered detections, dropouts, timeout, one-to-one matching and bounded/isolated sessions.
- `tests/presence-core.test.mjs`: notification deduplication, epoch reset and bounded history.
- `README.md` and `docs/anonymous-tracking.md`: usage, implementation and tests.

Some included files were already modified when this request began. The bundle contains their final integrated contents, preserving those earlier changes. Extract into the existing project root to apply; it is an update bundle, not a standalone application. No data directory, credentials, models, images, virtual environment or dependency tree is included. No new dependency is required.

## Automated tests

From the project directory:

```cmd
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check app tests
.venv\Scripts\python.exe -m ruff format --check app tests
npm.cmd run check
```

Verification: 58 Python tests and 13 JavaScript tests passed. The real YuNet model passed a blank-frame smoke test. A live webcam smoke test also displayed arrival notifications and advancing timestamps at a reported 6 analyses/second (one observed inference: 50.9 ms). The camera was stopped after verification. Crowded multi-person camera accuracy and sustained device FPS still require the manual checks below. The test environment needs loopback networking for FastAPI TestClient. An existing dependency deprecation warning does not fail the tests.

## Manual acceptance checks

1. Start the server, sign in, open Canlı müşahidə and allow the camera. With an empty view, count should be 0.
2. Enter the view: a green box, Person #1, first/last-seen timestamps and one new-face notification should appear automatically.
3. Move slowly for 10 seconds: the ID and first-seen time should remain stable, last-seen should advance, and no repeated arrival should occur.
4. Add a second person: two boxes, two distinct IDs, count 2, and only the new arrival should notify. Move apart and vary detection order.
5. Briefly cover a face for less than 1.5 seconds: count reflects current detections; reappearance near its predicted position should retain the ID without a new arrival.
6. Leave for more than 1.5 seconds and return: a new ID and arrival are expected. This system does not recognize a returning person.
7. Stop: camera light should turn off, count becomes 0, last-seen stops changing. CSV should contain one row per recorded track and Bakı timestamps.
8. Restart: IDs and history reset. Export first if you want to preserve prior rows. Changing page, hiding the tab and logout should stop the camera.
9. Deny camera permission, disconnect the camera, or stop the server: a useful error should appear and the controls should allow restart.
10. Check existing dashboard, users, verification, event history and gesture lab still work. Anonymous observations must not appear in the access-control event database.

These are face visibility timestamps, not confirmed physical entrance/exit times. The count is detected faces, not a guarantee that every person is visible to the model.
