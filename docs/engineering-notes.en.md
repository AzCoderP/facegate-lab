# Engineering notes: FaceGate Lab

## What I built

I extended an existing FastAPI/OpenCV application rather than rebuilding its dashboard. I separated local access-verification experiments, anonymous observation, gesture interaction and event notifications into modules with explicit session and data boundaries.

For live observation, I used temporary geometry/motion tracks to maintain IDs across frames and record first/last-seen times. For object events, I integrated an optional YOLO detector and finite line-crossing rules. Telegram notifications run through a bounded asynchronous queue so external delivery does not block inference. Repeat person photos are limited to one per minute within a continuous track; departure messages contain text only. Bot configuration is encrypted with the existing local vault.

For gesture interaction, I worked with MediaPipe hand landmarks, gesture stabilization, drawing and AR overlays. The phone drawing extension sends normalized stroke coordinates to a bounded, session-local canvas. Pairing, desktop approval, sequence checks and generation IDs limit unauthorized writes, repeated batches and stale updates. The phone does not receive OS input control.

## Remote camera experiment and decision

I prototyped private phone camera viewing using Tailscale HTTPS, separate phone/operator listeners, one-time pairing and explicit desktop approval. An initial JPEG polling approach exposed latency during use. I then implemented continuous multipart JPEG delivery, latest-frame-only buffering, bounded parsing, reconnection and stale-frame suppression. Local synthetic transport tests verified incremental frame delivery and stream closure after revocation; they were not a mobile-network performance benchmark.

I subsequently removed phone-based live camera viewing from the current scope. The experiment remains documented as engineering history, not advertised as an active feature. Local vision analysis, Telegram event notifications and the separately authorized drawing board remain distinct modules.

## What still needs evaluation

- Detection precision/recall on a labeled, representative test set.
- Track fragmentation and duplicate-event rates under occlusion and crossing trajectories.
- End-to-end event latency, including uncertain external-delivery outcomes.
- Sustained CPU/memory use and low-end-device behavior.
- Real phone drawing sessions across different networks and browsers.
- Independent review of authentication, recovery and deployment configuration.

The project demonstrates integration and iteration. It does not claim a new recognition algorithm, universal novelty, guaranteed security or production certification.
