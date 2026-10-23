import { SelfLabel } from "./self-label.mjs";
const selfLabel = new SelfLabel();
let lastAutoCheck = -Infinity;
import { mergeTracks } from "./presence-core.mjs";
const $ = (s) => document.querySelector(s);
const video = $("#presence-video"),
  overlay = $("#presence-overlay"),
  ctx = overlay.getContext("2d");
const capture = document.createElement("canvas"),
  captureCtx = capture.getContext("2d");
const records = [],
  notificationState = { epoch: null, lastId: 0 };
let stream,
  timer,
  controller,
  starting = false,
  generation = 0,
  session = null,
  csrf = null;
let animation = 0,
  displayed = [],
  previous = new Map(),
  received = 0,
  lastRendered = 0;
const formatter = new Intl.DateTimeFormat("az-AZ", {
  timeZone: "Asia/Baku",
  dateStyle: "short",
  timeStyle: "medium",
});
const time = (iso) => formatter.format(new Date(iso));
const status = (text) => {
  $("#presence-status").textContent = text;
};
function render() {
  const body = $("#presence-records"),
    fragment = document.createDocumentFragment();
  for (const record of [...records].reverse()) {
    const row = document.createElement("tr");
    for (const text of [
      `Person #${record.id}`,
      time(record.first),
      time(record.last),
      record.active ? "Ekranda görünür" : "Hazırda görünmür",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    fragment.append(row);
  }
  if (!records.length) {
    const row = document.createElement("tr"),
      cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Hələ müşahidə yoxdur.";
    row.append(cell);
    fragment.append(row);
  }
  body.replaceChildren(fragment);
}
function draw() {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.strokeStyle = "#22e878";
  ctx.fillStyle = "#22e878";
  ctx.lineWidth = 2;
  ctx.font = "14px sans-serif";
  const alpha = Math.min(1, (performance.now() - received) / 100);
  for (const track of displayed) {
    const old = previous.get(track.id) || track.box;
    const box = track.box.map((v, i) => old[i] + (v - old[i]) * alpha);
    const [x, y, w, h] = box.map(
      (v, i) => v * (i % 2 ? overlay.height : overlay.width),
    );
    ctx.strokeRect(x, y, w, h);
    ctx.fillText(
      selfLabel.label(displayed, track.id, performance.now()) ||
        `Person #${track.id}`,
      x,
      Math.max(16, y - 6),
    );
  }
  if (stream) animation = requestAnimationFrame(draw);
}
function stop(
  message = "Kamera dayandırılıb. Qeydləri CSV kimi endirə bilərsən.",
) {
  $("#self-result").textContent = "Yoxlama dayandırılıb.";
  selfLabel.clear();
  lastAutoCheck = -Infinity;
  const oldSession = session;
  session = null;
  generation++;
  starting = false;
  clearTimeout(timer);
  controller?.abort();
  cancelAnimationFrame(animation);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  displayed = [];
  previous.clear();
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  records.forEach((r) => {
    r.active = false;
  });
  render();
  $("#presence-count").textContent = "0";
  $("#presence-speed").textContent = "Analiz dayandırılıb";
  $("#presence-start").disabled = false;
  $("#presence-stop").disabled = true;
  status(message);
  if (oldSession && csrf)
    fetch("/api/presence/stop", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FaceGate-Lab": "local",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ tracking_session: oldSession }),
      keepalive: true,
    }).catch(() => {});
}
async function tick(token) {
  if (!stream || token !== generation) return;
  const began = performance.now(),
    request = new AbortController();
  controller = request;
  const timeout = setTimeout(() => request.abort(), 8000);
  try {
    if (!video.videoWidth || video.readyState < 2) {
      timer = setTimeout(() => tick(token), 100);
      return;
    }
    const scale = Math.min(1, 640 / video.videoWidth, 480 / video.videoHeight);
    capture.width = Math.round(video.videoWidth * scale);
    capture.height = Math.round(video.videoHeight * scale);
    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
    const response = await fetch("/api/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FaceGate-Lab": "local",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        image: capture.toDataURL("image/jpeg", 0.7),
        tracking_session: session,
      }),
      signal: request.signal,
    });
    if (token !== generation) return;
    if (response.status === 429) {
      displayed = [];
      $("#presence-count").textContent = "—";
      status("Analiz limiti dolub. Qısa fasilədən sonra yenidən yoxlanır.");
      timer = setTimeout(
        () => tick(token),
        Math.max(
          1000,
          Number(response.headers.get("Retry-After") || "5") * 1000,
        ),
      );
      return;
    }
    if (!response.ok)
      throw Error(
        response.status === 401 || response.status === 403
          ? "Sessiya bitib. Əsas paneldən yenidən daxil ol."
          : "Analiz alınmadı. Serveri və YuNet modelini yoxla.",
      );
    const result = await response.json();
    if (token !== generation) return;
    if (
      !$("#self-auto").checked ||
      !$("#self-consent").checked ||
      result.tracks.length !== 1
    )
      selfLabel.clear();
    else if (performance.now() - lastAutoCheck >= 2100) {
      lastAutoCheck = performance.now();
      const selectedId = $("#self-id").value;
      const verification = await fetch("/api/self-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-FaceGate-Lab": "local",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          user_id: selectedId,
          consent: true,
          image: capture.toDataURL("image/jpeg", 0.8),
        }),
        signal: request.signal,
      });
      const check = await verification.json();
      if (token !== generation) return;
      if (
        $("#self-id").value !== selectedId ||
        !$("#self-auto").checked ||
        !$("#self-consent").checked
      ) {
        selfLabel.clear();
      } else {
        selfLabel.accept(
          verification.ok ? check : { verified: false },
          result.tracks,
          performance.now(),
        );
        $("#self-result").textContent = verification.ok
          ? check.verified
            ? `${check.name.toUpperCase()} — profil uyğun gəldi`
            : "Üz seçilmiş profilə uyğun gəlmədi və ya görüntü kifayət etmir."
          : check.detail === "USER_NOT_FOUND"
            ? "RAHIL01 qeydiyyatda yoxdur. Əvvəl üç nümunə ilə qeydiyyatı tamamla."
            : "Profil yoxlaması alınmadı.";
      }
    }

    if (notificationState.epoch !== result.tracking_epoch) {
      displayed = [];
      previous.clear();
    }
    const fresh = mergeTracks(records, result, notificationState);
    if (fresh.length || performance.now() - lastRendered > 500) {
      render();
      lastRendered = performance.now();
    }
    if (fresh.length) {
      const notification = $("#presence-notification");
      notification.textContent = `Yeni üz: ${fresh.map((t) => `Person #${t.id}`).join(", ")} — ${time(result.at)}`;
      notification.classList.add("has-arrival");
    }
    previous = new Map(displayed.map((t) => [t.id, t.box]));
    displayed = result.tracks;
    received = performance.now();
    if (overlay.width !== capture.width || overlay.height !== capture.height) {
      overlay.width = capture.width;
      overlay.height = capture.height;
    }
    $("#presence-count").textContent = String(result.count);
    const elapsed = performance.now() - began;
    $("#presence-speed").textContent =
      `${(1000 / Math.max(167, elapsed)).toFixed(1)} analiz/s · ${result.elapsed_ms} ms emal`;
    status(`Canlı analiz aktivdir. Son kadr: ${time(result.at)}.`);
    // One frame in flight: never queue camera frames behind a slow inference.
    timer = setTimeout(() => tick(token), Math.max(0, 167 - elapsed));
  } catch (error) {
    if (token === generation)
      stop(
        error.name === "AbortError"
          ? "Server vaxtında cavab vermədi. Yenidən başlat."
          : error.message,
      );
  } finally {
    clearTimeout(timeout);
  }
}
$("#presence-start").onclick = async () => {
  if (stream || starting || $("#app-shell").inert) return;
  starting = true;
  const token = ++generation;
  $("#presence-start").disabled = true;
  $("#presence-stop").disabled = false;
  const request = new AbortController();
  controller = request;
  const timeout = setTimeout(() => request.abort(), 8000);
  try {
    const response = await fetch("/api/auth/status", {
      signal: request.signal,
    });
    const auth = await response.json();
    if (token !== generation) return;
    if (!auth.authenticated)
      throw Error("Sessiya bitib. Əsas paneldən yenidən daxil ol.");
    csrf = auth.csrf;
    clearTimeout(timeout);
    status("Kamera icazəsi gözlənilir. Brauzerin kamera sorğusunu təsdiqlə.");
    const media = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    if (token !== generation) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    video.srcObject = media;
    await video.play();
    if (token !== generation) return;
    session = crypto.randomUUID();
    records.length = 0;
    notificationState.epoch = null;
    notificationState.lastId = 0;
    render();
    $("#presence-notification").textContent =
      "Yeni üz görünəndə burada bildiriş göstəriləcək.";
    $("#presence-notification").classList.remove("has-arrival");
    starting = false;
    draw();
    tick(token);
    media.getVideoTracks()[0].addEventListener("ended", () => {
      if (token === generation)
        stop("Kamera bağlantısı kəsildi. Yenidən başlat.");
    });
  } catch (error) {
    if (token === generation)
      stop(
        error.name === "Error"
          ? error.message
          : "Kamera açılmadı. Kamera icazəsini və digər kamera tətbiqlərini yoxla.",
      );
  } finally {
    clearTimeout(timeout);
  }
};
$("#presence-stop").onclick = () => stop();
$("#presence-export").onclick = () => {
  const rows = [
    ["Anonim nömrə", "İlk görünmə (Bakı)", "Son görünmə (Bakı)", "Vəziyyət"],
    ...records.map((r) => [
      `Person #${r.id}`,
      time(r.first),
      time(r.last),
      r.active ? "Ekranda" : "Görünmür",
    ]),
  ];
  const csv =
    "\ufeff" +
    rows
      .map((row) =>
        row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "anonim-musahide.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener("facegate-view", (e) => {
  if (e.detail !== "presence") stop();
});
window.addEventListener("facegate-lock", () => {
  stop();
  csrf = null;
  records.length = 0;
  notificationState.epoch = null;
  notificationState.lastId = 0;
  render();
});
window.addEventListener("pagehide", () => stop());
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});

$("#self-enroll").onclick = () => {
  stop();
  document.querySelector('[data-view="camera"]').click();
  document.querySelector("#tab-enroll").click();
  const form = document.querySelector("#enroll-form");
  form.elements.id.value = $("#self-id").value;
  form.elements.name.value = "Rahil";
  form.dispatchEvent(new Event("input", { bubbles: true }));
};
$("#self-check").onclick = async () => {
  const result = $("#self-result");
  if (!$("#self-consent").checked) {
    result.textContent = "Öz profilin üçün razılıq seçimini işarələ.";
    return;
  }
  if (!stream || video.readyState < 2) {
    result.textContent = "Əvvəl kameranı başlat.";
    return;
  }
  const checkGeneration = generation;
  const button = $("#self-check");
  button.disabled = true;
  try {
    const response = await fetch("/api/self-check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-FaceGate-Lab": "local",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        user_id: $("#self-id").value,
        consent: true,
        image: capture.toDataURL("image/jpeg", 0.8),
      }),
    });
    const data = await response.json();
    if (checkGeneration !== generation) return;
    result.textContent = response.ok
      ? data.verified
        ? `${data.name} — seçilmiş profil təsdiqləndi`
        : `Uyğunluq təsdiqlənmədi: ${data.reason}`
      : data.detail === "USER_NOT_FOUND"
        ? "Bu ID qeydiyyatda yoxdur. Rahil qeydiyyatını hazırla düyməsini seç."
        : "Yoxlama alınmadı. Sessiyanı və profil ID-ni yoxla.";
  } catch {
    result.textContent = "Serverlə əlaqə alınmadı.";
  } finally {
    button.disabled = false;
  }
};

for (const id of ["self-id", "self-consent", "self-auto"])
  $("#" + id).addEventListener("input", () => {
    selfLabel.clear();
    lastAutoCheck = -Infinity;
  });
