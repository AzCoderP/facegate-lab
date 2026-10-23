const $ = (s) => document.querySelector(s),
  video = $("#watch-video"),
  canvas = $("#watch-overlay"),
  ctx = canvas.getContext("2d"),
  capture = document.createElement("canvas");
let stream = null,
  controller = null,
  timer = null,
  generation = 0,
  session = "",
  line = [
    [0.5, 0.05],
    [0.5, 0.95],
  ],
  selecting = false,
  clicks = [],
  csrf = null,
  lastEvents = 0;
const status = (t) => {
  $("#watch-status").textContent = t;
};
async function api(path, method = "GET", body, signal) {
  const r = await fetch("/api/watch/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-FaceGate-Lab": "local",
      "X-CSRF-Token": csrf || "",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.detail || "Sorğu alınmadı");
  return data;
}
async function auth() {
  const a = await fetch("/api/auth/status").then((r) => r.json());
  if (!a.authenticated) throw Error("Yenidən daxil ol.");
  csrf = a.csrf;
}
function stop() {
  generation++;
  clearTimeout(timer);
  controller?.abort();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  $("#watch-start").disabled = false;
  $("#watch-stop").disabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  status("Kamera dayandırılıb.");
}
async function events() {
  const items = await api("events");
  const fragment = document.createDocumentFragment();
  for (const e of items) {
    const li = document.createElement("li");
    li.textContent = `${e.at} · ${e.class} · ${e.direction}${e.visible_count === undefined ? "" : ` · ${e.visible_count} nəfər · İlk: ${e.first_seen} · Son: ${e.last_seen}`} · Telegram: ${e.delivery}${e.attachment === "photo" ? " · Şəkilli" : ""}`;
    fragment.append(li);
  }
  $("#watch-events").replaceChildren(fragment);
}
function overlay(objects) {
  canvas.width = 480;
  canvas.height = 360;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#22e878";
  ctx.fillStyle = "#22e878";
  ctx.font = "13px sans-serif";
  for (const o of objects) {
    ctx.strokeRect(...o.bbox);
    ctx.fillText(
      `${o.class} ${o.score.toFixed(2)}`,
      o.bbox[0],
      Math.max(15, o.bbox[1] - 4),
    );
  }
  if ($("#watch-mode").value === "people") return;
  ctx.strokeStyle = "#ffd54a";
  ctx.beginPath();
  ctx.moveTo(line[0][0] * 480, line[0][1] * 360);
  ctx.lineTo(line[1][0] * 480, line[1][1] * 360);
  ctx.stroke();
  ctx.fillStyle = "#ffd54a";
  ctx.fillText("A | B", line[0][0] * 480 + 6, line[0][1] * 360 + 15);
}
async function tick(token) {
  if (!stream || token !== generation) return;
  const request = new AbortController();
  controller = request;
  const timeout = setTimeout(() => request.abort(), 60000);
  try {
    if (video.readyState < 2) {
      timer = setTimeout(() => tick(token), 100);
      return;
    }
    capture.width = 480;
    capture.height = 360;
    capture.getContext("2d").drawImage(video, 0, 0, 480, 360);
    const frameSession = session;
    const mode = $("#watch-mode").value;
    const data = await api(
      "frame",
      "POST",
      { image: capture.toDataURL("image/jpeg", 0.75), session, line, mode },
      request.signal,
    );
    if (token !== generation) return;
    if (frameSession !== session) {
      timer = setTimeout(() => tick(token), 0);
      return;
    }
    overlay(data.objects);
    status(
      mode === "people"
        ? `${data.visible_count} nəfər görünür · ${data.events.length} yeni hadisə · Bakı vaxtı: ${new Date().toLocaleTimeString("az-AZ", { timeZone: "Asia/Baku" })}`
        : `${data.objects.length} obyekt · ${data.events.length} yeni keçid`,
    );
    if (data.events.length || performance.now() - lastEvents > 3000) {
      lastEvents = performance.now();
      await events();
    }
    timer = setTimeout(() => tick(token), 250);
  } catch (e) {
    if (token === generation) {
      stop();
      status(`Analiz dayandı: ${e.message}. Modeli və serveri yoxla.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
$("#watch-start").onclick = async () => {
  if (stream || $("#watch-start").disabled) return;
  const token = ++generation;
  $("#watch-start").disabled = true;
  $("#watch-stop").disabled = false;
  try {
    await auth();
    const media = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
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
    media.getVideoTracks()[0].addEventListener("ended", () => {
      if (token === generation) stop();
    });
    tick(token);
  } catch (e) {
    if (token === generation) {
      stop();
      status(e.message);
    }
  }
};
$("#watch-stop").onclick = stop;
$("#watch-mode").onchange = () => {
  session = crypto.randomUUID();
  selecting = false;
  $("#watch-line").disabled = $("#watch-mode").value === "people";
  overlay([]);
  status("Rejim dəyişdi; yeni izləmə sessiyası başladı.");
};
$("#watch-line").onclick = () => {
  selecting = true;
  clicks = [];
  status("Xətt üçün kamerada iki nöqtə seç.");
};
canvas.style.pointerEvents = "auto";
canvas.addEventListener("click", (e) => {
  if (!selecting) return;
  const r = canvas.getBoundingClientRect();
  clicks.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
  if (clicks.length === 2) {
    if (
      Math.hypot(clicks[1][0] - clicks[0][0], clicks[1][1] - clicks[0][1]) < 0.1
    ) {
      clicks = [];
      status("Xətt çox qısadır. Yenidən seç.");
      return;
    }
    line = clicks;
    selecting = false;
    session = crypto.randomUUID();
    overlay([]);
    status("Yeni xətt seçildi; izləmə sıfırlandı.");
  }
});
async function settings() {
  await auth();
  const c = await api("settings");
  $("#watch-chat").value = c.chat_id;
  $("#watch-enabled").checked = c.enabled;
  $("#watch-photos").checked = c.send_photos;
  $("#watch-bot-status").textContent = c.configured
    ? "Token saxlanılıb. Test mesajı ilə bağlantını yoxla."
    : "Token hələ daxil edilməyib.";
  await events();
}
$("#watch-save").onclick = async () => {
  try {
    await auth();
    const c = await api("settings", "PUT", {
      token: $("#watch-token").value.trim(),
      chat_id: $("#watch-chat").value.trim(),
      enabled: $("#watch-enabled").checked,
      send_photos: $("#watch-photos").checked,
    });
    $("#watch-token").value = "";
    $("#watch-bot-status").textContent = c.configured
      ? "Ayarlar lokal şifrəli faylda saxlanıldı."
      : "Bot tokeni daxil et.";
  } catch (e) {
    $("#watch-bot-status").textContent = e.message;
  }
};
$("#watch-chats").onclick = async () => {
  try {
    await auth();
    const chats = await api("chats");
    $("#watch-chat-list").replaceChildren();
    for (const c of chats) {
      const li = document.createElement("li"),
        b = document.createElement("button");
      b.textContent = `${c.title}: ${c.id} — seç`;
      b.onclick = () => {
        $("#watch-chat").value = c.id;
      };
      li.append(b);
      $("#watch-chat-list").append(li);
    }
    $("#watch-bot-status").textContent = chats.length
      ? "Öz chatını seç və ayarları saxla."
      : "Öz botuna /start yaz, sonra yenidən yoxla.";
  } catch (e) {
    $("#watch-bot-status").textContent = e.message;
  }
};
$("#watch-test").onclick = async () => {
  try {
    await auth();
    const e = await api("test", "POST", {});
    $("#watch-bot-status").textContent =
      `Test: ${e.delivery}. Nəticə hadisələrdə görünür.`;
    setTimeout(() => events().catch(() => {}), 2000);
  } catch (e) {
    $("#watch-bot-status").textContent = e.message;
  }
};
window.addEventListener("facegate-view", (e) => {
  if (e.detail !== "watch") stop();
  else settings().catch((e) => status(e.message));
});
for (const e of ["facegate-lock", "pagehide", "facegate-face-camera"])
  window.addEventListener(e, stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});
