import { SharedBoardUI } from "./board-ui.js";
const $ = (s) => document.querySelector(s);
let token = "",
  timer,
  epoch = 0;
const message = (s) => ($("#status").textContent = s);
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Secure-Control": "1",
      Authorization: "Bearer " + token,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.detail);
  return data;
}
const board = new SharedBoardUI({
  canvas: $("#shared-board"),
  api,
  editable: true,
  status: $("#board-status"),
  color: $("#draw-color"),
  width: $("#draw-width"),
  clear: $("#draw-clear"),
  undo: $("#draw-undo"),
});
async function leave() {
  const old = token;
  token = "";
  epoch++;
  clearTimeout(timer);
  board.setEnabled(false);
  board.stop();
  $("#remote").hidden = true;
  $("#pair").hidden = false;
  if (old)
    try {
      await fetch("/api/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Secure-Control": "1",
          Authorization: "Bearer " + old,
        },
        body: "{}",
        keepalive: true,
      });
    } catch {}
}
async function poll(id) {
  if (!token || id !== epoch) return;
  if (document.hidden) {
    timer = setTimeout(() => poll(id), 1000);
    return;
  }
  try {
    const state = await api("state");
    if (id !== epoch) return;
    const allowed = state.approved && state.permissions.drawing;
    board.setEnabled(allowed);
    $("#drawing-section").hidden = !allowed;
    $("#session-state").textContent =
      `${Math.ceil(state.expires_in / 60)} dəqiqə qalır · ${allowed ? "Yazı icazəsi var" : "Kompüterdə təsdiq gözlənilir"}`;
  } catch (e) {
    message(e.message);
    if (e.message === "SESSION_ENDED") {
      await leave();
      return;
    }
  }
  timer = setTimeout(() => poll(id), 1500);
}
$("#pair").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api("pair", {
      code: $("#code").value.trim(),
      name: $("#name").value.trim(),
    });
    token = r.token;
    $("#code").value = "";
    $("#pair").hidden = true;
    $("#remote").hidden = false;
    message("Kompüterdə yazı icazəsini təsdiqlə.");
    board.start();
    poll(++epoch);
  } catch (e) {
    message(e.message);
  }
};
$("#disconnect").onclick = async () => {
  await leave();
  message("Sessiya bitdi.");
};
window.addEventListener("pagehide", leave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) board.up();
});
