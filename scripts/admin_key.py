"""Display the local administrator key only in the user's terminal."""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.security import AdminAuth

if __name__ == "__main__":
    data_dir = Path(os.environ.get("FACEGATE_DB", ROOT / "data" / "facegate.db")).parent
    auth = AdminAuth(data_dir)
    print("FaceGate Lab - local administrator key (keep private):")
    print(auth.key)
    print("Enter this key at http://127.0.0.1:8000 . Never upload data/ to GitHub.")
