import { BoardReplica, renderBoard } from "./board-core.mjs";
export class SharedBoardUI {
  constructor({
    canvas,
    api,
    editable = false,
    status,
    color,
    width,
    clear,
    undo,
  }) {
    Object.assign(this, {
      canvas,
      api,
      editable,
      status,
      color,
      width,
      clear,
      undo,
    });
    this.model = new BoardReplica();
    this.seq = 0;
    this.enabled = !editable;
    this.queue = [];
    this.sending = false;
    this.active = null;
    this.timer = null;
    this.running = false;
    this.version = 0;
    this.lastSent = -Infinity;
    canvas.width = 1000;
    canvas.height = 600;
    if (editable) {
      canvas.addEventListener("pointerdown", (e) => this.down(e));
      canvas.addEventListener("pointermove", (e) => this.move(e));
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
        canvas.addEventListener(name, () => this.up());
      clear.onclick = () => this.edit("clear");
      undo.onclick = () => this.edit("undo");
    }
  }
  text(s) {
    if (this.status) this.status.textContent = s;
  }
  paint() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      renderBoard(this.canvas, this.model.strokes);
    });
  }
  setEnabled(value) {
    if (this.enabled === value) return;
    this.version++;
    this.enabled = value;
    if (!value) {
      this.up();
      this.queue = [];
      this.model = new BoardReplica();
      this.paint();
    }
    this.canvas.classList.toggle("board-disabled", !value);
    this.buttons();
  }
  buttons() {
    if (this.clear)
      this.clear.disabled = !this.enabled || this.sending || !!this.active;
    if (this.undo)
      this.undo.disabled = !this.enabled || this.sending || !!this.active;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.up();
  }
  async poll() {
    if (!this.running) return;
    if (
      !document.hidden &&
      this.enabled &&
      !this.sending &&
      !this.active &&
      !this.queue.length
    ) {
      try {
        const data = await this.api(
          "board?after=" +
            this.model.revision +
            "&generation=" +
            encodeURIComponent(this.model.generation),
        );
        if (!this.running || !this.enabled) return;
        this.model.apply(data);
        if (data.seq !== undefined) this.seq = data.seq;
        this.paint();
        this.text(
          this.editable
            ? "Barmağınla lövhədə yaz və ya çək."
            : "Telefonun yazısı bu lövhədə görünür.",
        );
      } catch (e) {
        if (e.message === "BOARD_RESYNC") {
          this.model = new BoardReplica();
        } else
          this.text(
            e.message === "BOARD_SERVICE_UNAVAILABLE"
              ? "Kamera/lövhə xidməti üçün start-control.cmd işə sal."
              : e.message,
          );
      }
    }
    this.timer = setTimeout(() => this.poll(), 180);
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  down(e) {
    if (
      !this.enabled ||
      !this.model.generation ||
      this.active ||
      e.button !== 0
    )
      return;
    if (this.model.strokes.length >= 128) {
      this.text("Lövhə dolub. Geri al və ya təmizlə.");
      return;
    }
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const orphan = this.model.strokes.at(-1);
    if (orphan && !orphan.ended) {
      orphan.ended = true;
      this.enqueue({ op: "end", stroke: orphan.id, points: [] });
    }
    const stroke = {
      id: crypto.randomUUID(),
      color: this.color.value,
      width: Number(this.width.value),
      points: [this.point(e)],
      ended: false,
    };
    this.active = stroke;
    this.model.strokes.push(stroke);
    this.enqueue({
      op: "begin",
      stroke: stroke.id,
      points: [...stroke.points],
      color: stroke.color,
      width: stroke.width,
    });
    this.paint();
    this.buttons();
  }
  move(e) {
    if (!this.active || !this.enabled) return;
    e.preventDefault();
    const p = this.point(e),
      last = this.active.points.at(-1);
    if (Math.hypot((p[0] - last[0]) * 1000, (p[1] - last[1]) * 600) < 2) return;
    if (this.active.points.length >= 1000) {
      this.up();
      this.text("Xətt uzundur; barmağını qaldırıb davam et.");
      return;
    }
    this.active.points.push(p);
    this.enqueue({ op: "append", stroke: this.active.id, points: [p] });
    this.paint();
  }
  up() {
    if (!this.active) return;
    const s = this.active;
    this.active = null;
    s.ended = true;
    this.enqueue({ op: "end", stroke: s.id, points: [] });
    this.buttons();
  }
  edit(op) {
    if (!this.enabled || this.sending || this.active || this.queue.length)
      return;
    if (op === "clear") this.model.strokes = [];
    else this.model.strokes.pop();
    this.enqueue({ op, stroke: "", points: [] });
    this.paint();
  }
  enqueue(item) {
    const tail = this.queue.at(-1);
    if (
      item.op === "append" &&
      tail?.op === "append" &&
      tail.stroke === item.stroke &&
      tail.points.length + item.points.length <= 48
    ) {
      tail.points.push(...item.points);
      return;
    }
    if (this.queue.length >= 160) {
      this.text("Bağlantı zəifdir. Yazını dayandırıb yenidən qoşul.");
      this.enabled = false;
      return;
    }
    this.queue.push({ ...item, generation: this.model.generation });
    this.pump();
  }
  async pump() {
    if (this.sending || !this.queue.length) return;
    const version = this.version;
    this.sending = true;
    this.buttons();
    try {
      while (this.queue.length && this.enabled) {
        await new Promise((r) =>
          setTimeout(r, Math.max(0, 65 - (performance.now() - this.lastSent))),
        );
        if (version !== this.version) return;
        const item = this.queue.shift(),
          payload = { ...item, seq: this.seq + 1 };
        let response;
        this.lastSent = performance.now();
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            response = await this.api("board", payload);
            break;
          } catch (e) {
            if (
              attempt ||
              [
                "BOARD_CHANGED",
                "DRAWING_NOT_ALLOWED",
                "SESSION_ENDED",
                "DRAW_SEQUENCE_INVALID",
              ].includes(e.message)
            )
              throw e;
            await new Promise((r) => setTimeout(r, 250));
          }
        }
        if (version !== this.version) return;
        this.seq = response.seq;
        this.model.revision = response.revision;
        this.model.generation = response.generation;
      }
    } catch (e) {
      if (version !== this.version) return;
      this.active = null;
      this.queue = [];
      this.model = new BoardReplica();
      this.text("Yazı sinxronlaşdırılmadı: " + e.message);
      this.paint();
    } finally {
      this.sending = false;
      this.buttons();
    }
  }
}
