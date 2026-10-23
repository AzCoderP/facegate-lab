// Deterministic lightweight canvas effects; no frame storage or extra camera stream.
export function paintEffects(
  ctx,
  state,
  now,
  { theme = "fire", color = "#00bfff", intensity = 1 } = {},
) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  if (!state || now - state.at > 300) return;
  const themes = {
    fire: "#ff702b",
    electric: "#68d9ff",
    neon: color,
    magic: "#bd83ff",
    splash: color,
  };
  const tint = color || themes[theme],
    t = now / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = tint;
  ctx.fillStyle = tint;
  ctx.shadowColor = tint;
  ctx.shadowBlur = 16 * intensity;
  ctx.lineWidth = 2;
  const xy = (p) => [(1 - p.x) * w, p.y * h];
  for (const hand of state.hands) {
    const [x, y] = xy(hand.points[9]),
      [fx, fy] = xy(hand.points[8]);
    const scale = Math.max(
      12,
      Math.hypot(
        hand.points[0].x - hand.points[9].x,
        hand.points[0].y - hand.points[9].y,
      ) * w,
    );
    const pulse = 1 + Math.sin(t * 4) * 0.07,
      r = scale * 0.65 * pulse * intensity;
    ctx.globalAlpha = 0.65;
    if (hand.gesture === "two" || hand.gesture === "index") {
      const [bx, by] = xy(hand.points[6]);
      const dx = fx - bx,
        dy = fy - by,
        len = Math.hypot(dx, dy) || 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + (dx / len) * w * 0.35, fy + (dy / len) * w * 0.35);
      ctx.stroke();
    } else if (hand.gesture === "pinch") {
      const [tx, ty] = xy(hand.points[4]);
      orb((fx + tx) / 2, (fy + ty) / 2, r * 0.65);
    } else if (hand.gesture !== "none" && hand.gesture !== "other") {
      orb(x, y, r);
      const count = theme === "splash" ? 10 : 16;
      for (let i = 0; i < count; i++) {
        const angle =
          (i * Math.PI * 2) / count + t * (theme === "electric" ? 0.3 : 0.6);
        const length = r * (1.4 + 0.3 * Math.sin(t * 7 + i * 2));
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
        if (theme === "electric")
          ctx.lineTo(
            x + Math.cos(angle + 0.1) * length * 0.8,
            y + Math.sin(angle + 0.1) * length * 0.8,
          );
        if (theme === "splash") {
          ctx.arc(
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length,
            3 * intensity,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else {
          ctx.lineTo(
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length - (theme === "fire" ? r : 0),
          );
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = "12px Segoe UI";
    ctx.fillText(
      `${hand.side}: ${hand.gesture}`,
      Math.max(0, x - scale),
      Math.max(15, y + scale * 1.8),
    );
    ctx.shadowBlur = 16 * intensity;
  }
  if (state.hands.length === 2 && state.combo !== "none") {
    const [a, b] = state.hands.map((hand) => xy(hand.points[9]));
    const x = (a[0] + b[0]) / 2,
      y = (a[1] + b[1]) / 2,
      r = Math.max(25, Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.55);
    ctx.globalAlpha = 0.6;
    orb(x, y, r);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, t * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  function orb(x, y, r) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.22, tint);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, r), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint;
  }
}
