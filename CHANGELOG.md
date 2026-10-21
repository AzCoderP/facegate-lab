# Changelog

## Unreleased — gesture laboratory

- Speed-adaptive drawing filter, discontinuity protection, quadratic strokes and conservative mathematical line/circle/rotated rectangle fitting.
- Local COCO-SSD object detection in a CPU worker and an explicit non-neural background/silhouette analysis mode. Pen and notebook are not separate pretrained model classes.

- Separate camera hand tracking with locally installed, checksum-pinned MediaPipe assets and a Web Worker; camera-free real-model smoke check.
- Air drawing, eraser, bounded undo, PNG export and mouse/touch fallback.
- Gesture keypad and arithmetic parser without eval; native Canvas perspective cube, sphere and pyramid rotation.
- Camera cleanup on view changes, logout, backgrounding and errors; no hand images/landmarks sent to the backend or persisted.
- Optional local asset installer, setup integration and JavaScript logic tests. Handwriting OCR, equation solving and automatic drawing-to-3D conversion are not included.

## 0.2.0 — 2026-10-21

- Dark blue operator console based on the provided visual reference; functional navigation, search, filters, pagination, JSON export and settings.
- Local admin key login, expiring server sessions, CSRF, origin/peer restrictions, rate limits and protected operational endpoints.
- Encrypted biometric templates bound to IDs, plaintext migration, HMAC fingerprints and pseudonymized administrative audit.
- Distinct enrollment captures with all-pairs consistency checks; malformed/non-finite vectors fail closed.
- Explicit replay responses, bounded inference queue and serialization of permission/verification mutations.
- Cleared stale success on new attempts and failures; finite fetch timeout, memory-only retries, camera-track cleanup.
- Regression tests, formatting/lint checks, separate dependency locks, security policy and GitHub CI/Dependabot definitions.

## 0.1.0

Initial local enrollment, face verification, access policies, event journal and diagnostic exercises.
