// The letters A–Z and numbers 0–9 for Jejak Huruf dan Angka, as strokes in the order and
// direction a kid is taught to write them. Each stroke is an SVG path on a 100 × 100 box
// (cap line y=10, baseline y=90) using only absolute M, L and C, so js/trace.js can follow it
// without a DOM. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const BOX = 100;
  const n = (v) => Number(v.toFixed(1));

  // Part of an ellipse as cubic Béziers, starting with a move to its first point. Angles are
  // in degrees with 0 pointing right and 90 pointing down, so going from a larger angle to a
  // smaller one runs counter-clockwise on screen, the way a C, an O or a 0 is written.
  function arcPath(cx, cy, rx, ry, from, to) {
    const point = (t) => [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
    const tangent = (t) => [-rx * Math.sin(t), ry * Math.cos(t)];
    const pieces = Math.max(1, Math.ceil(Math.abs(to - from) / 90));
    const step = ((to - from) / pieces) * (Math.PI / 180);
    const k = (4 / 3) * Math.tan(step / 4);
    let t = from * (Math.PI / 180);
    const start = point(t);
    let d = "M" + n(start[0]) + " " + n(start[1]);
    for (let i = 0; i < pieces; i++) {
      const p0 = point(t), d0 = tangent(t), p1 = point(t + step), d1 = tangent(t + step);
      d += " C" + n(p0[0] + k * d0[0]) + " " + n(p0[1] + k * d0[1]) + " " + n(p1[0] - k * d1[0]) + " " +
        n(p1[1] - k * d1[1]) + " " + n(p1[0]) + " " + n(p1[1]);
      t += step;
    }
    return d;
  }

  const O = arcPath(50, 50, 34, 40, -90, -450);

  const LETTERS = [
    { char: "A", strokes: ["M50 10 L18 90", "M50 10 L82 90", "M30 62 L70 62"] },
    { char: "B", strokes: ["M26 10 L26 90", "M26 10 L52 10 C78 10 78 49 52 49 L26 49", "M26 49 L56 49 C84 49 84 90 56 90 L26 90"] },
    { char: "C", strokes: [arcPath(56, 50, 32, 40, -40, -320)] },
    { char: "D", strokes: ["M26 10 L26 90", "M26 10 L44 10 C88 10 88 90 44 90 L26 90"] },
    { char: "E", strokes: ["M30 10 L30 90", "M30 10 L74 10", "M30 50 L66 50", "M30 90 L74 90"] },
    { char: "F", strokes: ["M30 10 L30 90", "M30 10 L74 10", "M30 50 L66 50"] },
    { char: "G", strokes: [arcPath(54, 50, 32, 40, -40, -360) + " L62 50"] },
    { char: "H", strokes: ["M24 10 L24 90", "M76 10 L76 90", "M24 50 L76 50"] },
    { char: "I", strokes: ["M50 10 L50 90", "M34 10 L66 10", "M34 90 L66 90"] },
    { char: "J", strokes: ["M66 10 L66 64 C66 96 24 96 24 68"] },
    { char: "K", strokes: ["M28 10 L28 90", "M74 10 L28 58", "M44 41 L76 90"] },
    { char: "L", strokes: ["M30 10 L30 90 L74 90"] },
    { char: "M", strokes: ["M20 10 L20 90", "M20 10 L50 62 L80 10 L80 90"] },
    { char: "N", strokes: ["M24 10 L24 90", "M24 10 L76 90 L76 10"] },
    { char: "O", strokes: [O] },
    { char: "P", strokes: ["M26 10 L26 90", "M26 10 L54 10 C82 10 82 52 54 52 L26 52"] },
    { char: "Q", strokes: [O, "M58 66 L84 94"] },
    { char: "R", strokes: ["M26 10 L26 90", "M26 10 L54 10 C82 10 82 52 54 52 L26 52", "M48 52 L78 90"] },
    { char: "S", strokes: ["M76 22 C68 8 26 6 25 30 C24 52 76 46 77 70 C78 95 30 96 22 78"] },
    { char: "T", strokes: ["M18 10 L82 10", "M50 10 L50 90"] },
    { char: "U", strokes: ["M24 10 L24 60 C24 98 76 98 76 60 L76 10"] },
    { char: "V", strokes: ["M18 10 L50 90 L82 10"] },
    { char: "W", strokes: ["M12 10 L30 90 L50 32 L70 90 L88 10"] },
    { char: "X", strokes: ["M22 10 L78 90", "M78 10 L22 90"] },
    { char: "Y", strokes: ["M20 10 L50 50", "M80 10 L50 50 L50 90"] },
    { char: "Z", strokes: ["M20 10 L80 10 L20 90 L80 90"] },
  ];

  // Counting order, so 0 comes after 9 the way it does on a phone keypad.
  const NUMBERS = [
    { char: "1", strokes: ["M32 26 L52 10 L52 90"] },
    { char: "2", strokes: ["M24 30 C24 4 76 4 76 32 C76 52 44 64 22 90 L80 90"] },
    { char: "3", strokes: ["M24 20 C38 4 76 6 74 30 C72 46 56 50 44 50 C60 50 78 54 78 70 C78 96 36 98 22 80"] },
    { char: "4", strokes: ["M58 10 L18 64 L84 64", "M64 34 L64 90"] },
    { char: "5", strokes: ["M72 10 L30 10 L27 46 C40 36 78 38 78 64 C78 96 34 96 22 80"] },
    { char: "6", strokes: ["M70 14 C58 6 24 8 24 52 C24 96 76 96 76 66 C76 40 30 40 25 62"] },
    { char: "7", strokes: ["M20 10 L80 10 L38 90"] },
    { char: "8", strokes: ["M50 10 C24 10 24 46 50 50 C80 54 80 90 50 90 C20 90 20 54 50 50 C76 46 76 10 50 10"] },
    { char: "9", strokes: [arcPath(50, 32, 24, 22, 0, -360) + " L74 90"] },
    { char: "0", strokes: [arcPath(50, 50, 28, 40, -90, -450)] },
  ];

  const GLYPHS_BY_CHAR = Object.fromEntries(LETTERS.concat(NUMBERS).map((g) => [g.char, g]));

  const api = { BOX, LETTERS, NUMBERS, GLYPHS_BY_CHAR, arcPath };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GLYPHS = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
