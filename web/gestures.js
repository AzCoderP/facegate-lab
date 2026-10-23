let tele = null;
async function ensureTele() {
  if (tele?.dead) tele = null;
  if (tele || mode() !== "tele") return;
  try {
    const { Telekinesis } = await import("/static/telekinesis.mjs");
    if (mode() !== "tele" || tele) return;
    tele = new Telekinesis(overlay.parentElement, (text) => {
      $("#tele-status").textContent = text;
    });
  } catch (error) {
    $("#tele-status").textContent =
      "3D açıla bilmədi. WebGL 2 dəstəyini yoxla.";
    console.error(error);
  }
}
import { DualHands } from "/static/dual-hand-core.mjs";
import { paintEffects } from "/static/hand-effects.mjs";
const dualHands = new DualHands();
let effectState = null;
import { fingerCount, LetterGate } from "/static/finger-letters.mjs";
const letterGate = new LetterGate();
import { StrokeStore, paintPath } from "/static/airboard-core.mjs";
import { classifyHand, calculate, geometry } from "/static/gesture-core.mjs";
import { PointerFilter, fitStroke } from "/static/drawing-core.mjs";
const pointerFilter = new PointerFilter();
const vectors = new StrokeStore();
let measuredFrames = 0,
  measuredSince = performance.now();
let pendingStroke = null,
  drawPinchAt = null;
let backgroundNext = false,
  lastMode = "draw";

const $ = (s) => document.querySelector(s);
const board = $("#gesture-board"),
  ctx = board.getContext("2d");
const ink = document.createElement("canvas");
ink.width = board.width;
ink.height = board.height;
const pen = ink.getContext("2d");
const video = $("#gesture-video"),
  overlay = $("#gesture-landmarks"),
  marks = overlay.getContext("2d");
const effects = document.createElement("canvas");
effects.width = 960;
effects.height = 720;
effects.id = "hand-effects";
overlay.parentElement.append(effects);
const effectsCtx = effects.getContext("2d");
let camera,
  worker,
  loading = false,
  frameBusy = false,
  animation = 0,
  epoch = 0,
  cancelInit,
  timer,
  lastFrame = -1,
  frameTime = 0;
let previous = null,
  smooth = null,
  pinched = false,
  action = "none",
  fistAt = null,
  fistUsed = false,
  pointerId = null;
let rotation = { x: -0.35, y: 0.5 };
const names = {
  none: "Əl görünmür",
  pinch: "Pinch — seçim / çək / döndər",
  index: "Şəhadət — kursor",
  two: "İki barmaq — naviqasiya / qələm qaldırılıb",
  palm: "Açıq ovuc — fasilə",
  fist: "Yumruq — silgini seç",
  other: "Jesti aydın göstər",
};
const mode = () => $("#gesture-mode").value;
const installHint = () =>
  mode() === "objects"
    ? "scripts/download_objects.py"
    : "scripts/download_gestures.py";
const status = (message) => {
  $("#gesture-status").textContent = message;
};
function rebuildInk() {
  pen.clearRect(0, 0, ink.width, ink.height);
  for (const path of vectors.paths) paintPath(pen, path);
  if (pendingStroke) paintPath(pen, pendingStroke);
  $("#gesture-undo").disabled = !vectors.past.length && !pendingStroke;
  $("#gesture-redo").disabled = !vectors.future.length;
}
function undo() {
  resetAction();
  vectors.undo();
  rebuildInk();
  render();
}
function redo() {
  resetAction();
  vectors.redo();
  rebuildInk();
  render();
}
function render() {
  if (mode() === "objects") {
    if (!camera) {
      ctx.fillStyle = "#041321";
      ctx.fillRect(0, 0, 960, 600);
      ctx.fillStyle = "#9cbbd9";
      ctx.font = "24px Segoe UI";
      ctx.textAlign = "center";
      ctx.fillText("Əşya analizi üçün kameranı aç", 480, 300);
    }
    return;
  }
  ctx.fillStyle = "#041321";
  ctx.fillRect(0, 0, board.width, board.height);
  ctx.strokeStyle = "#12304a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < board.width; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, board.height);
  }
  for (let y = 0; y < board.height; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(board.width, y);
  }
  ctx.stroke();
  if (mode() === "math") {
    ctx.font = "32px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    [...$("#gesture-keypad").children].forEach((key, n) => {
      const x = (n % 5) * 192,
        y = Math.floor(n / 5) * 150;
      ctx.fillStyle = key.classList.contains("gesture-key-hover")
        ? "#145388"
        : "#0b2239";
      ctx.fillRect(x + 5, y + 5, 182, 140);
      ctx.fillStyle = "#e2efff";
      ctx.fillText(key.textContent, x + 96, y + 75);
    });
    return;
  }
  if (mode() !== "shape") {
    ctx.drawImage(ink, 0, 0);
    return;
  }
  const { vertices, edges } = geometry($("#gesture-object").value);
  const scale = Number($("#gesture-scale").value);
  const points = vertices.map(([x, y, z]) => {
    const a = x * Math.cos(rotation.y) + z * Math.sin(rotation.y);
    const b = z * Math.cos(rotation.y) - x * Math.sin(rotation.y);
    const c = y * Math.cos(rotation.x) - b * Math.sin(rotation.x);
    const d = y * Math.sin(rotation.x) + b * Math.cos(rotation.x);
    const perspective = 4 / (4 + d);
    return [480 + a * scale * perspective, 300 + c * scale * perspective];
  });
  ctx.strokeStyle = $("#gesture-color").value;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of edges) {
    ctx.moveTo(...points[a]);
    ctx.lineTo(...points[b]);
  }
  ctx.stroke();
}
function resetAction() {
  finishStroke();
  previous = null;
  action = "none";
}
function finishStroke() {
  const current = pendingStroke;
  pendingStroke = null;
  if (!current) return;
  if (!current.erase && current.tool !== "free") {
    const fitted = fitStroke(current.points, current.tool);
    if (fitted.type === "circle")
      current.circle = { ...fitted.center, radius: fitted.radius };
    else if (fitted.type !== "free") {
      current.points = fitted.points;
      current.closed = fitted.type === "rectangle";
      current.smooth = false;
    }
    $("#gesture-fit").textContent =
      fitted.type === "free"
        ? "Sərbəst xətt saxlanıldı."
        : "Həndəsi fiqur düzəldildi.";
  }
  if (!vectors.add(current))
    $("#gesture-fit").textContent =
      "200 xətt həddi. PNG-ni saxla, sonra lövhəni təmizlə.";
  rebuildInk();
  render();
}
function stroke(point, erase = $("#air-tool").value === "erase") {
  const nextAction = erase ? "erase" : "draw";
  if (!pendingStroke || action !== nextAction) {
    resetAction();
    action = nextAction;
    pendingStroke = {
      points: [],
      tool:
        $("#air-preset").value === "beautify"
          ? $("#gesture-snap").value
          : "free",
      color: $("#gesture-color").value,
      width: Number($("#gesture-width").value) * (erase ? 6 : 1),
      erase,
      smooth: $("#air-preset").value !== "raw",
    };
  }
  const last = pendingStroke.points.at(-1);
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.8)
    pendingStroke.points.push({ x: point.x, y: point.y });
  previous = point;
  rebuildInk();
  render();
  if (pendingStroke.points.length >= 4096) resetAction();
}
function rotate(point) {
  if (previous && action === "rotate") {
    rotation.y += (point.x - previous.x) * 0.008;
    rotation.x += (point.y - previous.y) * 0.008;
  }
  previous = point;
  action = "rotate";
  render();
}
function showCursor(point) {
  const cursor = $("#gesture-cursor");
  cursor.hidden = !point;
  if (point) {
    cursor.style.left = `${point.x / 9.6}%`;
    cursor.style.top = `${point.y / 6}%`;
  }
}
function drawMarks(points) {
  marks.clearRect(0, 0, 480, 360);
  if (mode() === "draw") {
    marks.save();
    marks.scale(480 / 960, 360 / 600);
    marks.drawImage(ink, 0, 0);
    marks.restore();
  }
  if (!points || !$("#air-landmarks").checked) return;
  const chains = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [0, 17],
  ];
  const xy = (p) => [(1 - p.x) * 480, p.y * 360];
  marks.strokeStyle = "#00d5af";
  marks.lineWidth = 2;
  marks.beginPath();
  for (const chain of chains) {
    marks.moveTo(...xy(points[chain[0]]));
    for (const n of chain.slice(1)) marks.lineTo(...xy(points[n]));
  }
  marks.stroke();
  marks.fillStyle = "#ffffff";
  for (const p of points) {
    marks.beginPath();
    marks.arc(...xy(p), 3, 0, 2 * Math.PI);
    marks.fill();
  }
}
function processHand(points) {
  drawMarks(points);
  if (mode() === "letters") {
    resetAction();
    showCursor(null);
    const count = fingerCount(points),
      letter = letterGate.update(count, performance.now());
    $("#gesture-name").textContent =
      `${count} barmaq · ${["—", "P", "O", "L", "A", "D"][count] || "—"}`;
    if (letter)
      $("#finger-text").value = ($("#finger-text").value + letter).slice(0, 80);
    return;
  }
  const gesture = classifyHand(
      points,
      pinched,
      Number($("#air-sensitivity").value),
    ),
    wasPinched = pinched;
  pinched = gesture.pinch;
  $("#gesture-name").textContent = names[gesture.name];
  if (!points) {
    smooth = null;
    pointerFilter.reset();
    drawPinchAt = null;
    resetAction();
    showCursor(null);
    fistAt = null;
    fistUsed = false;
    return;
  }
  const raw = {
    x: Math.max(0, Math.min(1, 1 - points[8].x)) * 960,
    y: Math.max(0, Math.min(1, points[8].y)) * 600,
  };
  const filtered = pointerFilter.update(
    raw,
    performance.now(),
    $("#air-preset").value === "raw"
      ? 0
      : Number($("#gesture-smoothing").value),
  );
  if (filtered.breakStroke) resetAction();
  smooth = filtered;
  showCursor(smooth);
  if (gesture.name === "fist") {
    fistAt ??= performance.now();
    if (!fistUsed && performance.now() - fistAt >= 450 && mode() !== "shape") {
      resetAction();
      $("#air-tool").value = "erase";
      fistUsed = true;
    }
  } else {
    fistAt = null;
    fistUsed = false;
  }
  // Math keys use the entire camera frame, mirrored like the board.
  document
    .querySelectorAll(".gesture-key-hover")
    .forEach((b) => b.classList.remove("gesture-key-hover"));
  if (mode() === "math") {
    const keys = [...$("#gesture-keypad").children];
    const col = Math.min(4, Math.floor((smooth.x / 960) * 5)),
      row = Math.min(3, Math.floor((smooth.y / 600) * 4));
    const key = keys[row * 5 + col];
    if (key) {
      key.classList.add("gesture-key-hover");
      if (pinched && !wasPinched) key.click();
    }
    render();
    resetAction();
  } else if (pinched) {
    drawPinchAt ??= performance.now();
    if (performance.now() - drawPinchAt < 90) return;
    if (mode() === "shape") rotate(smooth);
    else stroke(smooth);
  } else if (gesture.name === "two" && mode() === "draw") {
    drawPinchAt = null;
    resetAction();
  } else {
    drawPinchAt = null;
    resetAction();
  }
}
function stop(
  message = mode() === "objects"
    ? "Kamera bağlıdır. Əşyanı yoxlamaq üçün kameranı aç."
    : "Kamera bağlıdır. Lövhə siçanla işləyir.",
) {
  letterGate.reset();
  dualHands.reset();
  effectState = null;
  effectsCtx.clearRect(0, 0, 960, 720);
  tele?.dispose();
  tele = null;
  epoch++;
  if (cancelInit) {
    const cancel = cancelInit;
    cancelInit = null;
    cancel(new Error("Dayandırıldı"));
  }
  clearTimeout(timer);
  cancelAnimationFrame(animation);
  worker?.terminate();
  worker = null;
  camera?.getTracks().forEach((t) => t.stop());
  camera = null;
  video.srcObject = null;
  loading = false;
  measuredFrames = 0;
  measuredSince = performance.now();
  $("#air-fps").textContent = "Kamera bağlıdır";
  frameBusy = false;
  lastFrame = -1;
  frameTime = 0;
  pinched = false;
  smooth = null;
  pointerFilter.reset();
  drawPinchAt = null;
  backgroundNext = false;
  $("#gesture-detections").replaceChildren();
  fistAt = null;
  fistUsed = false;
  pointerId = null;
  resetAction();
  showCursor(null);
  drawMarks(null);
  $("#gesture-start").disabled = false;
  $("#gesture-smoke").disabled = false;
  $("#gesture-stop").disabled = true;
  $("#gesture-name").textContent =
    mode() === "objects" ? "Əşya gözlənilir" : "Əl gözlənilir";
  status(message);
  if (mode() === "objects") render();
}
const objectNames = {
  pen: "Qələm",
  notebook: "Dəftər",
  book: "Kitab (dəftərlə qarışa bilər)",
  "cell phone": "Telefon",
  laptop: "Noutbuk",
  cup: "Fincan",
  bottle: "Butulka",
  keyboard: "Klaviatura",
  mouse: "Siçan",
  scissors: "Qayçı",
  person: "İnsan",
  chair: "Stul",
  clock: "Saat",
  backpack: "Çanta",
};
function processObjects(data) {
  if (video.readyState < 2) return;
  ctx.save();
  ctx.translate(960, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, 960, 600);
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.font = "18px Segoe UI";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const rows = [];
  for (const item of data.objects || []) {
    const [bx, by, bw, bh] = item.bbox,
      x = 960 - (bx + bw) * 2,
      y = (by * 600) / 360,
      w = bw * 2,
      h = (bh * 600) / 360;
    const label =
      $("#object-language").value === "en"
        ? item.class
        : objectNames[item.class] || item.label;
    const text = Number.isFinite(item.score)
      ? `${label} · model balı ${item.score.toFixed(2)}`
      : `${label} · uzanma ${item.aspect.toFixed(1)}`;
    ctx.strokeStyle = "#00d5af";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#041321";
    ctx.fillRect(
      Math.max(0, x),
      Math.max(0, y),
      Math.min(940, ctx.measureText(text).width + 12),
      27,
    );
    ctx.fillStyle = "#e2efff";
    ctx.fillText(text, Math.max(0, x) + 5, Math.max(0, y) + 3);
    const row = document.createElement("li");
    row.textContent = text;
    rows.push(row);
  }
  if (!rows.length) {
    const row = document.createElement("li");
    row.textContent = data.needsBackground
      ? "Əvvəl əşyasız boş fonu yadda saxla."
      : data.backgroundSaved
        ? "Fon saxlanıldı. İndi əşyanı göstər."
        : "Bu kadrda etibarlı nəticə yoxdur.";
    rows.push(row);
  }
  $("#gesture-detections").replaceChildren(...rows);
  status(
    `Lokal əşya analizi · ${Math.round(data.elapsed)} ms · ${$("#gesture-detector").value === "geometry" ? "yalnız siluet" : $("#gesture-detector").value === "yolo" ? "YOLO11" : "COCO-SSD"}`,
  );
  $("#gesture-name").textContent = "Əşya rejimi — jestlər söndürülüb";
}
async function tick(now) {
  if (!camera || !worker) return;
  animation = requestAnimationFrame(tick);
  if (mode() === "effects")
    paintEffects(effectsCtx, effectState, now, {
      theme: $("#effect-theme").value,
      color: $("#effect-color").value,
      intensity: Number($("#effect-intensity").value),
    });
  if (
    frameBusy ||
    video.readyState < 2 ||
    video.currentTime === lastFrame ||
    now - frameTime < (mode() === "objects" ? 300 : 40)
  )
    return;
  frameBusy = true;
  lastFrame = video.currentTime;
  frameTime = now;
  const token = epoch;
  try {
    const frame = await createImageBitmap(video, {
      resizeWidth: 480,
      resizeHeight: 360,
    });
    if (token !== epoch || !worker) {
      frame.close();
      return;
    }
    worker.postMessage(
      { type: backgroundNext ? "background" : "frame", frame, timestamp: now },
      [frame],
    );
    backgroundNext = false;
    timer = setTimeout(
      () => stop("Analiz cavab vermədi. Kameranı yenidən aç."),
      $("#gesture-detector").value === "yolo" ? 60000 : 10000,
    );
  } catch {
    if (token === epoch) stop("Kamera kadrı oxunmadı. Kameranı yenidən aç.");
  }
}
$("#gesture-start").onclick = async () => {
  if (camera || loading || $("#app-shell").inert || $("#view-gestures").hidden)
    return;
  loading = true;
  const token = ++epoch;
  $("#gesture-start").disabled = true;
  $("#gesture-smoke").disabled = true;
  $("#gesture-stop").disabled = false;
  status(
    mode() === "objects" ? "Əşya analizi hazırlanır…" : "Əl modeli hazırlanır…",
  );
  try {
    if (
      !window.Worker ||
      !window.createImageBitmap ||
      !navigator.mediaDevices?.getUserMedia
    )
      throw new Error(
        "Bu brauzer əl izləməni dəstəkləmir. Müasir Chrome və ya Edge istifadə et.",
      );
    worker = new Worker(
      mode() === "objects"
        ? "/static/object-worker.js"
        : "/static/gesture-worker.js",
    );
    await new Promise((resolve, reject) => {
      cancelInit = reject;
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Model vaxtında yüklənmədi. ${installHint()} skriptini yoxla.`,
            ),
          ),
        45000,
      );
      worker.onerror = () =>
        reject(
          new Error(
            `Model açıla bilmədi. ${installHint()} skriptini işə sal və səhifəni yenilə.`,
          ),
        );
      worker.onmessage = ({ data }) => {
        if (data.type === "ready") {
          cancelInit = null;
          clearTimeout(timer);
          resolve();
        }
        if (data.type === "error") {
          clearTimeout(timer);
          reject(
            new Error(`Model yüklənmədi. ${installHint()} skriptini yoxla.`),
          );
        }
      };
      worker.postMessage({
        type: "init",
        dual: ["effects", "tele"].includes(mode()),
        method: $("#gesture-detector").value,
      });
    });
    if (token !== epoch) return;
    status("Kamera icazəsi gözlənilir…");
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    if (token !== epoch) {
      acquired.getTracks().forEach((t) => t.stop());
      return;
    }
    camera = acquired;
    video.srcObject = camera;
    await video.play();
    if (token !== epoch) return;
    if (mode() === "tele") await ensureTele();
    loading = false;
    camera
      .getVideoTracks()[0]
      .addEventListener("ended", () => stop("Kamera bağlantısı bitdi."), {
        once: true,
      });
    worker.onerror = () => stop("Analiz dayandı. Kameranı yenidən aç.");
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      frameBusy = false;
      if (data.type === "error") {
        stop("Analizdə xəta yarandı. Kameranı yenidən aç.");
        return;
      }
      if (data.type === "result") {
        if (["effects", "tele"].includes(mode())) {
          drawMarks(null);
          effectState = dualHands.update(
            data.hands || [],
            performance.now(),
            Number($("#air-sensitivity").value),
          );
          if (mode() === "tele") tele?.input(effectState);
          $("#gesture-name").textContent = effectState.hands.length
            ? effectState.hands
                .map(
                  (h) =>
                    `${h.side === "Left" ? "Sol" : "Sağ"}: ${names[h.gesture] || h.gesture}`,
                )
                .join(" · ")
            : "Əl izləməsi itdi — effektlər dayandırılıb";
          $("#effect-status").textContent =
            `${effectState.hands.length} əl · ${effectState.combo === "open" ? "İki açıq əl — portal" : effectState.combo === "close" ? "Əllər yaxındır — enerji" : "Əl effektləri"}`;
        } else processHand(data.points);
        measuredFrames++;
        const span = performance.now() - measuredSince;
        if (span >= 1000) {
          $("#air-fps").textContent =
            `${((measuredFrames * 1000) / span).toFixed(1)} analiz/s`;
          measuredFrames = 0;
          measuredSince = performance.now();
        }
        status(
          `Lokal əl izləmə · ${Math.round(data.elapsed)} ms · ${(data.hands || []).length} əl`,
        );
      }
      if (data.type === "objects") processObjects(data);
    };
    animation = requestAnimationFrame(tick);
  } catch (error) {
    if (token === epoch)
      stop(
        error.name === "NotAllowedError"
          ? "Kamera icazəsi verilmədi. Lövhədən siçanla istifadə edə bilərsən."
          : error.message,
      );
  }
};
$("#gesture-smoke").onclick = () => {
  if (camera || loading || $("#app-shell").inert) return;
  loading = true;
  const token = ++epoch;
  $("#gesture-start").disabled = true;
  $("#gesture-smoke").disabled = true;
  $("#gesture-stop").disabled = false;
  status("Model sintetik boş kadrla yoxlanılır; kamera açılmır…");
  worker = new Worker(
    mode() === "objects"
      ? "/static/object-worker.js"
      : "/static/gesture-worker.js",
  );
  timer = setTimeout(() => stop("Model sınağı vaxtında cavab vermədi."), 45000);
  worker.onerror = () =>
    stop(`Model sınağı alınmadı. ${installHint()} skriptini yoxla.`);
  worker.onmessage = async ({ data }) => {
    if (data.type === "error") {
      console.error("Lokal model:", data.message);
      stop(`Model sınağı alınmadı. ${installHint()} skriptini yoxla.`);
      return;
    }
    if (data.type === "ready") {
      try {
        const blank = document.createElement("canvas");
        blank.width = 480;
        blank.height = 360;
        const blankContext = blank.getContext("2d");
        blankContext.fillStyle = "#222222";
        blankContext.fillRect(0, 0, 480, 360);
        const frame = await createImageBitmap(blank);
        if (token !== epoch || !worker) {
          frame.close();
          return;
        }
        worker.postMessage(
          { type: "frame", frame, timestamp: performance.now() },
          [frame],
        );
      } catch {
        stop("Sintetik kadr hazırlanmadı.");
      }
    }
    if (data.type === "result")
      stop(
        data.points
          ? "Boş kadrda gözlənilməyən əl nəticəsi alındı."
          : "Model sınağı keçdi: WASM və əl modeli işləyir, boş kadrda əl tapılmadı. Canlı jest sınağı ayrıca lazımdır.",
      );
    if (data.type === "objects")
      stop(
        data.objects?.length
          ? "Boş kadrda gözlənilməyən obyekt nəticəsi alındı."
          : "Əşya analizinin kamerasız sınağı keçdi. Real əşyalarla dəqiqlik ayrıca yoxlanmalıdır.",
      );
  };
  worker.postMessage({
    type: "init",
    dual: ["effects", "tele"].includes(mode()),
    method: $("#gesture-detector").value,
  });
};
$("#gesture-stop").onclick = () => stop();
for (const event of ["pagehide", "facegate-lock", "facegate-face-camera"])
  window.addEventListener(event, () => stop());
window.addEventListener("facegate-view", (e) => {
  if (e.detail !== "gestures") stop();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop("Səhifə arxa plana keçdiyi üçün kamera bağlandı.");
});

function point(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 960,
    y: ((event.clientY - rect.top) / rect.height) * 600,
  };
}
board.addEventListener("pointerdown", (event) => {
  if (mode() === "objects") return;
  if (event.button !== 0 || camera || loading) return;
  pointerId = event.pointerId;
  board.setPointerCapture(pointerId);
  resetAction();
  if (mode() === "math") {
    const p = point(event);
    const n =
      Math.min(3, Math.floor(p.y / 150)) * 5 +
      Math.min(4, Math.floor(p.x / 192));
    $("#gesture-keypad").children[n]?.click();
    pointerId = null;
    return;
  }
  if (mode() === "shape") rotate(point(event));
  else stroke(point(event));
});
board.addEventListener("pointermove", (event) => {
  if (event.pointerId !== pointerId) return;
  if (mode() === "shape") rotate(point(event));
  else stroke(point(event));
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  board.addEventListener(event, () => {
    pointerId = null;
    resetAction();
  });
$("#gesture-undo").onclick = undo;
$("#gesture-redo").onclick = redo;
$("#gesture-clear").onclick = () => {
  if (
    !confirm("Bütün rəsmi təmizləmək istəyirsən? Geri al ilə bərpa etmək olar.")
  )
    return;
  resetAction();
  vectors.clear();
  rebuildInk();
  render();
};
for (const id of [
  "air-tool",
  "air-preset",
  "gesture-color",
  "gesture-width",
  "gesture-snap",
  "gesture-smoothing",
])
  $("#" + id).addEventListener("change", () => {
    resetAction();
    pointerFilter.reset();
  });
$("#gesture-mode").onchange = () => {
  dualHands.reset();
  effectState = null;
  effectsCtx.clearRect(0, 0, 960, 720);
  $("#effects-panel").hidden = mode() !== "effects";
  letterGate.reset();
  $("#finger-panel").hidden = mode() !== "letters";
  resetAction();
  if (
    ["objects", "effects", "tele"].includes(mode()) ||
    ["objects", "effects", "tele"].includes(lastMode)
  )
    stop();
  lastMode = mode();
  $("#tele-panel").hidden = mode() !== "tele";
  if (mode() === "tele") ensureTele();
  $("#gesture-drawing-tools").hidden = mode() !== "draw";
  $("#gesture-fit").hidden = mode() !== "draw";
  $("#gesture-object-tools").hidden = mode() !== "objects";
  $("#gesture-guide-panel").hidden = ["objects", "effects", "tele"].includes(
    mode(),
  );
  $("#gesture-background").hidden = $("#gesture-detector").value !== "geometry";
  $("#gesture-start").textContent =
    mode() === "objects" ? "Əşya kamerasını aç" : "Əl kamerasını aç";
  for (const id of [
    "gesture-save",
    "gesture-clear",
    "gesture-undo",
    "gesture-redo",
  ])
    $(`#${id}`).hidden = mode() === "objects";
  $("#gesture-math").hidden = mode() !== "math";
  $("#gesture-shape").hidden = mode() !== "shape";
  render();
};
$("#gesture-detector").onchange = () => {
  stop();
  $("#gesture-background").hidden = $("#gesture-detector").value !== "geometry";
};
$("#gesture-background").onclick = () => {
  if (camera && !loading) {
    backgroundNext = true;
    status("Növbəti kadr boş fon kimi götürüləcək.");
  } else status("Əvvəl əşya kamerasını aç.");
};
for (const id of ["gesture-object", "gesture-scale", "gesture-color"])
  $(`#${id}`).addEventListener("input", render);
$("#gesture-reset").onclick = () => {
  rotation = { x: -0.35, y: 0.5 };
  render();
};
$("#gesture-save").onclick = () => {
  board.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "facegate-drawing.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
};
function solve() {
  try {
    $("#gesture-answer").textContent =
      `Nəticə: ${calculate($("#gesture-expression").value)}`;
  } catch (error) {
    $("#gesture-answer").textContent = error.message;
  }
}
$("#gesture-math-form").onsubmit = (event) => {
  event.preventDefault();
  solve();
};
$("#gesture-expression").oninput = () => {
  $("#gesture-answer").textContent = "Hesablamaq üçün Hesabla düyməsini bas.";
};
for (const key of [
  "7",
  "8",
  "9",
  "/",
  "C",
  "4",
  "5",
  "6",
  "*",
  "⌫",
  "1",
  "2",
  "3",
  "-",
  "(",
  "0",
  ".",
  "=",
  "+",
  ")",
]) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = key;
  button.onclick = () => {
    const input = $("#gesture-expression");
    if (key === "=") {
      solve();
      return;
    }
    input.value =
      key === "C"
        ? ""
        : key === "⌫"
          ? input.value.slice(0, -1)
          : (input.value + key).slice(0, 160);
    input.dispatchEvent(new Event("input"));
  };
  $("#gesture-keypad").append(button);
}
render();

const mainPreview = document.createElement("div");
mainPreview.className = "air-main-preview";
mainPreview.append($(".gesture-camera"));
const cameraLabel = document.createElement("p");
cameraLabel.textContent = "Canlı kamera · pinch ilə yaz, buraxanda xətti bitir";
mainPreview.prepend(cameraLabel);
$(".gesture-workspace").insertBefore(mainPreview, $("#gesture-drawing-tools"));
rebuildInk();

$("#finger-back").onclick = () => {
  $("#finger-text").value = $("#finger-text").value.slice(0, -1);
};
$("#finger-clear").onclick = () => {
  $("#finger-text").value = "";
  letterGate.reset();
};
$("#finger-copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#finger-text").value);
    status("Mətn kopyalandı.");
  } catch {
    status("Mətni seçib Ctrl+C ilə kopyala.");
  }
};

$(".gesture-workspace").insertBefore($("#finger-panel"), mainPreview);

$(".gesture-workspace").insertBefore($("#effects-panel"), mainPreview);

$("#effect-theme").onchange = () => {
  $("#effect-color").value = {
    fire: "#ff702b",
    electric: "#68d9ff",
    neon: "#00bfff",
    magic: "#bd83ff",
    splash: "#22e890",
  }[$("#effect-theme").value];
};

$(".gesture-workspace").insertBefore($("#tele-panel"), mainPreview);
$("#tele-reset").onclick = async () => {
  await ensureTele();
  tele?.reset();
};
