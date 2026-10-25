# FaceGate Lab

A local computer-vision laboratory combining access-verification experiments, anonymous tracking, gesture interaction, and event notifications.

[Azərbaycan dilində](README.md)

## Implemented modules

- **Local access-verification experiments:** FastAPI operator console, explicit administrator sessions, selected-profile 1:1 verification, and encrypted local templates. This is not a certified physical access-control product.
- **Anonymous observation:** OpenCV face detection, temporary motion-based tracking IDs, visible counts, and first/last observation times. This mode does not identify people by name.
- **Object and person events:** optional YOLO model, finite line crossings, person appearance/disappearance events, and bounded session metadata.
- **Telegram notifications:** encrypted local bot configuration, asynchronous text/photo delivery, timestamps, visible person counts, and a 60-second repeat-photo interval per continuous person track. Departure notifications are text-only.
- **Gesture Lab:** dual-hand tracking, gesture stabilization, drawing, finger-count lettering, hand/wall AR effects, and experimental Three.js/cannon-es telekinesis.
- **Shared drawing board:** an authorized phone can draw on a dedicated canvas mirrored in FaceGate. Pairing and desktop approval are required; no computer input control is provided.

## Remote camera prototype — removed

Phone-based live camera viewing was prototyped over private Tailscale HTTPS with one-time pairing codes and desktop approval. The implementation explored continuous multipart JPEG transport, latest-frame-only buffering, reconnection, and stale-frame suppression after freezes were observed during use.

**Remote phone camera viewing is removed from the current version.** Local webcam analysis and optional Telegram event photos remain separate features. The drawing-board service exposes neither a camera stream nor desktop, mouse, keyboard, shell, or file-transfer controls.

## Run locally

```powershell
.\setup.ps1
.\start.cmd
```

The normal launcher uses `http://127.0.0.1:8000`. Existing development sessions may use port 8003 instead. Follow [the Azerbaijani setup guide](README.md) for administrator key and model setup. Bot tokens, databases, private keys, model weights and local configuration are excluded from source control.

Optional shared drawing board:

```powershell
.\start-control.cmd
```

Open the local operator page at `http://127.0.0.1:8011`. The phone listener uses loopback port 8010; remote phone access requires a separately configured private HTTPS connection. See [board setup](docs/secure-control.az.md).

## Verification and limitations

```powershell
python -m pytest -q
npm run check
```

Automated tests exercise authorization, session expiration, event deduplication, drawing synchronization and application boundaries. Tests with mocked transports do not establish real-world detection accuracy or prove external delivery.

This is an educational/research prototype. Occlusion and tracking loss can create new IDs; these are not unique-person counts or proof of physical entry/exit. Camera-derived detections are observations, not conclusions about intent. No independently measured accuracy, penetration-test certification or production-readiness guarantee is claimed. Third-party libraries and models retain their own licenses; the repository license covers original project code.

[Engineering notes](docs/engineering-notes.en.md) · [Security policy](SECURITY.md)
