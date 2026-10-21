# Contributing

Use Python 3.12 or 3.13. Set up a virtual environment and install:

```powershell
python -m pip install -r requirements-dev.lock.txt
python -m ruff check app scripts tests
python -m ruff format --check app scripts tests
python -m pytest -q
```

Optional frontend formatting tools (Node.js): `npm ci --ignore-scripts`, then `npm run check` or `npm run format`. Node is not needed to run the application itself.

Tests use synthetic vectors and temporary databases; no webcam, real face data or model download is required. Run `scripts/model_smoke.py` separately after downloading the real models.

For changes to authorization, encryption, enrollment or API behavior, add a regression test demonstrating the failure before the fix. Keep authentication and the local-only boundary enabled. Use textContent for untrusted text in the UI. Never add real biometric fixtures, keys or private logs to commits.

Browser checks: login/logout, no-camera error, enrollment, verification, search, event filters, settings, keyboard navigation and a narrow viewport. Record what was tested and distinguish real model tests from fake-engine tests.

CI definitions are included. Their remote execution is only confirmed after a GitHub Actions run succeeds.
