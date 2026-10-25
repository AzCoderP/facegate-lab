import { SharedBoardUI } from "./board-ui.js";
const views = [...document.querySelectorAll("[data-shared-board]")].map(
  (canvas) =>
    new SharedBoardUI({
      canvas,
      api: async (path) => {
        const r = await fetch(
          "/api/shared-board" + path.slice("board".length),
          {
            headers: { "X-FaceGate-Lab": "local" },
            signal: AbortSignal.timeout(2000),
          },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.detail);
        return d;
      },
      status: canvas.parentElement.querySelector("[data-board-status]"),
    }),
);
window.addEventListener("facegate-view", (e) => {
  for (const view of views) {
    if (e.detail === "control") view.start();
    else view.stop();
  }
});
for (const name of ["pagehide", "facegate-lock"])
  window.addEventListener(name, () => views.forEach((v) => v.stop()));
