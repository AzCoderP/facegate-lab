"""Start isolated SecureControl listeners. Never exposes the FaceGate database service."""

import argparse
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import uvicorn

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.control import ControlHub, create_control_app  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    origin_file = ROOT / "data" / "control-origin.txt"
    parser.add_argument(
        "--public-origin",
        help="Exact private HTTPS URL printed by Tailscale Serve",
        default=origin_file.read_text(encoding="utf-8").strip() if origin_file.exists() else None,
    )
    args = parser.parse_args()
    if args.public_origin:
        parts = urlsplit(args.public_origin)
        if (
            parts.scheme != "https"
            or not parts.hostname
            or parts.username
            or parts.password
            or parts.path not in ("", "/")
            or parts.query
            or parts.fragment
        ):
            parser.error("--public-origin must be a plain HTTPS origin")
        args.public_origin = args.public_origin.rstrip("/")
    keyfile = ROOT / "data" / "admin.key"
    if not keyfile.exists():
        parser.error("Start FaceGate first to create data/admin.key")
    hub = ControlHub()
    operator = create_control_app(ROOT, hub, admin_key=keyfile.read_text().strip())
    phone = create_control_app(ROOT, hub, public_origin=args.public_origin)
    servers = [
        uvicorn.Server(uvicorn.Config(operator, host="127.0.0.1", port=8011, proxy_headers=False)),
        uvicorn.Server(uvicorn.Config(phone, host="127.0.0.1", port=8010, proxy_headers=False)),
    ]
    threads = [threading.Thread(target=s.run, daemon=True) for s in servers]
    for thread in threads:
        thread.start()
    print("SecureControl operator: http://127.0.0.1:8011")
    print("Phone development preview: http://127.0.0.1:8010")
    print("Phone drawing board only. Remote camera streaming is removed.")
    try:
        while all(t.is_alive() for t in threads):
            with hub.lock:
                hub.prune()
            time.sleep(0.1)
    except KeyboardInterrupt:
        pass
    finally:
        hub.revoke()
        for server in servers:
            server.should_exit = True
        for thread in threads:
            thread.join(timeout=3)


if __name__ == "__main__":
    main()
