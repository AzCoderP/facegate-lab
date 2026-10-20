"""Download OpenCV Zoo models from an immutable commit; verify LFS SHA-256."""

import hashlib
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMIT = "48b10fa505aeb51fbd127fc60a5c660040e823b7"
FILES = {
    "yunet.onnx": "models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "sface.onnx": "models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}


def download():
    target = ROOT / "models"
    target.mkdir(exist_ok=True)
    for name, source in FILES.items():
        pointer_url = f"https://raw.githubusercontent.com/opencv/opencv_zoo/{COMMIT}/{source}"
        with urllib.request.urlopen(pointer_url, timeout=30) as response:
            pointer = response.read(4096).decode("ascii")
        match = re.search(r"oid sha256:([a-f0-9]{64})", pointer)
        if not match:
            raise RuntimeError(f"Missing SHA-256 pointer: {name}")
        expected = match.group(1)
        destination = target / name
        if (
            destination.exists()
            and hashlib.sha256(destination.read_bytes()).hexdigest() == expected
        ):
            print(f"Verified: {name}")
            continue
        url = f"https://media.githubusercontent.com/media/opencv/opencv_zoo/{COMMIT}/{source}"
        temporary = target / f"{name}.part"
        print(f"Downloading {name} from OpenCV Zoo...")
        try:
            digest = hashlib.sha256()
            with (
                urllib.request.urlopen(url, timeout=60) as response,
                temporary.open("wb") as output,
            ):
                while block := response.read(1024 * 1024):
                    output.write(block)
                    digest.update(block)
            if digest.hexdigest() != expected:
                raise RuntimeError(f"Checksum mismatch: {name}")
            temporary.replace(destination)
            print(f"Verified SHA-256: {name}")
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    download()
