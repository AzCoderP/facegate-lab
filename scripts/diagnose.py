"""Read-only loopback diagnostics; optional authenticated model/DB probe."""

import argparse
import http.cookiejar
import json
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def diagnose(admin=False):
    print("FaceGate Lab / localhost:8000")
    try:
        with socket.create_connection(("127.0.0.1", 8000), timeout=3):
            print("[OK] TCP port 8000 accepts connections.")
    except OSError as exc:
        print(f"[FAIL] TCP connection: {type(exc).__name__}")
        print(
            "Check process, listening port and local firewall. One failed probe does not prove the root cause."
        )
        return 1
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )

    def request(path, payload=None, csrf=None):
        headers = {"Content-Type": "application/json", "X-FaceGate-Lab": "local"}
        if csrf:
            headers["X-CSRF-Token"] = csrf
        body = None if payload is None else json.dumps(payload).encode()
        with opener.open(
            urllib.request.Request("http://127.0.0.1:8000/api" + path, data=body, headers=headers),
            timeout=8,
        ) as response:
            return json.load(response)

    csrf = None
    try:
        live = request("/live")
        print(f"[OK] HTTP application: {live['version']}")
        if not admin:
            print("[NEXT] Add --admin to check DB/model state with the local admin key.")
            return 0
        data_dir = Path(os.environ.get("FACEGATE_DB", ROOT / "data" / "facegate.db")).parent
        key = (data_dir / "admin.key").read_text().strip()
        csrf = request("/auth/login", {"key": key})["csrf"]
        health = request("/health")
        print(
            f"[OK] Database: {health['database']}; encrypted templates: {health['encrypted_templates']}"
        )
        print(f"[INFO] Model files: {health['models']} (not an accuracy check)")
        print(f"[INFO] Threshold: {health['threshold']}; server clock: {health['server_time']}")
        print(
            "[NEXT] Run scripts/model_smoke.py and a real-camera enrollment/verification session."
        )
        return 0 if health["models"] == "available" else 2
    except (urllib.error.URLError, KeyError, ValueError, OSError) as exc:
        print(
            f"[FAIL] HTTP/admin probe: {type(exc).__name__}. Inspect the server terminal and local key file."
        )
        return 1
    finally:
        if csrf:
            try:
                request("/auth/logout", {}, csrf)
            except (urllib.error.URLError, ValueError):
                pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--admin", action="store_true", help="Use local admin.key for a protected health probe"
    )
    sys.exit(diagnose(parser.parse_args().admin))
