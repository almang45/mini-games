// The line drawings for Buku Mewarnai, all on a 400 × 400 page. A region is one shape a tap
// can fill; regions are painted in order, so later ones sit on top of earlier ones. `clip`
// keeps a region inside an earlier one (stripes inside a fish). `lines` are details drawn
// over everything that can't be filled. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const SIZE = 400;
  const n = (v) => Number(v.toFixed(1));

  // A puffy cloud whose bottom-left corner is (x, y); s scales the 112-wide base shape.
  function cloud(x, y, s) {
    const p = (dx, dy) => n(x + dx * s) + " " + n(y + dy * s);
    const r = (v) => n(v * s) + " " + n(v * s);
    return "M" + p(0, 0) + " A" + r(24) + " 0 0 1 " + p(8, -46) + " A" + r(32) + " 0 0 1 " + p(68, -58) +
      " A" + r(27) + " 0 0 1 " + p(112, -30) + " A" + r(22) + " 0 0 1 " + p(106, 0) + " Z";
  }

  // One band of a rainbow: the half ring between radius `inner` and `outer` around (cx, cy).
  function band(cx, cy, outer, inner) {
    return "M" + (cx - outer) + " " + cy + " A" + outer + " " + outer + " 0 0 1 " + (cx + outer) + " " + cy +
      " L" + (cx + inner) + " " + cy + " A" + inner + " " + inner + " 0 0 0 " + (cx - inner) + " " + cy + " Z";
  }

  // Petals around (cx, cy), each an ellipse pointing outwards.
  function petals(cx, cy, count, offset, rx, ry) {
    return Array.from({ length: count }, (_, k) => {
      const angle = (360 / count) * k;
      const rad = (angle * Math.PI) / 180;
      const x = n(cx + offset * Math.sin(rad));
      const y = n(cy - offset * Math.cos(rad));
      return { id: "petal" + (k + 1), tag: "ellipse", attrs: { cx: x, cy: y, rx, ry, transform: "rotate(" + angle + " " + x + " " + y + ")" } };
    });
  }

  const sky = { id: "bg", tag: "rect", attrs: { x: 0, y: 0, width: SIZE, height: SIZE } };
  const ground = (y, id) => ({ id: id || "ground", tag: "path", attrs: { d: "M0 " + y + " Q200 " + (y - 22) + " 400 " + y + " V400 H0 Z" } });

  const PICTURES = [
    {
      id: "fish",
      name: { id: "Ikan", en: "Fish" },
      regions: [
        sky,
        { id: "sand", tag: "path", attrs: { d: "M0 336 Q100 314 200 336 T400 336 V400 H0 Z" } },
        { id: "weed-left", tag: "path", attrs: { d: "M40 340 C20 290 60 270 40 220 C70 250 50 290 66 340 Z" } },
        { id: "weed-right", tag: "path", attrs: { d: "M340 340 C330 300 370 280 352 240 C382 270 360 300 368 340 Z" } },
        { id: "tail", tag: "path", attrs: { d: "M125 200 L58 145 Q72 200 58 255 Z" } },
        { id: "fin-top", tag: "path", attrs: { d: "M170 140 Q205 80 262 138 Z" } },
        { id: "fin-bottom", tag: "path", attrs: { d: "M196 262 Q222 306 252 258 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 210, cy: 200, rx: 105, ry: 70 } },
        { id: "stripe1", tag: "path", clip: "body", attrs: { d: "M168 120 Q150 200 168 280 L196 280 Q178 200 196 120 Z" } },
        { id: "stripe2", tag: "path", clip: "body", attrs: { d: "M226 120 Q208 200 226 280 L252 280 Q234 200 252 120 Z" } },
        { id: "eye", tag: "circle", attrs: { cx: 280, cy: 182, r: 17 } },
        { id: "pupil", tag: "circle", attrs: { cx: 285, cy: 182, r: 8 } },
        { id: "bubble1", tag: "circle", attrs: { cx: 336, cy: 128, r: 13 } },
        { id: "bubble2", tag: "circle", attrs: { cx: 356, cy: 86, r: 9 } },
        { id: "bubble3", tag: "circle", attrs: { cx: 330, cy: 54, r: 6 } },
      ],
      lines: ["M305 218 Q296 226 286 220"],
    },
    {
      id: "house",
      name: { id: "Rumah", en: "House" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 330, cy: 72, r: 36 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(54, 150, 1) } },
        ground(326),
        { id: "path", tag: "path", attrs: { d: "M178 400 L192 330 L224 330 L238 400 Z" } },
        { id: "trunk", tag: "rect", attrs: { x: 343, y: 245, width: 22, height: 80, rx: 4 } },
        { id: "leaves", tag: "circle", attrs: { cx: 354, cy: 222, r: 38 } },
        { id: "chimney", tag: "rect", attrs: { x: 248, y: 102, width: 28, height: 60 } },
        { id: "wall", tag: "rect", attrs: { x: 92, y: 190, width: 214, height: 140 } },
        { id: "roof", tag: "path", attrs: { d: "M72 196 L199 94 L326 196 Z" } },
        { id: "door", tag: "rect", attrs: { x: 177, y: 250, width: 46, height: 80, rx: 5 } },
        { id: "knob", tag: "circle", attrs: { cx: 214, cy: 292, r: 5 } },
        { id: "window-left", tag: "rect", attrs: { x: 112, y: 222, width: 46, height: 46 } },
        { id: "window-right", tag: "rect", attrs: { x: 242, y: 222, width: 46, height: 46 } },
      ],
      lines: ["M135 222 V268 M112 245 H158", "M265 222 V268 M242 245 H288"],
    },
    {
      id: "butterfly",
      name: { id: "Kupu-kupu", en: "Butterfly" },
      regions: [
        sky,
        ground(352),
        { id: "wing-top-left", tag: "path", attrs: { d: "M200 192 C150 92 60 70 70 150 C78 206 150 216 200 202 Z" } },
        { id: "wing-top-right", tag: "path", attrs: { d: "M200 192 C250 92 340 70 330 150 C322 206 250 216 200 202 Z" } },
        { id: "wing-low-left", tag: "path", attrs: { d: "M200 206 C150 210 90 240 110 300 C130 340 185 292 200 232 Z" } },
        { id: "wing-low-right", tag: "path", attrs: { d: "M200 206 C250 210 310 240 290 300 C270 340 215 292 200 232 Z" } },
        { id: "spot-top-left", tag: "circle", attrs: { cx: 122, cy: 150, r: 22 } },
        { id: "spot-top-right", tag: "circle", attrs: { cx: 278, cy: 150, r: 22 } },
        { id: "spot-low-left", tag: "circle", attrs: { cx: 146, cy: 272, r: 14 } },
        { id: "spot-low-right", tag: "circle", attrs: { cx: 254, cy: 272, r: 14 } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 228, rx: 14, ry: 62 } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 154, r: 17 } },
        { id: "tip-left", tag: "circle", attrs: { cx: 160, cy: 92, r: 7 } },
        { id: "tip-right", tag: "circle", attrs: { cx: 240, cy: 92, r: 7 } },
      ],
      lines: ["M193 139 Q180 104 165 96", "M207 139 Q220 104 235 96"],
    },
    {
      id: "flower",
      name: { id: "Bunga", en: "Flower" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 338, cy: 62, r: 32 } },
        { id: "stem", tag: "path", attrs: { d: "M195 300 Q188 240 197 180 L207 180 Q198 240 205 300 Z" } },
        { id: "leaf-left", tag: "path", attrs: { d: "M197 262 Q150 254 132 218 Q180 214 197 246 Z" } },
        { id: "leaf-right", tag: "path", attrs: { d: "M202 240 Q250 226 270 192 Q222 194 202 226 Z" } },
        { id: "pot", tag: "path", attrs: { d: "M142 300 L258 300 L244 386 L156 386 Z" } },
        { id: "rim", tag: "rect", attrs: { x: 128, y: 284, width: 144, height: 24, rx: 6 } },
      ].concat(petals(200, 138, 6, 48, 24, 40), [
        { id: "center", tag: "circle", attrs: { cx: 200, cy: 138, r: 28 } },
      ]),
      lines: [],
    },
    {
      id: "car",
      name: { id: "Mobil", en: "Car" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 62, cy: 70, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(232, 96, 0.9) } },
        { id: "road", tag: "rect", attrs: { x: 0, y: 300, width: 400, height: 100 } },
        { id: "line1", tag: "rect", attrs: { x: 30, y: 352, width: 56, height: 12, rx: 3 } },
        { id: "line2", tag: "rect", attrs: { x: 172, y: 352, width: 56, height: 12, rx: 3 } },
        { id: "line3", tag: "rect", attrs: { x: 314, y: 352, width: 56, height: 12, rx: 3 } },
        { id: "roof", tag: "path", attrs: { d: "M108 204 L146 140 L262 140 L302 204 Z" } },
        { id: "body", tag: "path", attrs: { d: "M46 286 L46 232 Q50 206 82 202 L326 202 Q356 206 358 236 L358 286 Z" } },
        { id: "window-front", tag: "path", attrs: { d: "M210 196 L210 152 L254 152 L282 196 Z" } },
        { id: "window-back", tag: "path", attrs: { d: "M128 196 L154 152 L200 152 L200 196 Z" } },
        { id: "light", tag: "circle", attrs: { cx: 344, cy: 236, r: 9 } },
        { id: "wheel-back", tag: "circle", attrs: { cx: 114, cy: 290, r: 34 } },
        { id: "wheel-front", tag: "circle", attrs: { cx: 290, cy: 290, r: 34 } },
        { id: "hub-back", tag: "circle", attrs: { cx: 114, cy: 290, r: 13 } },
        { id: "hub-front", tag: "circle", attrs: { cx: 290, cy: 290, r: 13 } },
      ],
      lines: ["M205 204 V270", "M222 228 H242"],
    },
    {
      id: "rainbow",
      name: { id: "Pelangi", en: "Rainbow" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 352, cy: 54, r: 28 } },
      ].concat(["band1", "band2", "band3", "band4", "band5", "band6", "band7"].map((id, i) => (
        { id, tag: "path", attrs: { d: band(200, 300, 190 - i * 20, 170 - i * 20) } }
      )), [
        ground(332),
        { id: "cloud-left", tag: "path", attrs: { d: cloud(-6, 330, 1.05) } },
        { id: "cloud-right", tag: "path", attrs: { d: cloud(286, 330, 1.05) } },
      ]),
      lines: [],
    },
    {
      id: "rocket",
      name: { id: "Roket", en: "Rocket" },
      regions: [
        sky,
        { id: "planet", tag: "circle", attrs: { cx: 322, cy: 92, r: 40 } },
        { id: "star1", tag: "circle", attrs: { cx: 66, cy: 70, r: 7 } },
        { id: "star2", tag: "circle", attrs: { cx: 104, cy: 182, r: 5 } },
        { id: "star3", tag: "circle", attrs: { cx: 330, cy: 250, r: 6 } },
        { id: "star4", tag: "circle", attrs: { cx: 56, cy: 300, r: 6 } },
        { id: "flame", tag: "path", attrs: { d: "M162 262 Q200 372 238 262 Z" } },
        { id: "flame-inner", tag: "path", attrs: { d: "M180 262 Q200 320 220 262 Z" } },
        { id: "fin-left", tag: "path", attrs: { d: "M152 196 L104 276 L152 262 Z" } },
        { id: "fin-right", tag: "path", attrs: { d: "M248 196 L296 276 L248 262 Z" } },
        { id: "body", tag: "path", attrs: { d: "M200 54 C242 96 252 160 252 266 L148 266 C148 160 158 96 200 54 Z" } },
        { id: "nose", tag: "path", clip: "body", attrs: { d: "M120 40 H280 V128 H120 Z" } },
        { id: "window", tag: "circle", attrs: { cx: 200, cy: 180, r: 25 } },
      ],
      lines: [],
    },
  ].map((picture) => Object.freeze(Object.assign({}, picture, {
    regions: Object.freeze(picture.regions.map((r) => Object.freeze(r))),
    lines: Object.freeze(picture.lines.slice()),
  })));
  const PICTURES_BY_ID = Object.fromEntries(PICTURES.map((p) => [p.id, p]));

  const api = { SIZE, PICTURES, PICTURES_BY_ID, cloud, band };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PICTURES = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
