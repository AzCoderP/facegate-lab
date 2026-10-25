export class BoardReplica {
  constructor() {
    this.generation = "";
    this.revision = -1;
    this.strokes = [];
  }
  apply(data) {
    if (data.strokes) {
      this.strokes = data.strokes.map((s) => ({
        ...s,
        points: s.points.map((p) => [...p]),
      }));
    } else
      for (const event of data.events || []) {
        if (event.revision <= this.revision) continue;
        if (event.revision !== this.revision + 1) throw Error("BOARD_RESYNC");
        this.event(event);
        this.revision = event.revision;
      }
    this.generation = data.generation;
    this.revision = data.revision;
  }
  event(e) {
    if (e.op === "begin")
      this.strokes.push({
        ...e.stroke,
        points: e.stroke.points.map((p) => [...p]),
      });
    else if (e.op === "undo")
      this.strokes = this.strokes.filter((s) => s.id !== e.id);
    else {
      const s = this.strokes.find((s) => s.id === e.id);
      if (s) {
        s.points.push(...e.points);
        if (e.op === "end") s.ended = true;
      }
    }
  }
}
export function renderBoard(canvas, strokes) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    const [first, ...rest] = stroke.points;
    if (!rest.length) {
      ctx.beginPath();
      ctx.arc(
        first[0] * canvas.width,
        first[1] * canvas.height,
        stroke.width / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(first[0] * canvas.width, first[1] * canvas.height);
    for (const p of rest) ctx.lineTo(p[0] * canvas.width, p[1] * canvas.height);
    ctx.stroke();
  }
}
