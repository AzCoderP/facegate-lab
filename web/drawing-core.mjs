const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Speed-adaptive low-pass filtering in board pixels. Repeated large jumps re-anchor
// the cursor but explicitly break the stroke instead of drawing across lost tracking.
export class PointerFilter {
  reset() {
    this.point = null;
    this.time = null;
    this.speed = 0;
    this.jumps = 0;
  }
  constructor() {
    this.reset();
  }
  update(raw, now, strength = 1) {
    if (!this.point) {
      this.point = { ...raw };
      this.time = now;
      return { ...raw, breakStroke: true };
    }
    const dt = Math.max(0.008, Math.min(0.15, (now - this.time) / 1000));
    this.time = now;
    const gap = distance(raw, this.point);
    if (gap > 210) {
      if (++this.jumps < 3) return { ...this.point, breakStroke: false };
      this.point = { ...raw };
      this.jumps = 0;
      this.speed = 0;
      return { ...raw, breakStroke: true };
    }
    this.jumps = 0;
    this.speed = 0.7 * this.speed + (0.3 * gap) / dt;
    if (gap < 1.2 * strength) return { ...this.point, breakStroke: false };
    const cutoff = 1.8 / strength + (0.018 * this.speed) / strength;
    const alpha = 1 - Math.exp(-2 * Math.PI * cutoff * dt);
    this.point = {
      x: this.point.x + alpha * (raw.x - this.point.x),
      y: this.point.y + alpha * (raw.y - this.point.y),
    };
    return { ...this.point, breakStroke: false };
  }
}

export function resampleStroke(input, step = 4) {
  if (!input.length) return [];
  const result = [input[0]];
  let remaining = step;
  for (let i = 1; i < input.length; i++) {
    let a = { ...input[i - 1] },
      b = input[i],
      length = distance(a, b);
    while (length >= remaining && result.length < 4096) {
      const t = remaining / length;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      result.push(a);
      length = distance(a, b);
      remaining = step;
    }
    remaining -= length;
  }
  if (distance(result.at(-1), input.at(-1)) > 0.5) result.push(input.at(-1));
  return result;
}

// Deterministic 2D fitting only: no learned model, physical scale or depth estimate.
export function fitStroke(input, requested = "auto") {
  if (
    input.length < 5 ||
    input.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return { type: "free", reason: "Xətt çox qısadır." };
  const p = resampleStroke(input),
    n = p.length;
  if (n < 8) return { type: "free", reason: "Xətt çox qısadır." };
  const mean = {
    x: p.reduce((s, a) => s + a.x, 0) / n,
    y: p.reduce((s, a) => s + a.y, 0) / n,
  };
  const q = p.map((a) => ({ x: a.x - mean.x, y: a.y - mean.y }));
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const a of q) {
    xx += a.x * a.x;
    xy += a.x * a.y;
    yy += a.y * a.y;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
    ux = Math.cos(angle),
    uy = Math.sin(angle);
  const along = q.map((a) => a.x * ux + a.y * uy),
    across = q.map((a) => -a.x * uy + a.y * ux);
  const lo = Math.min(...along),
    hi = Math.max(...along),
    span = hi - lo;
  const path = p.slice(1).reduce((s, a, i) => s + distance(a, p[i]), 0);
  const gap = distance(p[0], p.at(-1));
  const lineError =
    Math.sqrt(across.reduce((s, a) => s + a * a, 0) / n) / Math.max(span, 1);
  const candidates = [];
  if (span > 35 && lineError < 0.045 && gap / Math.max(path, 1) > 0.82)
    candidates.push({
      type: "line",
      error: lineError,
      points: [
        { x: mean.x + lo * ux, y: mean.y + lo * uy },
        { x: mean.x + hi * ux, y: mean.y + hi * uy },
      ],
    });
  const determinant = xx * yy - xy * xy;
  if (determinant > 1e-6) {
    let bx = 0,
      by = 0;
    for (const a of q) {
      const r = a.x * a.x + a.y * a.y;
      bx += (a.x * r) / 2;
      by += (a.y * r) / 2;
    }
    const cx = (bx * yy - by * xy) / determinant,
      cy = (by * xx - bx * xy) / determinant;
    const center = { x: mean.x + cx, y: mean.y + cy };
    const radii = p.map((a) => distance(a, center)),
      radius = radii.reduce((s, r) => s + r, 0) / n;
    const error =
      Math.sqrt(radii.reduce((s, r) => s + (r - radius) ** 2, 0) / n) /
      Math.max(radius, 1);
    const bins = new Set(
      p.map(
        (a) =>
          Math.floor(
            ((Math.atan2(a.y - center.y, a.x - center.x) + Math.PI) /
              (2 * Math.PI)) *
              12,
          ) % 12,
      ),
    );
    if (
      radius > 18 &&
      error < 0.085 &&
      gap < radius * 0.55 &&
      bins.size >= 11 &&
      path / radius > 5.2 &&
      path / radius < 7.8
    )
      candidates.push({ type: "circle", center, radius, error });
  }
  // Search orientations; unlike PCA alone this also handles rotated squares.
  let best = null;
  for (let degrees = 0; degrees < 90; degrees += 2) {
    const t = (degrees * Math.PI) / 180,
      c = Math.cos(t),
      s = Math.sin(t);
    const coords = q.map((a) => ({
      x: a.x * c + a.y * s,
      y: -a.x * s + a.y * c,
    }));
    const x0 = Math.min(...coords.map((a) => a.x)),
      x1 = Math.max(...coords.map((a) => a.x));
    const y0 = Math.min(...coords.map((a) => a.y)),
      y1 = Math.max(...coords.map((a) => a.y));
    const w = x1 - x0,
      h = y1 - y0,
      short = Math.min(w, h);
    if (short < 25 || Math.max(w, h) / short > 8) continue;
    const sides = [[], [], [], []];
    let total = 0;
    for (const a of coords) {
      const d = [
        Math.abs(a.x - x0),
        Math.abs(a.x - x1),
        Math.abs(a.y - y0),
        Math.abs(a.y - y1),
      ];
      const side = d.indexOf(Math.min(...d));
      total += d[side] ** 2;
      sides[side].push(side < 2 ? a.y : a.x);
    }
    const error = Math.sqrt(total / n) / short;
    const covered = sides.every(
      (v, i) =>
        v.length > 2 &&
        (Math.max(...v) - Math.min(...v)) / (i < 2 ? h : w) > 0.65,
    );
    if (
      covered &&
      error < 0.075 &&
      gap < Math.hypot(w, h) * 0.2 &&
      path / (2 * (w + h)) > 0.8 &&
      path / (2 * (w + h)) < 1.3 &&
      (!best || error < best.error)
    )
      best = {
        type: "rectangle",
        error,
        points: [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ].map(([x, y]) => ({
          x: mean.x + x * c - y * s,
          y: mean.y + x * s + y * c,
        })),
      };
  }
  if (best) candidates.push(best);
  const selected = candidates
    .filter((c) => requested === "auto" || c.type === requested)
    .sort((a, b) => a.error - b.error)[0];
  return (
    selected || {
      type: "free",
      reason: "Aydın həndəsi fiqur tapılmadı; sərbəst xətt saxlanıldı.",
    }
  );
}
