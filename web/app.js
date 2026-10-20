"use strict";
const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 50;
const messages = {
  GRANTED: "Girişə icazə verildi",
  FACE_MISMATCH: "Üz ID ilə uyğun gəlmir",
  USER_NOT_FOUND: "İstifadəçi tapılmadı",
  USER_DISABLED: "Hesab deaktivdir",
  DOOR_NOT_ALLOWED: "Bu girişə icazə yoxdur",
  OUTSIDE_SCHEDULE: "İcazə saatlarından kənardır",
  FACE_NOT_DETECTED: "Üz tapılmadı. Kameraya tərəf bax.",
  MULTIPLE_FACES: "Kadrda yalnız bir nəfər olmalıdır",
  FACE_TOO_SMALL: "Kameraya yaxınlaş",
  IMAGE_BLURRY: "Görüntü bulanıqdır. İşığı və fokusu yoxla.",
  MODELS_MISSING: "Üz modelləri yüklənməyib",
  MODEL_LOAD_FAILED: "Model açıla bilmədi",
  INVALID_IMAGE: "Görüntü oxunmadı",
  IMAGE_DIMENSIONS: "Görüntünün ölçüsü uyğun deyil",
  INVALID_FEATURE: "Üz xüsusiyyətləri etibarsızdır",
  VISION_ERROR: "Üzün emalında xəta yarandı",
  USER_EXISTS: "Bu ID artıq qeydiyyatdadır",
  ENROLLMENT_INCONSISTENT: "Üç nümunə bir-biri ilə uyğun gəlmir. Yenidən çək.",
  DUPLICATE_SAMPLES: "Üç ayrı kadr çəkməlisən",
  DATABASE_UNAVAILABLE: "Baza əlçatan deyil. Əməliyyat təsdiqlənmədi.",
  TEMPLATE_UNAVAILABLE: "Şifrəli üz nümunəsi oxunmadı",
  CONFIG_INVALID: "Saxlanmış uyğunluq həddi etibarsızdır. Parametrləri yoxla.",
  EVENT_ID_CONFLICT: "Hadisə ID-si başqa sorğuda istifadə olunub",
  AUTH_REQUIRED: "Sessiya bitib. Yenidən daxil ol.",
  LOGIN_FAILED: "Administrator açarı düzgün deyil",
  CSRF_INVALID: "Sessiya yoxlaması alınmadı. Yenidən daxil ol.",
  RATE_LIMITED: "Sorğu limiti keçilib. Bir dəqiqə sonra yenidən yoxla.",
  SYSTEM_BUSY: "Sistem məşğuldur. Bir az sonra yoxla.",
  VALIDATION_ERROR:
    "Məlumat formatını yoxla. ID və giriş adı yalnız hərf, rəqəm, _ və - qəbul edir.",
  REQUEST_TOO_LARGE: "Göndərilən məlumat çox böyükdür",
  IMAGE_TOO_LARGE: "Görüntü çox böyükdür",
};
let csrf = null,
  authenticated = false,
  stream = null,
  samples = [],
  users = [],
  events = [],
  busy = false;
let userOffset = 0,
  eventOffset = 0,
  search = "",
  eventFilter = {},
  generation = 0,
  pendingAttempt = null,
  pendingTimer;
let userHasNext = false,
  eventHasNext = false,
  attemptSequence = 0;
const baku = (iso) =>
  new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(iso));
const clock = (iso) =>
  new Intl.DateTimeFormat("az-AZ", {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
function notice(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").classList.toggle("error", error);
}
function resetResult(
  title = "Gözləyir…",
  detail = "Üzünü kameraya yönəlt və doğrulamanı başlat.",
  kind = "neutral",
  code = "READY",
) {
  const box = $("#result");
  box.className = `result ${kind}`;
  box.querySelector("strong").textContent = title;
  box.querySelector("p").textContent = detail;
  $("#result-code").textContent = code;
}
function lockPanel(message = "") {
  authenticated = false;
  csrf = null;
  generation++;
  stopCamera();
  clearPending();
  users = [];
  events = [];
  $("#users").replaceChildren();
  $("#events").replaceChildren();
  $("#audit").replaceChildren();
  $("#recent-events").replaceChildren();
  for (const id of [
    "health",
    "models",
    "threshold",
    "stat-users",
    "stat-active",
    "stat-events",
    "stat-decisions",
    "last-sync",
  ])
    $(`#${id}`).textContent = "—";
  $("#auth-gate").hidden = false;
  $("#app-shell").inert = true;
  $("#login-error").textContent = message;
  $("#admin-key").value = "";
  $("#edit-dialog").close();
  resetResult();
}
async function api(path, method = "GET", body) {
  const abort = new AbortController(),
    timer = setTimeout(() => abort.abort(), 30000);
  try {
    const response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      signal: abort.signal,
      headers: {
        "Content-Type": "application/json",
        "X-FaceGate-Lab": "local",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Server cavabı oxunmadı. Nəticə təsdiqlənməyib.");
    }
    if (!response.ok) {
      const code =
        typeof data.detail === "string" ? data.detail : "VALIDATION_ERROR";
      if (code === "AUTH_REQUIRED" || code === "CSRF_INVALID")
        lockPanel(messages[code]);
      const error = new Error(
        messages[code] || `Sorğu alınmadı (${response.status})`,
      );
      error.code = code;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("Server vaxtında cavab vermədi. Nəticə təsdiqlənməyib.");
    if (error instanceof TypeError)
      throw new Error("Serverlə əlaqə kəsildi. Proses və portu yoxla.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function cell(row, text) {
  const td = document.createElement("td");
  td.textContent = text;
  row.append(td);
  return td;
}
function empty(target, cols, text) {
  const tr = document.createElement("tr"),
    td = cell(tr, text);
  td.colSpan = cols;
  td.className = "empty";
  target.replaceChildren(tr);
}
function view(name) {
  const selected = name === "camera" ? "dashboard" : name;
  document
    .querySelectorAll(".view")
    .forEach((p) => (p.hidden = p.id !== `view-${selected}`));
  document.querySelectorAll(".nav-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
    if (b.dataset.view === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  if (name === "camera") $("#terminal").scrollIntoView({ block: "start" });
}
document
  .querySelectorAll("[data-view]")
  .forEach((button) => (button.onclick = () => view(button.dataset.view)));
function setSystem(ok, modelsAvailable = false) {
  $("#sidebar-dot").classList.toggle("on", ok);
  $("#sidebar-status").textContent = ok ? "Sistemə əlaqə var" : "Əlaqə xətası";
  $("#sidebar-detail").textContent = ok
    ? modelsAvailable
      ? "Modellər mövcuddur"
      : "Modellər yüklənməyib"
    : "Serveri yoxla";
  $("#system-badge").textContent = ok
    ? modelsAvailable
      ? "Aktiv"
      : "Natamam"
    : "Əlaqə yoxdur";
  $("#system-badge").className =
    `badge ${ok && modelsAvailable ? "ok" : "warn"}`;
}
async function refresh(silent = false) {
  if (!authenticated) return;
  const current = ++generation;
  const userQuery = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String(userOffset),
    q: search,
  });
  const eventQuery = new URLSearchParams({
    limit: String(PAGE_SIZE + 1),
    offset: String(eventOffset),
    ...eventFilter,
  });
  try {
    const [health, list, records, recent, stats, audit] = await Promise.all([
      api("/health"),
      api(`/users?${userQuery}`),
      api(`/events?${eventQuery}`),
      api("/events?limit=5"),
      api("/stats"),
      api("/audit"),
    ]);
    if (current !== generation || !authenticated) return;
    $("#health").textContent = "Əlaqə var";
    $("#health").className = "healthy";
    $("#models").textContent =
      health.models === "available" ? "Fayllar mövcuddur" : "Yüklənməyib";
    $("#threshold").textContent = health.threshold;
    setSystem(true, health.models === "available");
    $("#stat-users").textContent = stats.users;
    $("#stat-active").textContent = stats.active_users;
    $("#stat-events").textContent = stats.events;
    $("#stat-decisions").textContent = `${stats.granted} / ${stats.denied}`;
    $("#last-sync").textContent = clock(health.server_time);
    if (document.activeElement !== $("#settings-form").elements.threshold)
      $("#settings-form").elements.threshold.value = health.threshold;
    users = list.slice(0, PAGE_SIZE);
    events = records.slice(0, PAGE_SIZE);
    renderUsers(stats.users);
    renderEvents();
    renderRecent(recent);
    renderAudit(audit);
    userHasNext = list.length > PAGE_SIZE;
    eventHasNext = records.length > PAGE_SIZE;
    $("#users-prev").disabled = busy || userOffset === 0;
    $("#users-next").disabled = busy || !userHasNext;
    $("#events-prev").disabled = busy || eventOffset === 0;
    $("#events-next").disabled = busy || !eventHasNext;
    $("#users-page").textContent =
      `${Math.floor(userOffset / PAGE_SIZE) + 1}-ci səhifə`;
    $("#events-page").textContent =
      `${Math.floor(eventOffset / PAGE_SIZE) + 1}-ci səhifə`;
    if (!silent) notice("Məlumatlar yeniləndi.");
  } catch (error) {
    if (current !== generation) return;
    setSystem(false);
    $("#health").textContent = "Əlaqə xətası";
    $("#health").className = "";
    notice(error.message, true);
  }
}
function renderUsers(total) {
  const target = $("#users");
  target.replaceChildren();
  $("#user-count").textContent = search
    ? `“${search}” üzrə axtarış`
    : `Cəmi ${total} istifadəçi`;
  if (!users.length)
    return empty(
      target,
      5,
      search
        ? "Axtarışa uyğun istifadəçi tapılmadı."
        : "İlk istifadəçini kamera ilə qeydiyyata al.",
    );
  for (const user of users) {
    const row = document.createElement("tr"),
      identity = cell(row, user.name),
      small = document.createElement("small");
    small.textContent = user.id;
    identity.append(small);
    cell(row, user.door);
    cell(
      row,
      user.start_time === user.end_time
        ? "Bütün gün"
        : `${user.start_time} – ${user.end_time}`,
    );
    const state = cell(row, user.active ? "Aktiv" : "Deaktiv");
    state.className = user.active ? "tag-granted" : "tag-denied";
    const actions = cell(row, "");
    const edit = document.createElement("button");
    edit.className = "quiet";
    edit.textContent = "İcazəni dəyiş";
    edit.onclick = () => {
      const form = $("#edit-form");
      for (const key of ["id", "door", "start_time", "end_time"])
        form.elements[key].value = user[key];
      form.elements.active.checked = !!user.active;
      $("#edit-dialog").showModal();
    };
    const remove = document.createElement("button");
    remove.className = "quiet danger-button";
    remove.textContent = "Sil";
    remove.onclick = () =>
      run(async () => {
        if (
          !confirm(
            `${user.id}: üz nümunələri və əlaqəli giriş hadisələri silinsin? Bunu tətbiqdən geri qaytarmaq mümkün deyil.`,
          )
        )
          return;
        await api(`/users/${encodeURIComponent(user.id)}`, "DELETE");
        notice("İstifadəçi və əlaqəli məlumatlar silindi.");
        await refresh(true);
      });
    actions.append(edit, remove);
    target.append(row);
  }
}
function renderEvents() {
  const target = $("#events");
  target.replaceChildren();
  if (!events.length)
    return empty(target, 6, "Bu filtr üzrə giriş cəhdi yoxdur.");
  for (const event of events) {
    const row = document.createElement("tr");
    cell(row, baku(event.timestamp));
    cell(row, `${event.user_id} / ${event.door}`);
    const decision = cell(
      row,
      event.decision === "GRANTED" ? "İcazə verildi" : "Rədd edildi",
    );
    decision.className =
      event.decision === "GRANTED" ? "tag-granted" : "tag-denied";
    const reason = cell(row, messages[event.reason] || event.reason),
      code = document.createElement("small");
    code.textContent = event.reason;
    reason.append(code);
    cell(row, event.score === null ? "—" : event.score.toFixed(3));
    cell(row, `${event.elapsed_ms.toFixed(0)} ms`);
    target.append(row);
  }
}
function renderRecent(records) {
  const target = $("#recent-events");
  target.replaceChildren();
  if (!records.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "Hələ giriş cəhdi yoxdur.";
    target.append(p);
    return;
  }
  for (const event of records) {
    const row = document.createElement("div");
    row.className = "recent-row";
    const time = document.createElement("time");
    time.dateTime = event.timestamp;
    time.textContent = clock(event.timestamp);
    const id = document.createElement("span");
    id.className = "recent-id";
    id.textContent = event.user_id;
    const decision = document.createElement("span");
    decision.className = `decision-pill ${event.decision === "GRANTED" ? "" : "denied"}`;
    decision.textContent = event.decision === "GRANTED" ? "İcazə" : "Rədd";
    decision.title = messages[event.reason] || event.reason;
    row.append(time, id, decision);
    target.append(row);
  }
}
function renderAudit(records) {
  const target = $("#audit");
  target.replaceChildren();
  if (!records.length) return empty(target, 3, "Əməliyyat qeydi yoxdur.");
  for (const entry of records) {
    const row = document.createElement("tr");
    cell(row, baku(entry.timestamp));
    cell(row, entry.action);
    cell(row, entry.subject);
    target.append(row);
  }
}
async function run(task) {
  if (busy) return;
  busy = true;
  const controls = [
    ...document.querySelectorAll("button:not(#camera-stop)"),
  ].map((button) => [button, button.disabled]);
  controls.forEach(([button]) => (button.disabled = true));
  try {
    await task();
  } catch (error) {
    notice(error.message, true);
  } finally {
    busy = false;
    controls.forEach(([button, disabled]) => {
      if (button.isConnected) button.disabled = disabled;
    });
    cameraStatus(!!stream);
    $("#users-prev").disabled = userOffset === 0;
    $("#events-prev").disabled = eventOffset === 0;
    $("#users-next").disabled = !userHasNext;
    $("#events-next").disabled = !eventHasNext;
  }
}
$("#login-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.target.querySelector("button");
  button.disabled = true;
  $("#login-error").textContent = "";
  try {
    const result = await api("/auth/login", "POST", {
      key: $("#admin-key").value,
    });
    csrf = result.csrf;
    authenticated = true;
    $("#admin-key").value = "";
    $("#auth-gate").hidden = true;
    $("#app-shell").inert = false;
    await refresh(true);
    notice("Administrator sessiyası açıldı.");
  } catch (error) {
    $("#login-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
$("#logout").onclick = () =>
  run(async () => {
    try {
      await api("/auth/logout", "POST", {});
      lockPanel("Sessiya bağlandı.");
    } catch (error) {
      lockPanel(
        "Panel kilidləndi. Server sessiyasının bağlanması təsdiqlənmədi.",
      );
      throw error;
    }
  });
function cameraStatus(open) {
  $("#camera-state").textContent = open ? "Kamera hazırdır" : "Kamera bağlıdır";
  $("#camera-dot").classList.toggle("on", open);
  $("#camera-stop").disabled = !open;
  $("#camera-start").disabled = open;
}
$("#camera-start").onclick = () =>
  run(async () => {
    if (stream) return;
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error("Kamera API-si yoxdur. Səhifəni localhost ünvanında aç.");
    let acquired;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (!authenticated) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      const video = $("#video");
      video.srcObject = stream;
      await video.play();
      video.style.display = "block";
      $("#camera-placeholder").hidden = true;
      $("#resolution").textContent =
        `${video.videoWidth} × ${video.videoHeight}`;
      cameraStatus(true);
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopCamera();
        notice("Kamera bağlantısı bağlandı.", true);
      });
      notice("Kamera hazırdır. Qeydiyyat və ya doğrulama seç.");
    } catch (error) {
      if (acquired) acquired.getTracks().forEach((track) => track.stop());
      stream = null;
      cameraStatus(false);
      throw new Error(
        `Kamera açılmadı (${error.name}). Windows və brauzer icazələrini yoxla.`,
      );
    }
  });
function stopCamera() {
  const previous = stream;
  stream = null;
  if (previous) previous.getTracks().forEach((track) => track.stop());
  $("#video").srcObject = null;
  $("#video").style.display = "none";
  $("#camera-placeholder").hidden = false;
  $("#resolution").textContent = "Görüntü gözlənilir";
  cameraStatus(false);
  clearSamples();
  clearPending();
  resetResult();
}
$("#camera-stop").onclick = stopCamera;
window.addEventListener("pagehide", stopCamera);
$("#fullscreen").onclick = () =>
  run(async () => {
    if (!document.fullscreenEnabled)
      throw new Error("Bu brauzerdə tam ekran dəstəklənmir.");
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $("#viewport").requestFullscreen();
  });
function snapshot() {
  const video = $("#video"),
    track = stream?.getVideoTracks()[0];
  if (!track || track.readyState !== "live" || !video.videoWidth)
    throw new Error("Əvvəl kameranı aç.");
  const canvas = document.createElement("canvas"),
    ratio = Math.min(1, 960 / video.videoWidth, 720 / video.videoHeight);
  canvas.width = Math.round(video.videoWidth * ratio);
  canvas.height = Math.round(video.videoHeight * ratio);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}
function clearSamples() {
  samples = [];
  $("#samples").textContent = "0 / 3";
  document
    .querySelectorAll(".sample-indicators i")
    .forEach((dot) => dot.classList.remove("filled"));
}
$("#clear-samples").onclick = clearSamples;
$("#capture").onclick = () =>
  run(async () => {
    if (!$("#consent").checked)
      throw new Error("Əvvəl razılıq xanasını işarələ.");
    if (samples.length === 3)
      throw new Error("Üç nümunə hazırdır. Qeydiyyatı tamamla və ya sıfırla.");
    const image = snapshot();
    if (samples.includes(image))
      throw new Error("Bu kadr artıq çəkilib. Azca hərəkət edib yenidən çək.");
    samples.push(image);
    $("#samples").textContent = `${samples.length} / 3`;
    document
      .querySelectorAll(".sample-indicators i")
      .forEach((dot, index) =>
        dot.classList.toggle("filled", index < samples.length),
      );
    notice("Nümunə yaddaşa alındı. Növbəti kadr üçün üzünü azca dəyiş.");
  });
$("#enroll-form").addEventListener("input", (event) => {
  if (["id", "name"].includes(event.target.name)) clearSamples();
});
$("#consent").onchange = () => {
  if (!$("#consent").checked) clearSamples();
};
$("#enroll-form").onsubmit = (event) => {
  event.preventDefault();
  const form = event.target;
  run(async () => {
    if (samples.length !== 3 || !$("#consent").checked)
      throw new Error("Razılığı təsdiqlə və üç nümunə çək.");
    const values = Object.fromEntries(new FormData(form));
    notice("Üç üz nümunəsi yoxlanılır…");
    await api("/users", "POST", {
      ...values,
      images: samples,
      active: true,
      consent: true,
    });
    clearSamples();
    $("#consent").checked = false;
    $("#verify-form").elements.user_id.value = values.id;
    notice("Qeydiyyat tamamlandı. Doğrulama bölməsində yoxla.");
    await refresh(true);
  });
};
function clearPending() {
  pendingAttempt = null;
  clearTimeout(pendingTimer);
  attemptSequence++;
}
$("#verify-form").addEventListener("input", () => {
  clearPending();
  resetResult();
});
$("#verify-form").onsubmit = (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  run(async () => {
    resetResult(
      "Yoxlanılır…",
      "Üz və giriş qaydaları yoxlanılır.",
      "neutral",
      "PROCESSING",
    );
    const sequence = attemptSequence;
    try {
      if (!pendingAttempt) {
        pendingAttempt = {
          ...values,
          event_id: crypto.randomUUID(),
          image: snapshot(),
        };
        pendingTimer = setTimeout(clearPending, 120000);
      }
      const result = await api("/verify", "POST", pendingAttempt);
      if (sequence !== attemptSequence || !authenticated) return;
      clearPending();
      resetResult(
        messages[result.reason] || result.reason,
        `${result.replayed ? "Əvvəlki sorğunun nəticəsi. " : ""}Oxşarlıq: ${result.score === null ? "—" : result.score.toFixed(3)} | ${result.elapsed_ms.toFixed(0)} ms`,
        result.decision === "GRANTED" ? "granted" : "denied",
        result.reason,
      );
      notice(
        result.replayed
          ? "Əvvəlki hadisə qaytarıldı; yeni giriş hadisəsi yaradılmadı."
          : "Giriş qərarı qeydə alındı. Fiziki qapı əməliyyatı yoxdur.",
      );
      await refresh(true);
    } catch (error) {
      if (sequence !== attemptSequence || !authenticated) return;
      if (error.code) clearPending();
      resetResult(
        "Nəticə təsdiqlənmədi",
        `${error.message}${pendingAttempt ? " Eyni cəhdi yenidən yoxlamaq üçün düyməni təkrar bas." : ""}`,
        "error",
        "NOT_CONFIRMED",
      );
      throw error;
    }
  });
};
$("#policy-form").onsubmit = (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.target));
  run(async () => {
    const result = await api("/policy-preview", "POST", {
      ...values,
      at: `${values.at}:00+04:00`,
    });
    $("#policy-result").textContent =
      `Simulyasiya: ${messages[result.reason] || result.reason}. Üz yoxlanılmayıb; giriş hadisəsi yoxdur.`;
    notice("Qayda sınağı tamamlandı.");
  });
};
$("#edit-form").onsubmit = (event) => {
  event.preventDefault();
  const form = event.target;
  run(async () => {
    await api(`/users/${encodeURIComponent(form.elements.id.value)}`, "PATCH", {
      active: form.elements.active.checked,
      door: form.elements.door.value,
      start_time: form.elements.start_time.value,
      end_time: form.elements.end_time.value,
    });
    $("#edit-dialog").close();
    notice("Giriş icazəsi yeniləndi.");
    await refresh(true);
  });
};
$("#edit-cancel").onclick = () => $("#edit-dialog").close();
$("#settings-form").onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    await api("/settings", "PUT", {
      threshold: Number(event.target.elements.threshold.value),
    });
    notice("Hədd saxlandı. Dəyişiklik idarəetmə jurnalına yazıldı.");
    await refresh(true);
  });
};
$("#search-form").onsubmit = (event) => {
  event.preventDefault();
  search = $("#global-search").value.trim();
  userOffset = 0;
  view("users");
  refresh();
};
$("#clear-search").onclick = () => {
  search = "";
  $("#global-search").value = "";
  userOffset = 0;
  refresh();
};
$("#event-filter").onsubmit = (event) => {
  event.preventDefault();
  eventFilter = Object.fromEntries(
    [...new FormData(event.target)].filter(([, value]) => value),
  );
  eventOffset = 0;
  refresh();
};
for (const [id, delta, type] of [
  ["users-prev", -PAGE_SIZE, "users"],
  ["users-next", PAGE_SIZE, "users"],
  ["events-prev", -PAGE_SIZE, "events"],
  ["events-next", PAGE_SIZE, "events"],
])
  $(`#${id}`).onclick = () => {
    if (type === "users") userOffset = Math.max(0, userOffset + delta);
    else eventOffset = Math.max(0, eventOffset + delta);
    refresh();
  };
$("#export-events").onclick = () => {
  const blob = new Blob([JSON.stringify(events, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "facegate-visible-events.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice(
    "Görünən qeydlər endirildi. Faylda şəxsi ID-lər ola bilər; açıq paylaşma.",
  );
};
function selectTab(button) {
  document.querySelectorAll("[role=tab]").forEach((tab) => {
    const active = tab === button;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document
    .querySelectorAll("[role=tabpanel]")
    .forEach(
      (panel) => (panel.hidden = panel.id !== `panel-${button.dataset.panel}`),
    );
}
document.querySelectorAll("[role=tab]").forEach((button) => {
  button.onclick = () => selectTab(button);
  button.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll("[role=tab]")],
      index = tabs.indexOf(button),
      next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
    selectTab(tabs[next]);
    tabs[next].focus();
  };
});
$("#new-user").onclick = () => {
  view("camera");
  selectTab($("#tab-enroll"));
  $("#enroll-form").elements.id.focus();
};
$("#policy-form").elements.at.value = new Date(Date.now() + 4 * 3600000)
  .toISOString()
  .slice(0, 16);
selectTab($("#tab-verify"));
$("#refresh").onclick = () => refresh();
async function initialize() {
  try {
    const status = await api("/auth/status");
    if (status.authenticated) {
      csrf = status.csrf;
      authenticated = true;
      $("#auth-gate").hidden = true;
      $("#app-shell").inert = false;
      await refresh();
    } else lockPanel();
  } catch (error) {
    lockPanel(error.message);
  }
}
initialize();
setInterval(() => {
  if (authenticated && !busy && !document.hidden) refresh(true);
}, 30000);
