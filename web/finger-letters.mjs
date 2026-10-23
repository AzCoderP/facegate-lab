export function fingerCount(p) {
  if (
    !p ||
    p.length !== 21 ||
    p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y))
  )
    return 0;
  const d = (a, b) => Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);
  const fingers = [8, 12, 16, 20].filter(
    (t) => d(t, 0) > d(t - 2, 0) * 1.18,
  ).length;
  const thumb = d(4, 17) > d(3, 17) * 1.25 && d(4, 5) > d(3, 5) * 1.15;
  return fingers + Number(thumb);
}
export class LetterGate {
  constructor() {
    this.reset();
  }
  reset() {
    this.candidate = 0;
    this.since = 0;
    this.armed = true;
    this.release = null;
  }
  update(count, now) {
    if (!count) {
      this.release ??= now;
      if (now - this.release >= 300) this.armed = true;
      this.candidate = 0;
      return null;
    }
    this.release = null;
    if (count !== this.candidate) {
      this.candidate = count;
      this.since = now;
    }
    if (this.armed && now - this.since >= 700) {
      this.armed = false;
      return [null, "P", "O", "L", "A", "D"][count] || null;
    }
    return null;
  }
}
