"""Ephemeral spatial tracking. No images, descriptors, or identity comparisons."""

import threading
import time
import uuid

import cv2
import numpy as np


def iou(a, b):
    w = max(0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    h = max(0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    area = w * h
    return area / max(1e-9, a[2] * a[3] + b[2] * b[3] - area)


class Track:
    def __init__(self, number, box, at, now):
        self.id, self.first, self.last, self.seen = number, at, at, now
        self.box = list(box)
        self.filter = cv2.KalmanFilter(8, 4)
        self.filter.measurementMatrix = np.eye(4, 8, dtype=np.float32)
        self.filter.processNoiseCov = np.eye(8, dtype=np.float32) * 0.002
        self.filter.measurementNoiseCov = np.eye(4, dtype=np.float32) * 0.004
        self.filter.errorCovPost = np.eye(8, dtype=np.float32)
        self.filter.statePost = np.array([*box, 0, 0, 0, 0], dtype=np.float32).reshape(8, 1)

    def predict(self, dt):
        matrix = np.eye(8, dtype=np.float32)
        matrix[:4, 4:] = np.eye(4, dtype=np.float32) * dt
        self.filter.transitionMatrix = matrix
        return self.filter.predict()[:4, 0].tolist()

    def correct(self, box, at, now):
        estimate = self.filter.correct(np.asarray(box, dtype=np.float32).reshape(4, 1))
        self.box = estimate[:4, 0].tolist()
        self.last, self.seen = at, now

    def public(self):
        x, y, w, h = self.box
        x, y = max(0, min(1, x)), max(0, min(1, y))
        return {
            "id": self.id,
            "box": [x, y, max(0, min(1 - x, w)), max(0, min(1 - y, h))],
            "first": self.first,
            "last": self.last,
        }


class Tracker:
    # Brief detector dropouts preserve a track but are not counted as visible.
    max_gap = 1.5
    max_tracks = 256

    def __init__(self):
        self.tracks, self.next_id, self.updated = [], 1, None
        self.epoch = str(uuid.uuid4())

    def update(self, boxes, at, now):
        dt = min(1.0, max(0.001, now - self.updated)) if self.updated is not None else 0.15
        self.updated = now
        self.tracks = [t for t in self.tracks if now - t.seen <= self.max_gap]
        predictions = [t.predict(dt) for t in self.tracks]
        pairs = []
        for i, predicted in enumerate(predictions):
            for j, box in enumerate(boxes):
                overlap = iou(predicted, box)
                # Use motion prediction and a tight size-relative distance gate.
                distance = (
                    (predicted[0] + predicted[2] / 2 - box[0] - box[2] / 2) ** 2
                    + (predicted[1] + predicted[3] / 2 - box[1] - box[3] / 2) ** 2
                ) ** 0.5
                scale = max(0.02, (box[2] ** 2 + box[3] ** 2) ** 0.5)
                ratio = max(predicted[2], 0.001) / max(box[2], 0.001)
                if overlap >= 0.1 or (distance < scale * 0.65 and 0.5 < ratio < 2):
                    pairs.append((overlap - distance / scale * 0.15, i, j))
        used_tracks, used_boxes, visible, arrivals = set(), set(), [], []
        for _, i, j in sorted(pairs, reverse=True):
            if i in used_tracks or j in used_boxes:
                continue
            used_tracks.add(i)
            used_boxes.add(j)
            track = self.tracks[i]
            track.correct(boxes[j], at, now)
            visible.append(track.public())
        for j, box in enumerate(boxes):
            if j in used_boxes or len(self.tracks) >= self.max_tracks:
                continue
            track = Track(self.next_id, box, at, now)
            self.next_id += 1
            self.tracks.append(track)
            visible.append(track.public())
            arrivals.append(track.public())
        return {
            "tracks": sorted(visible, key=lambda t: t["id"]),
            "arrivals": arrivals,
            "count": len(visible),
            "tracking_epoch": self.epoch,
        }


class PresenceSessions:
    ttl = 30.0
    capacity = 32

    def __init__(self):
        self.sessions, self.lock = {}, threading.Lock()

    def update(self, owner, session, boxes, at):
        now = time.monotonic()
        with self.lock:
            self.sessions = {k: v for k, v in self.sessions.items() if now - v.updated < self.ttl}
            key = (owner, session)
            if key not in self.sessions:
                if len(self.sessions) >= self.capacity:
                    oldest = min(self.sessions, key=lambda k: self.sessions[k].updated)
                    del self.sessions[oldest]
                self.sessions[key] = Tracker()
            return self.sessions[key].update(boxes, at, now)

    def clear(self, owner, session):
        with self.lock:
            self.sessions.pop((owner, session), None)
