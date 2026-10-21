// Background subtraction is geometry, not semantic object recognition.
export function silhouette(frame, background, width, height) {
  if (frame.length !== width * height * 4 || background.length !== frame.length)
    throw new Error("Frame dimensions differ");
  const size = width * height,
    mask = new Uint8Array(size),
    seen = new Uint8Array(size),
    queue = new Int32Array(size),
    objects = [];
  for (let i = 0; i < size; i++) {
    const j = i * 4;
    mask[i] =
      Math.max(
        Math.abs(frame[j] - background[j]),
        Math.abs(frame[j + 1] - background[j + 1]),
        Math.abs(frame[j + 2] - background[j + 2]),
      ) > 45
        ? 1
        : 0;
  }
  for (let start = 0; start < size; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0,
      tail = 1,
      count = 0,
      x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const index = queue[head++],
        x = index % width,
        y = Math.floor(index / width);
      count++;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      const adjacent = [];
      if (x > 0) adjacent.push(index - 1);
      if (x < width - 1) adjacent.push(index + 1);
      if (y > 0) adjacent.push(index - width);
      if (y < height - 1) adjacent.push(index + width);
      for (const n of adjacent)
        if (mask[n] && !seen[n]) {
          seen[n] = 1;
          queue[tail++] = n;
        }
    }
    if (count < Math.max(80, size * 0.003) || count > size * 0.7) continue;
    const xx = sxx / count - (sx / count) ** 2,
      yy = syy / count - (sy / count) ** 2,
      xy = sxy / count - (sx * sy) / count ** 2;
    const d = Math.hypot(xx - yy, 2 * xy),
      major = (xx + yy + d) / 2,
      minor = (xx + yy - d) / 2;
    const aspect = Math.sqrt(major / Math.max(minor, 0.1));
    const fill = count / ((x1 - x0 + 1) * (y1 - y0 + 1));
    const label =
      aspect > 5
        ? "Uzunsov siluet — əşya adı məlum deyil"
        : fill > 0.75
          ? "Düzbucaqlıya bənzər siluet"
          : aspect < 1.4 && fill > 0.55
            ? "Yumruya bənzər siluet"
            : "Qeyri-müntəzəm siluet";
    objects.push({
      bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
      label,
      area: count,
      aspect,
      fill,
    });
  }
  return objects.sort((a, b) => b.area - a.area).slice(0, 4);
}
