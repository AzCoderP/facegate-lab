import { SharedBoardUI } from "./board-ui.js";
const $ = (s) => document.querySelector(s);
let token = "",
  timer,
  codeTimer;
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
  status: $("#board-status"),
});
async function refresh() {
  try {
    const state = await api("state");
    $("#phone").textContent = state.phone
      ? `${state.phone.name} · ${state.phone.approved ? "Yazı icazəsi var" : "Təsdiq gözləyir"}`
      : "Telefon gözlənilir.";
    $("#approve").disabled = !state.phone;
    $("#audit").replaceChildren(
      ...state.audit.map((e) => {
        const li = document.createElement("li");
        li.textContent = e.at + " · " + e.action;
        return li;
      }),
    );
  } catch (e) {
    message(e.message);
    if (e.message === "ADMIN_LOGIN_REQUIRED") {
      clearInterval(timer);
      board.stop();
      $("#login").hidden = false;
      $("#console").hidden = true;
      token = "";
    }
  }
}
$("#login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api("login", { key: $("#key").value });
    token = r.token;
    $("#key").value = "";
    $("#login").hidden = true;
    $("#console").hidden = false;
    message("Kod yarat, telefonu qoş və yazı icazəsini təsdiqlə.");
    await refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 2000);
    board.start();
  } catch (e) {
    message(e.message);
  }
};
$("#invite").onclick = async () => {
  try {
    const r = await api("invite", {});
    $("#pair-code").textContent = r.code;
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => ($("#pair-code").textContent = "—"), 120000);
    message("Kod 2 dəqiqə etibarlıdır.");
    await refresh();
  } catch (e) {
    message(e.message);
  }
};
$("#approve").onclick = async () => {
  try {
    await api("approve", { drawing: true });
    message("Telefon yalnız bu lövhədə yaza bilər.");
    await refresh();
  } catch (e) {
    message(e.message);
  }
};
$("#revoke").onclick = async () => {
  try {
    await api("revoke", {});
    $("#pair-code").textContent = "—";
    message("Sessiya və lövhə sıfırlandı.");
    await refresh();
  } catch (e) {
    message(e.message);
  }
};
window.addEventListener("pagehide", () => {
  clearInterval(timer);
  board.stop();
});
