import { classifyHand } from "./gesture-core.mjs";
export class GestureLatch {
  constructor() {
    this.value = "none";
    this.candidate = "none";
    this.since = 0;
    this.changed = -Infinity;
  }
  update(name, now) {
    if (name !== this.candidate) {
      this.candidate = name;
      this.since = now;
    }
    if (
      now - this.since >= 180 &&
      now - this.changed >= 350 &&
      name !== this.value
    ) {
      this.value = name;
      this.changed = now;
    }
    return this.value;
  }
}
export class DualHands {
  constructor() {
    this.reset();
  }
  reset() {
    this.slots = new Map();
    this.combo = new GestureLatch();
    this.last = 0;
  }
  update(hands, now, sensitivity = 1) {
    const visible = [];
    const used = new Set();
    for (const hand of hands.slice(0, 2)) {
      if (
        !hand.points ||
        hand.points.length !== 21 ||
        hand.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
      )
        continue;
      let side = hand.side;
      if (side !== "Left" && side !== "Right")
        side = hand.points[0].x < 0.5 ? "Left" : "Right";
      if (used.has(side)) continue;
      used.add(side);
      let slot = this.slots.get(side);
      if (!slot || now - slot.at > 300)
        slot = {
          latch: new GestureLatch(),
          points: hand.points,
          pinch: false,
          at: now,
        };
      const gesture = classifyHand(hand.points, slot.pinch, sensitivity);
      slot.pinch = gesture.pinch;
      slot.points = hand.points.map((p, i) => ({
        x: slot.points[i].x * 0.35 + p.x * 0.65,
        y: slot.points[i].y * 0.35 + p.y * 0.65,
      }));
      slot.at = now;
      this.slots.set(side, slot);
      visible.push({
        side,
        points: slot.points,
        gesture: slot.latch.update(gesture.name, now),
      });
    }
    for (const [side, slot] of this.slots)
      if (now - slot.at > 300) this.slots.delete(side);
    let combo = "none";
    if (visible.length === 2) {
      const [a, b] = visible;
      const distance = Math.hypot(
        a.points[9].x - b.points[9].x,
        a.points[9].y - b.points[9].y,
      );
      combo =
        distance < 0.22
          ? "close"
          : visible.every((h) => h.gesture === "palm")
            ? "open"
            : "none";
    }
    this.last = now;
    return {
      hands: visible,
      combo:
        visible.length === 2
          ? this.combo.update(combo, now)
          : this.combo.update("none", now),
      at: now,
    };
  }
}
