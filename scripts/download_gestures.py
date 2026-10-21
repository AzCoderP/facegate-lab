"""Install pinned local MediaPipe assets; no CDN requests at application runtime."""

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def download(manifest_name="gesture-assets.json", directory="gesture-assets"):
    manifest = json.loads((ROOT / "scripts" / manifest_name).read_text())
    target = ROOT / "web" / directory
    for item in manifest["files"]:
        destination = target / item["name"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        if (
            destination.exists()
            and hashlib.sha256(destination.read_bytes()).hexdigest() == item["sha256"]
        ):
            print(f"Verified: {item['name']}")
            continue
        temporary = destination.with_suffix(destination.suffix + ".part")
        try:
            digest = hashlib.sha256()
            total = 0
            with (
                urllib.request.urlopen(item["url"], timeout=60) as response,
                temporary.open("wb") as output,
            ):
                while block := response.read(1024 * 1024):
                    total += len(block)
                    if total > 40_000_000:
                        raise RuntimeError("Asset size limit exceeded")
                    digest.update(block)
                    output.write(block)
            if digest.hexdigest() != item["sha256"]:
                raise RuntimeError(f"Checksum mismatch: {item['name']}")
            temporary.replace(destination)
            print(f"Installed: {item['name']}")
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    download()
