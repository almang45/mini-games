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

  // A closed shape through one point per radius around (cx, cy), evenly spaced and starting
  // straight up: equal radii make a regular polygon, alternating ones a star.
  function around(cx, cy, radii) {
    const pts = radii.map((r, k) => {
      const a = (2 * Math.PI * k) / radii.length - Math.PI / 2;
      return n(cx + r * Math.cos(a)) + " " + n(cy + r * Math.sin(a));
    });
    return "M" + pts.join(" L") + " Z";
  }
  const star = (cx, cy, outer, inner) => around(cx, cy, [outer, inner, outer, inner, outer, inner, outer, inner, outer, inner]);
  const hexagon = (cx, cy, r) => around(cx, cy, [r, r, r, r, r, r]);

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
    {
      id: "dinosaur",
      name: { id: "Dinosaurus", en: "Dinosaur" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 64, cy: 64, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(132, 128, 0.8) } },
        ground(330),
        { id: "bush", tag: "path", attrs: { d: cloud(300, 334, 0.8) } },
        { id: "tail", tag: "path", attrs: { d: "M132 238 Q70 236 20 282 Q86 270 134 278 Z" } },
        { id: "leg1", tag: "rect", attrs: { x: 122, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg2", tag: "rect", attrs: { x: 164, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg3", tag: "rect", attrs: { x: 220, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg4", tag: "rect", attrs: { x: 262, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "neck", tag: "path", attrs: { d: "M246 222 C258 160 268 120 288 92 L320 104 C302 134 294 180 292 238 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 248, rx: 96, ry: 56 } },
        { id: "spot1", tag: "circle", clip: "body", attrs: { cx: 168, cy: 228, r: 16 } },
        { id: "spot2", tag: "circle", clip: "body", attrs: { cx: 216, cy: 214, r: 12 } },
        { id: "spot3", tag: "circle", clip: "body", attrs: { cx: 140, cy: 270, r: 11 } },
        { id: "head", tag: "ellipse", attrs: { cx: 314, cy: 92, rx: 36, ry: 25 } },
        { id: "eye", tag: "circle", attrs: { cx: 322, cy: 84, r: 7 } },
      ],
      lines: ["M330 104 Q339 110 346 101"],
    },
    {
      id: "cat",
      name: { id: "Kucing", en: "Cat" },
      regions: [
        sky,
        { id: "floor", tag: "rect", attrs: { x: 0, y: 300, width: 400, height: 100 } },
        { id: "rug", tag: "ellipse", attrs: { cx: 200, cy: 356, rx: 172, ry: 30 } },
        { id: "yarn", tag: "circle", attrs: { cx: 66, cy: 322, r: 32 } },
        { id: "tail", tag: "path", attrs: { d: "M262 320 C334 330 356 268 326 234 C316 224 302 234 308 246 C326 274 312 300 256 294 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 268, rx: 78, ry: 84 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 292, rx: 44, ry: 56 } },
        { id: "paw-left", tag: "ellipse", attrs: { cx: 170, cy: 346, rx: 25, ry: 14 } },
        { id: "paw-right", tag: "ellipse", attrs: { cx: 230, cy: 346, rx: 25, ry: 14 } },
        { id: "ear-left", tag: "path", attrs: { d: "M132 136 L136 54 L196 104 Z" } },
        { id: "ear-inner-left", tag: "path", attrs: { d: "M146 118 L146 74 L180 102 Z" } },
        { id: "ear-right", tag: "path", attrs: { d: "M268 136 L264 54 L204 104 Z" } },
        { id: "ear-inner-right", tag: "path", attrs: { d: "M254 118 L254 74 L220 102 Z" } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 152, r: 72 } },
        { id: "eye-left", tag: "ellipse", attrs: { cx: 172, cy: 142, rx: 13, ry: 16 } },
        { id: "eye-right", tag: "ellipse", attrs: { cx: 228, cy: 142, rx: 13, ry: 16 } },
        { id: "pupil-left", tag: "ellipse", attrs: { cx: 174, cy: 144, rx: 5, ry: 9 } },
        { id: "pupil-right", tag: "ellipse", attrs: { cx: 230, cy: 144, rx: 5, ry: 9 } },
        { id: "nose", tag: "path", attrs: { d: "M190 170 L210 170 L200 182 Z" } },
      ],
      lines: [
        "M200 182 Q200 194 188 196 M200 182 Q200 194 212 196",
        "M152 178 L110 172 M152 188 L110 194 M248 178 L290 172 M248 188 L290 194",
        "M42 306 Q66 326 92 304 M36 326 Q66 346 98 324 M54 294 Q78 324 64 352",
        "M98 330 Q124 350 140 340",
      ],
    },
    {
      id: "turtle",
      name: { id: "Kura-kura", en: "Turtle" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 66, cy: 64, r: 32 } },
        { id: "sea", tag: "path", attrs: { d: "M0 196 Q50 184 100 196 T200 196 T300 196 T400 196 V310 H0 Z" } },
        ground(300, "sand"),
        { id: "starfish", tag: "path", attrs: { d: star(340, 352, 26, 11) } },
        { id: "tail", tag: "path", attrs: { d: "M112 262 L72 280 L114 284 Z" } },
        { id: "leg-back", tag: "rect", attrs: { x: 118, y: 262, width: 36, height: 56, rx: 14 } },
        { id: "leg-front", tag: "rect", attrs: { x: 240, y: 262, width: 36, height: 56, rx: 14 } },
        { id: "head", tag: "ellipse", attrs: { cx: 310, cy: 236, rx: 40, ry: 30 } },
        { id: "shell", tag: "path", attrs: { d: "M96 282 C100 168 300 168 304 282 Z" } },
        { id: "plate-left", tag: "path", clip: "shell", attrs: { d: hexagon(140, 250, 30) } },
        { id: "plate-mid", tag: "path", attrs: { d: hexagon(200, 238, 32) } },
        { id: "plate-right", tag: "path", clip: "shell", attrs: { d: hexagon(260, 250, 30) } },
        { id: "rim", tag: "rect", attrs: { x: 86, y: 272, width: 228, height: 20, rx: 10 } },
        { id: "eye", tag: "circle", attrs: { cx: 322, cy: 226, r: 7 } },
      ],
      lines: ["M326 248 Q336 252 344 244", "M14 236 Q30 226 46 236 Q62 246 78 236", "M352 276 Q364 268 376 276 Q388 284 398 276"],
    },
    {
      id: "train",
      name: { id: "Kereta", en: "Train" },
      regions: [
        sky,
        { id: "smoke-big", tag: "circle", attrs: { cx: 270, cy: 62, r: 28 } },
        { id: "smoke-small", tag: "circle", attrs: { cx: 308, cy: 112, r: 20 } },
        { id: "ground", tag: "rect", attrs: { x: 0, y: 336, width: 400, height: 64 } },
        { id: "rail", tag: "rect", attrs: { x: 0, y: 328, width: 400, height: 10 } },
        { id: "wagon", tag: "rect", attrs: { x: 22, y: 196, width: 154, height: 100, rx: 8 } },
        { id: "window-left", tag: "rect", attrs: { x: 40, y: 214, width: 50, height: 40, rx: 6 } },
        { id: "window-right", tag: "rect", attrs: { x: 108, y: 214, width: 50, height: 40, rx: 6 } },
        { id: "chimney", tag: "path", attrs: { d: "M306 214 L298 140 L338 140 L330 214 Z" } },
        { id: "cab", tag: "rect", attrs: { x: 194, y: 170, width: 84, height: 126, rx: 4 } },
        { id: "roof", tag: "rect", attrs: { x: 184, y: 152, width: 104, height: 22, rx: 6 } },
        { id: "cab-window", tag: "rect", attrs: { x: 212, y: 190, width: 48, height: 42, rx: 6 } },
        { id: "boiler", tag: "rect", attrs: { x: 278, y: 210, width: 100, height: 86, rx: 12 } },
        { id: "lamp", tag: "circle", attrs: { cx: 362, cy: 240, r: 10 } },
        { id: "cowcatcher", tag: "path", attrs: { d: "M376 266 L398 314 L376 314 Z" } },
        { id: "wheel1", tag: "circle", attrs: { cx: 60, cy: 308, r: 22 } },
        { id: "wheel2", tag: "circle", attrs: { cx: 138, cy: 308, r: 22 } },
        { id: "wheel3", tag: "circle", attrs: { cx: 232, cy: 302, r: 28 } },
        { id: "wheel4", tag: "circle", attrs: { cx: 304, cy: 308, r: 22 } },
        { id: "wheel5", tag: "circle", attrs: { cx: 352, cy: 308, r: 22 } },
      ],
      lines: ["M176 288 H194", "M302 214 V296 M330 214 V296", "M232 302 L304 308 L352 308"],
    },
    {
      id: "sailboat",
      name: { id: "Perahu layar", en: "Sailboat" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 64, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(30, 120, 0.8) } },
        { id: "sea", tag: "path", attrs: { d: "M0 278 Q50 266 100 278 T200 278 T300 278 T400 278 V400 H0 Z" } },
        { id: "mast", tag: "rect", attrs: { x: 196, y: 40, width: 8, height: 236 } },
        { id: "flag", tag: "path", attrs: { d: "M204 42 L246 54 L204 66 Z" } },
        { id: "sail-main", tag: "path", attrs: { d: "M210 76 L210 256 L336 256 Z" } },
        { id: "sail-stripe", tag: "path", clip: "sail-main", attrs: { d: "M200 182 H350 V208 H200 Z" } },
        { id: "sail-front", tag: "path", attrs: { d: "M190 100 L190 256 L90 256 Z" } },
        { id: "hull", tag: "path", attrs: { d: "M76 266 L324 266 L292 330 L108 330 Z" } },
        { id: "hull-stripe", tag: "path", clip: "hull", attrs: { d: "M60 284 H340 V300 H60 Z" } },
        { id: "wave", tag: "path", attrs: { d: "M0 318 Q50 306 100 318 T200 318 T300 318 T400 318 V400 H0 Z" } },
      ],
      lines: ["M84 172 Q96 160 108 172 Q120 160 132 172", "M262 120 Q272 110 282 120 Q292 110 302 120"],
    },
    {
      id: "ice-cream",
      name: { id: "Es krim", en: "Ice cream" },
      regions: [
        sky,
        { id: "star-left", tag: "path", attrs: { d: star(72, 92, 32, 14) } },
        { id: "heart", tag: "path", attrs: { d: "M330 122 C288 92 298 54 330 74 C362 54 372 92 330 122 Z" } },
        { id: "star-low", tag: "path", attrs: { d: star(68, 304, 20, 9) } },
        { id: "star-right", tag: "path", attrs: { d: star(334, 300, 28, 12) } },
        { id: "cone", tag: "path", attrs: { d: "M136 232 L264 232 L200 382 Z" } },
        { id: "wafer", tag: "path", attrs: { d: "M220 150 L262 70 L276 78 L238 160 Z" } },
        { id: "scoop-bottom", tag: "path", attrs: { d: "M122 238 C104 150 296 150 278 238 Q262 256 246 238 Q230 256 214 238 Q198 256 182 238 Q166 256 150 238 Q136 252 122 238 Z" } },
        { id: "scoop-top", tag: "path", attrs: { d: "M150 186 C138 104 262 104 250 186 Q237 200 225 186 Q212 200 200 186 Q188 200 175 186 Q163 200 150 186 Z" } },
        { id: "cherry", tag: "circle", attrs: { cx: 200, cy: 112, r: 18 } },
      ],
      lines: [
        "M144 250 L234 302 M160 288 L218 340 M176 325 L202 377 M256 250 L166 302 M240 288 L182 340 M224 325 L198 377",
        "M202 94 Q206 70 226 60",
        "M172 150 L180 144 M224 158 L228 150 M184 170 L190 176 M212 168 L220 172",
        "M150 216 L158 210 M244 210 L250 216 M196 220 L204 216",
      ],
    },
    {
      id: "owl",
      name: { id: "Burung hantu", en: "Owl" },
      regions: [
        sky,
        { id: "moon", tag: "circle", attrs: { cx: 330, cy: 72, r: 36 } },
        { id: "star1", tag: "path", attrs: { d: star(64, 70, 18, 8) } },
        { id: "star2", tag: "path", attrs: { d: star(352, 196, 14, 6) } },
        { id: "branch", tag: "path", attrs: { d: "M0 318 C120 300 260 330 400 296 L400 324 C260 356 120 326 0 344 Z" } },
        { id: "leaf", tag: "path", attrs: { d: "M318 312 Q338 274 376 274 Q360 312 318 312 Z" } },
        { id: "tuft-left", tag: "path", attrs: { d: "M146 160 L122 74 L184 132 Z" } },
        { id: "tuft-right", tag: "path", attrs: { d: "M254 160 L278 74 L216 132 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 226, rx: 86, ry: 100 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 270, rx: 52, ry: 62 } },
        { id: "wing-left", tag: "path", attrs: { d: "M120 196 C86 240 98 300 148 320 C140 280 140 236 120 196 Z" } },
        { id: "wing-right", tag: "path", attrs: { d: "M280 196 C314 240 302 300 252 320 C260 280 260 236 280 196 Z" } },
        { id: "ring-left", tag: "circle", attrs: { cx: 168, cy: 176, r: 32 } },
        { id: "ring-right", tag: "circle", attrs: { cx: 232, cy: 176, r: 32 } },
        { id: "eye-left", tag: "circle", attrs: { cx: 168, cy: 176, r: 17 } },
        { id: "eye-right", tag: "circle", attrs: { cx: 232, cy: 176, r: 17 } },
        { id: "pupil-left", tag: "circle", attrs: { cx: 172, cy: 178, r: 8 } },
        { id: "pupil-right", tag: "circle", attrs: { cx: 228, cy: 178, r: 8 } },
        { id: "beak", tag: "path", attrs: { d: "M188 202 L212 202 L200 226 Z" } },
        { id: "foot-left", tag: "ellipse", attrs: { cx: 172, cy: 324, rx: 17, ry: 9 } },
        { id: "foot-right", tag: "ellipse", attrs: { cx: 228, cy: 324, rx: 17, ry: 9 } },
      ],
      lines: ["M180 254 Q187 262 194 254 M206 254 Q213 262 220 254 M193 280 Q200 288 207 280 M180 306 Q187 314 194 306 M206 306 Q213 314 220 306"],
    },
    {
      id: "planet",
      name: { id: "Planet", en: "Planet" },
      regions: [
        sky,
        { id: "star1", tag: "path", attrs: { d: star(336, 62, 20, 9) } },
        { id: "star2", tag: "path", attrs: { d: star(350, 330, 16, 7) } },
        { id: "star3", tag: "path", attrs: { d: star(206, 352, 13, 6) } },
        { id: "comet-tail", tag: "path", attrs: { d: "M24 20 L148 62 L132 88 Z" } },
        { id: "comet", tag: "circle", attrs: { cx: 146, cy: 78, r: 17 } },
        // The ring is split at the planet's middle: the far half behind it, the near half in front.
        { id: "ring-back", tag: "path", attrs: { d: "M90 214 A140 34 0 0 1 370 214 L330 214 A100 20 0 0 0 130 214 Z" } },
        { id: "planet", tag: "circle", attrs: { cx: 230, cy: 210, r: 80 } },
        { id: "stripe-top", tag: "path", clip: "planet", attrs: { d: "M140 166 Q230 146 320 166 V184 Q230 164 140 184 Z" } },
        { id: "stripe-low", tag: "path", clip: "planet", attrs: { d: "M140 252 Q230 272 320 252 V270 Q230 290 140 270 Z" } },
        { id: "ring-front", tag: "path", attrs: { d: "M90 214 A140 34 0 0 0 370 214 L330 214 A100 20 0 0 1 130 214 Z" } },
        { id: "moon", tag: "circle", attrs: { cx: 76, cy: 314, r: 46 } },
        { id: "crater1", tag: "circle", clip: "moon", attrs: { cx: 60, cy: 300, r: 12 } },
        { id: "crater2", tag: "circle", clip: "moon", attrs: { cx: 92, cy: 330, r: 9 } },
      ],
      lines: [],
    },
  ].map((picture) => Object.freeze(Object.assign({}, picture, {
    regions: Object.freeze(picture.regions.map((r) => Object.freeze(r))),
    lines: Object.freeze(picture.lines.slice()),
  })));
  const PICTURES_BY_ID = Object.fromEntries(PICTURES.map((p) => [p.id, p]));

  const api = { SIZE, PICTURES, PICTURES_BY_ID, cloud, band, star };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PICTURES = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
