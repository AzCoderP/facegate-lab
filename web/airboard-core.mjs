export class StrokeStore {
  constructor(limit = 200) {
    this.limit = limit;
    this.paths = [];
    this.past = [];
    this.future = [];
  }
  remember() {
    this.past.push(this.paths);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  add(path) {
    if (this.paths.length >= this.limit) return false;
    this.remember();
    this.paths = [...this.paths, structuredClone(path)];
    return true;
  }
  undo() {
    if (this.past.length) {
      this.future.push(this.paths);
      this.paths = this.past.pop();
    }
  }
  redo() {
    if (this.future.length) {
      this.past.push(this.paths);
      this.paths = this.future.pop();
    }
  }
  clear() {
    if (this.paths.length) {
      this.remember();
      this.paths = [];
    }
  }
}
export function paintPath(ctx, path) {
  if (path.kind === "clear") {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  if (!path.points?.length) return;
  ctx.save();
  ctx.globalCompositeOperation = path.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = path.color;
  ctx.fillStyle = path.color;
  ctx.lineWidth = path.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const p = path.points;
  ctx.beginPath();
  if (path.circle)
    ctx.arc(path.circle.x, path.circle.y, path.circle.radius, 0, Math.PI * 2);
  else if (p.length === 1) {
    ctx.arc(p[0].x, p[0].y, path.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  } else {
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) {
      if (path.smooth && i < p.length - 1) {
        const a = p[i - 1],
          b = p[i],
          c = p[i + 1];
        const dot =
          ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)) /
          (Math.hypot(b.x - a.x, b.y - a.y) *
            Math.hypot(c.x - b.x, c.y - b.y) || 1);
        if (dot > 0.5)
          ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
        else ctx.lineTo(b.x, b.y);
      } else ctx.lineTo(p[i].x, p[i].y);
    }
    if (path.closed) ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}
