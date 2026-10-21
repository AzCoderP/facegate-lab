// Pure, browser-independent gesture and arithmetic logic.
export function classifyHand(points, wasPinched = false) {
  if (
    !Array.isArray(points) ||
    points.length !== 21 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return { name: "none", pinch: false };
  const distance = (a, b) =>
    Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
  const palm = Math.max(distance(0, 9), 0.02);
  const extended = [8, 12, 16, 20].map(
    (tip) => distance(tip, 0) > distance(tip - 2, 0) * 1.18,
  );
  const pinch = distance(4, 8) / palm < (wasPinched ? 0.48 : 0.33);
  const count = extended.filter(Boolean).length;
  const name = pinch
    ? "pinch"
    : count === 4
      ? "palm"
      : count === 0
        ? "fist"
        : extended[0] && extended[1] && count === 2
          ? "two"
          : extended[0] && count === 1
            ? "index"
            : "other";
  return { name, pinch };
}

// Recursive descent: no eval/Function, identifiers, property access or JS execution.
export function calculate(source) {
  if (typeof source !== "string" || source.length > 160)
    throw new Error("İfadə çox uzundur.");
  const text = source
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-")
    .replace(/\s/g, "");
  let i = 0;
  const finite = (value) => {
    if (!Number.isFinite(value) || Math.abs(value) > 1e100)
      throw new Error("Nəticə real və sonlu olmalıdır; sıfıra bölməni yoxla.");
    return value;
  };
  function atom() {
    if (text.startsWith("sqrt(", i)) {
      i += 5;
      const value = sum();
      if (text[i++] !== ")") throw new Error("Mötərizəni bağla.");
      return finite(Math.sqrt(value));
    }
    if (text[i] === "(") {
      i++;
      const value = sum();
      if (text[i++] !== ")") throw new Error("Mötərizəni bağla.");
      return value;
    }
    const match = text.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error("Ədəd və ya mötərizə gözlənilir.");
    i += match[0].length;
    return finite(Number(match[0]));
  }
  function power() {
    let value = atom();
    if (text[i] === "^") {
      i++;
      value = finite(value ** unary());
    }
    return value;
  }
  function unary() {
    if (text[i] === "+") {
      i++;
      return unary();
    }
    if (text[i] === "-") {
      i++;
      return -unary();
    }
    return power();
  }
  function product() {
    let value = unary();
    while (text[i] === "*" || text[i] === "/") {
      const op = text[i++],
        right = unary();
      value = finite(op === "*" ? value * right : value / right);
    }
    return value;
  }
  function sum() {
    let value = product();
    while (text[i] === "+" || text[i] === "-") {
      const op = text[i++],
        right = product();
      value = finite(op === "+" ? value + right : value - right);
    }
    return value;
  }
  const result = finite(sum());
  if (i !== text.length) throw new Error("İfadədə dəstəklənməyən simvol var.");
  return Object.is(result, -0) ? 0 : result;
}

export function geometry(kind) {
  if (kind === "sphere") {
    const vertices = [],
      edges = [];
    for (let row = 0; row <= 12; row++) {
      const phi = (Math.PI * row) / 12;
      for (let col = 0; col < 24; col++) {
        const theta = (Math.PI * 2 * col) / 24;
        vertices.push([
          Math.sin(phi) * Math.cos(theta),
          Math.cos(phi),
          Math.sin(phi) * Math.sin(theta),
        ]);
        const n = row * 24 + col;
        edges.push([n, row * 24 + ((col + 1) % 24)]);
        if (row) edges.push([n, n - 24]);
      }
    }
    return { vertices, edges };
  }
  if (kind === "pyramid")
    return {
      vertices: [
        [-1, 1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [-1, 1, 1],
        [0, -1, 0],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
      ],
    };
  return {
    vertices: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ],
  };
}
