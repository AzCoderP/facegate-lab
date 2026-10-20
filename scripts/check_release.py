"""Check the exact Git index for local secrets/runtime files before publishing."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check():
    command = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=False)
    if command.returncode:
        print("No Git index. Initialize and stage reviewed source files first.")
        return 1
    paths = [Path(name.decode("utf-8")) for name in command.stdout.split(b"\0") if name]
    secrets = []
    for name in ("admin.key", "vault.key"):
        path = ROOT / "data" / name
        if path.exists():
            secrets.append(path.read_bytes().strip())
    failures = []
    for path in paths:
        if (
            any(
                part in {"data", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache"}
                for part in path.parts
            )
            or path.suffix in {".key", ".db", ".sqlite", ".onnx", ".pyc"}
            or path.name == ".env"
        ):
            failures.append(str(path))
            continue
        # Inspect staged contents, not potentially different working-tree contents.
        staged = subprocess.run(
            ["git", "show", ":" + path.as_posix()], cwd=ROOT, capture_output=True, check=True
        ).stdout
        if any(secret and secret in staged for secret in secrets):
            failures.append(str(path))
    if failures:
        print("STOP: private/runtime contents detected in: " + ", ".join(failures))
        return 1
    print(
        f"PASS: {len(paths)} tracked source files; no prohibited runtime paths or current local keys in staged content."
    )
    print("This is a narrow release check, not a universal secret detector.")
    return 0


if __name__ == "__main__":
    sys.exit(check())
