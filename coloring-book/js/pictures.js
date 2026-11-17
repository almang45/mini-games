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

  // Rainbow band clipped cleanly to x in [-14, 414] and y <= 355 so wide bands stay in bounds.
  function wideBand(cx, cy, outer, inner) {
    const pt = (r, side) => {
      const dy = cy - 355;
      const dxMax = 214;
      if (r * r - dy * dy <= dxMax * dxMax) {
        return n(cx + side * Math.sqrt(r * r - dy * dy)) + " 355";
      }
      return (side < 0 ? cx - dxMax : cx + dxMax) + " " + n(cy - Math.sqrt(r * r - dxMax * dxMax));
    };
    return "M" + pt(outer, -1) + " A" + outer + " " + outer + " 0 0 1 " + pt(outer, 1) +
      " L" + pt(inner, 1) + " A" + inner + " " + inner + " 0 0 0 " + pt(inner, -1) + " Z";
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

  // A solid pupil for `lines`, which are stroke-only: concentric rings 3 apart under the 4-wide
  // ink stroke overlap into one filled dot, where an outlined iris ring read as a target.
  function dot(cx, cy, r) {
    let d = "";
    for (let k = r - 2; k > 1; k -= 3) {
      d += "M" + n(cx - k) + " " + n(cy) + " A" + k + " " + k + " 0 1 1 " + n(cx + k) + " " + n(cy) +
        " A" + k + " " + k + " 0 1 1 " + n(cx - k) + " " + n(cy) + " ";
    }
    return d + "M" + n(cx - 0.5) + " " + n(cy) + " L" + n(cx + 0.5) + " " + n(cy);
  }

  const ring = (cx, cy, r) => "M" + n(cx - r) + " " + n(cy) + " A" + r + " " + r + " 0 1 1 " + n(cx + r) + " " + n(cy) +
    " A" + r + " " + r + " 0 1 1 " + n(cx - r) + " " + n(cy);

  // A wheel hub: a rim ring and a solid centre nut, instead of a crosshair.
  const hubcap = (cx, cy) => ring(cx, cy, 16) + " " + dot(cx, cy, 6);

  // The hole of a ring buoy and the four band edges, set diagonally so it never reads as a crosshair.
  function lifebuoyMarks(cx, cy, r) {
    const hole = n(r * 0.42);
    let d = ring(cx, cy, hole);
    for (const deg of [45, 135, 225, 315]) {
      const a = (deg * Math.PI) / 180;
      d += " M" + n(cx + (hole + 2) * Math.cos(a)) + " " + n(cy + (hole + 2) * Math.sin(a)) +
        " L" + n(cx + (r - 2) * Math.cos(a)) + " " + n(cy + (r - 2) * Math.sin(a));
    }
    return d;
  }

  const sky = { id: "bg", tag: "rect", attrs: { x: 0, y: 0, width: SIZE, height: SIZE } };
  const ground = (y, id) => ({ id: id || "ground", tag: "path", attrs: { d: "M0 " + y + " Q200 " + (y - 22) + " 400 " + y + " V400 H0 Z" } });

  const PICTURES = [
    {
      id: "fish",
      name: { id: "Ikan", en: "Fish" },
      regions: [
        sky,
        { id: "weed-left", tag: "path", attrs: { d: "M26 318 C14 290 46 268 38 238 C32 216 42 198 58 186 C76 210 68 232 76 254 C86 284 62 298 74 318 Z" } },
        { id: "weed-right", tag: "path", attrs: { d: "M338 318 C324 276 360 252 346 212 C338 188 348 166 366 150 C384 176 372 198 380 222 C392 258 362 282 378 318 Z" } },
        { id: "sand", tag: "path", attrs: { d: "M0 318 Q100 296 200 318 T400 310 V400 H0 Z" } },
        { id: "starfish", tag: "path", attrs: { d: star(332, 354, 38, 21) } },
        { id: "pebble1", tag: "ellipse", attrs: { cx: 80, cy: 362, rx: 32, ry: 21 } },
        { id: "tail", tag: "path", attrs: { d: "M120 182 C94 140 62 110 36 118 C20 124 22 150 40 166 C50 174 60 180 68 182 C60 184 50 190 40 198 C22 214 20 240 36 246 C62 254 94 224 120 182 Z" } },
        { id: "fin-top", tag: "path", attrs: { d: "M148 120 C156 50 240 32 290 116 Z" } },
        { id: "fin-bottom", tag: "path", attrs: { d: "M152 240 C136 266 124 296 136 310 C150 318 196 300 230 254 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 214, cy: 182, rx: 110, ry: 80 } },
        // Stripes taper to a point above the belly so the body stays one connected part to tap.
        { id: "stripe1", tag: "path", clip: "body", attrs: { d: "M144 96 C134 142 142 196 166 238 C186 196 194 142 188 96 Z" } },
        { id: "stripe2", tag: "path", clip: "body", attrs: { d: "M212 96 C202 142 210 190 232 228 C252 190 258 142 254 96 Z" } },
        { id: "eye", tag: "circle", attrs: { cx: 284, cy: 160, r: 22 } },
        { id: "bubble1", tag: "circle", attrs: { cx: 346, cy: 96, r: 22 } },
        { id: "bubble2", tag: "circle", attrs: { cx: 318, cy: 42, r: 19 } },
      ],
      lines: [
        dot(287, 161, 9),
        "M270 130 Q284 122 298 130",
        "M318 194 Q306 208 290 202",
        "M44 136 Q72 158 100 176 M44 228 Q72 206 100 188",
        "M180 104 Q194 76 216 62 M226 106 Q238 86 254 78",
        "M146 298 Q166 282 182 264 M168 300 Q188 286 204 268",
        "M338 86 Q342 80 350 80 M312 36 Q316 31 322 31",
        "M130 370 A14 9 0 1 1 158 370 A14 9 0 1 1 130 370",
        "M327 352 Q332 358 337 352",
        "M370 54 A3 3 0 1 1 370 52",
      ],
    },
    {
      id: "house",
      name: { id: "Rumah", en: "House" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 334, cy: 68, r: 36 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(34, 108, 1.05) } },
        { id: "hill", tag: "path", attrs: { d: "M0 242 Q78 202 156 328 H0 Z" } },
        ground(326),
        { id: "path", tag: "path", attrs: { d: "M156 326 L142 374 Q195 384 248 374 L234 326 Z" } },
        { id: "trunk", tag: "rect", attrs: { x: 326, y: 236, width: 40, height: 92, rx: 6 } },
        { id: "leaves", tag: "circle", attrs: { cx: 346, cy: 196, r: 52 } },
        { id: "bush", tag: "circle", attrs: { cx: 56, cy: 318, r: 32 } },
        { id: "chimney", tag: "rect", attrs: { x: 238, y: 88, width: 40, height: 70, rx: 5 } },
        { id: "smoke", tag: "circle", attrs: { cx: 258, cy: 56, r: 22 } },
        { id: "wall", tag: "rect", attrs: { x: 88, y: 194, width: 214, height: 134, rx: 8 } },
        { id: "roof", tag: "path", attrs: { d: "M66 202 L195 90 L324 202 Z" } },
        { id: "door", tag: "rect", attrs: { x: 168, y: 242, width: 54, height: 86, rx: 16 } },
        { id: "window-left", tag: "rect", attrs: { x: 108, y: 218, width: 48, height: 48, rx: 6 } },
        { id: "window-right", tag: "rect", attrs: { x: 234, y: 218, width: 48, height: 48, rx: 6 } },
        { id: "flower", tag: "circle", attrs: { cx: 74, cy: 364, r: 21 } },
      ],
      lines: [
        "M326 68 Q334 76 342 68 M334 22 V12 M334 114 V124 M288 68 H278 M380 68 H390 M302 36 L295 29 M366 100 L373 107 M302 100 L295 107 M366 36 L373 29",
        "M132 218 V266 M108 242 H156 M258 218 V266 M234 242 H282",
        "M208 288 A2.5 2.5 0 1 1 208 285",
        "M74 385 V398",
        "M172 350 H218 M162 392 Q195 386 228 392",
      ],
    },
    {
      id: "butterfly",
      name: { id: "Kupu-kupu", en: "Butterfly" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 52, cy: 58, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(268, 82, 0.85) } },
        ground(336),
        { id: "flower1", tag: "circle", attrs: { cx: 60, cy: 344, r: 22 } },
        { id: "flower2", tag: "circle", attrs: { cx: 340, cy: 344, r: 22 } },
        { id: "wing-top-left", tag: "path", attrs: { d: "M200 185 C140 70 40 62 50 148 C58 210 144 218 200 198 Z" } },
        { id: "wing-top-right", tag: "path", attrs: { d: "M200 185 C260 70 360 62 350 148 C342 210 256 218 200 198 Z" } },
        { id: "wing-low-left", tag: "path", attrs: { d: "M200 202 C140 206 76 238 102 300 C124 342 184 290 200 228 Z" } },
        { id: "wing-low-right", tag: "path", attrs: { d: "M200 202 C260 206 324 238 298 300 C276 342 216 290 200 228 Z" } },
        { id: "spot-top-left", tag: "circle", attrs: { cx: 112, cy: 144, r: 26 } },
        { id: "spot-top-right", tag: "circle", attrs: { cx: 288, cy: 144, r: 26 } },
        { id: "spot-low-left", tag: "circle", attrs: { cx: 142, cy: 270, r: 21 } },
        { id: "spot-low-right", tag: "circle", attrs: { cx: 258, cy: 270, r: 21 } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 228, rx: 21, ry: 62 } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 144, r: 24 } },
        { id: "tip-left", tag: "circle", attrs: { cx: 148, cy: 76, r: 20 } },
        { id: "tip-right", tag: "circle", attrs: { cx: 252, cy: 76, r: 20 } },
      ],
      lines: [
        "M188 124 Q170 98 158 92 M212 124 Q230 98 242 92",
        "M190 140 Q194 135 198 140 M202 140 Q206 135 210 140 M194 150 Q200 157 206 150",
        "M182 210 H218 M180 232 H220 M182 254 H218",
        "M47 58 Q52 65 57 58 M60 366 V392 M340 366 V392",
      ],
    },
    {
      id: "flower",
      name: { id: "Bunga", en: "Flower" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 62, r: 34 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(24, 92, 0.95) } },
        { id: "ground", tag: "path", attrs: { d: "M0 348 Q200 330 400 348 V400 H0 Z" } },
        { id: "stem", tag: "path", attrs: { d: "M178 282 Q172 232 178 158 L222 158 Q216 232 222 282 Z" } },
        { id: "leaf-left", tag: "path", attrs: { d: "M178 264 C106 266 62 220 70 182 C122 174 166 212 178 238 Z" } },
        { id: "leaf-right", tag: "path", attrs: { d: "M222 258 C276 258 316 218 310 182 C266 176 232 210 222 232 Z" } },
        { id: "pot", tag: "path", attrs: { d: "M128 310 L272 310 L252 392 L148 392 Z" } },
        { id: "rim", tag: "rect", attrs: { x: 114, y: 274, width: 172, height: 38, rx: 10 } },
      ].concat(petals(200, 114, 6, 54, 27, 44), [
        { id: "ladybug", tag: "circle", attrs: { cx: 106, cy: 224, r: 22 } },
        { id: "center", tag: "circle", attrs: { cx: 200, cy: 114, r: 32 } },
      ]),
      lines: [
        "M189 108 Q193 102 197 108 M203 108 Q207 102 211 108 M191 122 Q200 133 209 122 M182 118 Q185 122 188 118 M212 118 Q215 122 218 118",
        "M335 62 Q340 69 345 62 M340 18 V10 M340 106 V114 M296 62 H288 M384 62 H392",
        "M88 214 Q104 206 112 220 M96 212 L124 236 M100 228 A2.5 2.5 0 1 1 100 225 M112 216 A2.5 2.5 0 1 1 112 213 M114 234 A2.5 2.5 0 1 1 114 231 M84 212 Q76 204 74 210",
        "M228 238 Q266 220 298 190",
      ],
    },
    {
      id: "car",
      name: { id: "Mobil", en: "Car" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 64, cy: 64, r: 34 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(208, 88, 0.95) } },
        { id: "hill", tag: "path", attrs: { d: "M290 296 Q348 214 400 236 V296 Z" } },
        { id: "tree-trunk", tag: "rect", attrs: { x: 22, y: 214, width: 38, height: 84, rx: 6 } },
        { id: "tree-leaves", tag: "circle", attrs: { cx: 41, cy: 174, r: 40 } },
        { id: "road", tag: "rect", attrs: { x: 0, y: 295, width: 400, height: 105 } },
        { id: "roof", tag: "path", attrs: { d: "M108 200 C114 112 272 112 284 200 Z" } },
        { id: "body", tag: "path", attrs: { d: "M72 286 C60 250 72 208 108 200 L284 200 C314 202 342 224 352 254 C360 274 354 286 340 286 Z" } },
        { id: "window-back", tag: "path", attrs: { d: "M122 194 C126 138 186 138 192 194 Z" } },
        { id: "window-front", tag: "path", attrs: { d: "M202 194 C208 138 266 138 270 194 Z" } },
        { id: "light", tag: "circle", attrs: { cx: 334, cy: 244, r: 20 } },
        { id: "wheel-back", tag: "circle", attrs: { cx: 132, cy: 292, r: 38 } },
        { id: "wheel-front", tag: "circle", attrs: { cx: 282, cy: 292, r: 38 } },
      ],
      lines: [
        "M196 198 V266 M210 226 H230",
        "M74 240 H86 V256 H72",
        "M324 274 Q338 282 346 274",
        "M59 64 Q64 71 69 64",
        hubcap(132, 292),
        hubcap(282, 292),
        "M32 352 H88 M172 352 H228 M312 352 H368",
      ],
    },
    {
      id: "rainbow",
      name: { id: "Pelangi", en: "Rainbow" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 348, cy: 54, r: 34 } },
        { id: "star1", tag: "path", attrs: { d: star(56, 56, 36, 20) } },
      ].concat(["band1", "band2", "band3", "band4", "band5", "band6", "band7"].map((id, i) => (
        { id, tag: "path", attrs: { d: wideBand(200, 396, 324 - i * 38, 286 - i * 38) } }
      )), [
        ground(352),
        { id: "cloud-left", tag: "path", attrs: { d: cloud(-10, 344, 1.0) } },
        { id: "cloud-right", tag: "path", attrs: { d: cloud(298, 344, 1.0) } },
        { id: "flower-left", tag: "circle", attrs: { cx: 54, cy: 370, r: 21 } },
        { id: "flower-right", tag: "circle", attrs: { cx: 346, cy: 370, r: 21 } },
      ]),
      lines: [
        "M343 54 Q348 61 353 54",
        "M34 320 Q44 328 54 320 M342 320 Q352 328 362 320",
        "M54 391 V398 M346 391 V398",
        "M188 382 L194 372 L200 382 L206 372 L212 382",
        "M290 64 L294 54 L298 64 L308 68 L298 72 L294 82 L290 72 L280 68 Z",
        "M112 62 L115 54 L118 62 L126 65 L118 68 L115 76 L112 68 L104 65 Z",
      ],
    },
    {
      id: "rocket",
      name: { id: "Roket", en: "Rocket" },
      regions: [
        sky,
        { id: "planet", tag: "circle", attrs: { cx: 332, cy: 74, r: 36 } },
        { id: "moon", tag: "circle", attrs: { cx: 64, cy: 158, r: 28 } },
        { id: "star1", tag: "path", attrs: { d: star(62, 62, 38, 21) } },
        { id: "star2", tag: "path", attrs: { d: star(342, 198, 36, 20) } },
        { id: "flame", tag: "path", attrs: { d: "M152 260 Q200 356 248 260 Z" } },
        { id: "smoke1", tag: "path", attrs: { d: "M96 392 C78 352 94 318 134 322 C150 296 184 298 200 316 C216 298 250 296 266 322 C306 318 322 352 304 392 Z" } },
        { id: "fin-left", tag: "path", attrs: { d: "M148 180 L66 276 L148 260 Z" } },
        { id: "fin-right", tag: "path", attrs: { d: "M252 180 L334 276 L252 260 Z" } },
        { id: "body", tag: "path", attrs: { d: "M200 36 C252 82 260 154 260 264 L140 264 C140 154 148 82 200 36 Z" } },
        { id: "nose", tag: "path", clip: "body", attrs: { d: "M120 26 H280 V120 H120 Z" } },
        { id: "window", tag: "circle", attrs: { cx: 200, cy: 178, r: 36 } },
      ],
      lines: [
        "M176 184 A24 24 0 1 1 224 184 A24 24 0 1 1 176 184",
        "M190 174 A2 2 0 1 1 190 172 M210 174 A2 2 0 1 1 210 172 M194 186 Q200 192 206 186",
        "M326 74 Q332 82 338 74 M302 62 Q332 54 362 62",
        "M58 158 Q64 164 70 158",
        "M158 232 H242",
        "M148 352 Q174 334 200 348 Q226 334 252 352",
        "M74 282 L78 272 L82 282 L92 286 L82 290 L78 300 L74 290 L64 286 Z",
        "M336 296 L340 286 L344 296 L354 300 L344 304 L340 314 L336 304 L326 300 Z",
      ],
    },
    {
      id: "dinosaur",
      name: { id: "Dinosaurus", en: "Dinosaur" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 62, cy: 62, r: 34 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(138, 92, 0.9) } },
        { id: "volcano", tag: "path", attrs: { d: "M304 328 L342 184 H380 L414 328 Z" } },
        { id: "volcano-smoke", tag: "circle", attrs: { cx: 360, cy: 152, r: 24 } },
        ground(326),
        { id: "tail", tag: "path", attrs: { d: "M130 226 Q52 212 18 264 Q16 284 44 286 Q88 272 132 280 Z" } },
        { id: "spike1", tag: "path", attrs: { d: "M110 224 C98 158 128 136 150 148 C170 160 166 202 160 218 Z" } },
        { id: "spike2", tag: "path", attrs: { d: "M162 212 C156 146 188 126 210 140 C228 154 222 198 214 212 Z" } },
        { id: "spike3", tag: "path", attrs: { d: "M214 214 C214 148 248 132 266 148 C280 164 268 206 258 226 Z" } },
        { id: "leg1", tag: "rect", attrs: { x: 114, y: 274, width: 40, height: 74, rx: 14 } },
        { id: "leg2", tag: "rect", attrs: { x: 162, y: 274, width: 40, height: 74, rx: 14 } },
        { id: "leg3", tag: "rect", attrs: { x: 214, y: 274, width: 40, height: 74, rx: 14 } },
        { id: "leg4", tag: "rect", attrs: { x: 262, y: 274, width: 40, height: 74, rx: 14 } },
        { id: "neck", tag: "path", attrs: { d: "M248 228 C258 164 270 124 286 98 L324 114 C308 144 300 184 298 242 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 204, cy: 248, rx: 98, ry: 54 } },
        { id: "spot1", tag: "circle", clip: "body", attrs: { cx: 168, cy: 232, r: 22 } },
        { id: "spot2", tag: "circle", clip: "body", attrs: { cx: 230, cy: 230, r: 20 } },
        { id: "bush", tag: "path", attrs: { d: cloud(310, 336, 0.85) } },
        { id: "head", tag: "ellipse", attrs: { cx: 320, cy: 96, rx: 52, ry: 40 } },
        { id: "eye", tag: "circle", attrs: { cx: 334, cy: 84, r: 20 } },
      ],
      lines: [
        dot(337, 85, 8),
        "M322 58 Q336 52 348 58",
        "M318 112 Q334 126 352 110",
        "M356 96 A2 2 0 1 1 356 94",
        "M308 106 Q314 112 320 106",
        "M57 62 Q62 69 67 62",
        "M340 198 Q350 210 360 198 Q370 210 380 198",
        "M122 344 Q126 338 130 344 M136 344 Q140 338 144 344 M270 344 Q274 338 278 344 M284 344 Q288 338 292 344",
      ],
    },
    {
      id: "cat",
      name: { id: "Kucing", en: "Cat" },
      regions: [
        sky,
        { id: "picture-frame", tag: "rect", attrs: { x: 24, y: 48, width: 74, height: 62, rx: 8 } },
        { id: "window", tag: "rect", attrs: { x: 304, y: 44, width: 74, height: 94, rx: 8 } },
        { id: "floor", tag: "rect", attrs: { x: 0, y: 288, width: 400, height: 112 } },
        { id: "rug", tag: "ellipse", attrs: { cx: 222, cy: 344, rx: 150, ry: 34 } },
        { id: "yarn", tag: "circle", attrs: { cx: 56, cy: 324, r: 34 } },
        { id: "tail", tag: "path", attrs: { d: "M256 322 C346 334 374 264 344 222 C330 204 302 214 306 238 C316 268 302 292 248 286 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 266, rx: 82, ry: 84 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 290, rx: 46, ry: 54 } },
        { id: "paw-left", tag: "ellipse", attrs: { cx: 168, cy: 344, rx: 28, ry: 20 } },
        { id: "paw-right", tag: "ellipse", attrs: { cx: 232, cy: 344, rx: 28, ry: 20 } },
        { id: "ear-left", tag: "path", attrs: { d: "M118 140 L124 30 L196 96 Z" } },
        { id: "ear-right", tag: "path", attrs: { d: "M282 140 L276 30 L204 96 Z" } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 152, r: 78 } },
        { id: "eye-left", tag: "circle", attrs: { cx: 166, cy: 142, r: 21 } },
        { id: "eye-right", tag: "circle", attrs: { cx: 234, cy: 142, r: 21 } },
      ],
      lines: [
        "M140 108 L142 64 L176 92",
        "M260 108 L258 64 L224 92",
        dot(168, 145, 8),
        dot(232, 145, 8),
        "M192 170 L208 170 L200 180 Z",
        "M200 180 Q190 194 180 188 M200 180 Q210 194 220 188",
        "M144 176 Q150 182 156 176 M244 176 Q250 182 256 176",
        "M148 180 L104 174 M148 190 L104 196 M252 180 L296 174 M252 190 L296 196",
        "M32 308 Q58 328 84 306 M26 328 Q58 348 90 326 M44 294 Q70 324 54 354 M90 332 Q116 352 134 342",
        "M341 44 V138 M304 91 H378",
        "M46 78 Q60 66 72 78 L80 70 L80 86 L72 78 Z",
      ],
    },
    {
      id: "turtle",
      name: { id: "Kura-kura", en: "Turtle" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 62, cy: 62, r: 34 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(154, 94, 0.9) } },
        { id: "sea", tag: "path", attrs: { d: "M0 124 Q100 110 200 124 T400 124 V308 H0 Z" } },
        ground(302, "sand"),
        { id: "starfish", tag: "path", attrs: { d: star(342, 348, 38, 21) } },
        { id: "pebble1", tag: "ellipse", attrs: { cx: 76, cy: 358, rx: 30, ry: 21 } },
        { id: "leg-back", tag: "rect", attrs: { x: 112, y: 266, width: 48, height: 70, rx: 16 } },
        { id: "leg-front", tag: "rect", attrs: { x: 230, y: 266, width: 48, height: 70, rx: 16 } },
        { id: "head", tag: "ellipse", attrs: { cx: 324, cy: 218, rx: 52, ry: 40 } },
        { id: "shell", tag: "path", attrs: { d: "M84 268 C90 124 296 124 302 268 Z" } },
        { id: "plate-left", tag: "path", clip: "shell", attrs: { d: hexagon(132, 236, 26) } },
        { id: "plate-mid", tag: "path", attrs: { d: hexagon(193, 224, 28) } },
        { id: "plate-right", tag: "path", clip: "shell", attrs: { d: hexagon(254, 236, 26) } },
        { id: "rim", tag: "rect", attrs: { x: 76, y: 256, width: 234, height: 38, rx: 16 } },
        { id: "eye", tag: "circle", attrs: { cx: 338, cy: 204, r: 20 } },
        { id: "bubble1", tag: "circle", attrs: { cx: 368, cy: 148, r: 21 } },
      ],
      lines: [
        dot(341, 205, 8),
        "M338 230 Q352 242 364 228",
        "M318 228 Q324 234 330 228",
        "M77 265 L48 275 L77 284",
        "M14 235 Q30 225 46 235 Q62 245 78 235 M346 276 Q362 266 376 276 Q388 284 398 276",
        "M57 62 Q62 69 67 62",
        "M120 368 A12 8 0 1 1 144 368 A12 8 0 1 1 120 368",
        "M342 128 A4 4 0 1 1 350 128 A4 4 0 1 1 342 128",
      ],
    },
    {
      id: "train",
      name: { id: "Kereta", en: "Train" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 62, cy: 62, r: 34 } },
        { id: "hill", tag: "path", attrs: { d: "M0 202 Q76 98 164 202 Z" } },
        { id: "smoke-big", tag: "circle", attrs: { cx: 218, cy: 48, r: 34 } },
        { id: "smoke3", tag: "circle", attrs: { cx: 264, cy: 80, r: 26 } },
        { id: "smoke-small", tag: "circle", attrs: { cx: 294, cy: 116, r: 22 } },
        { id: "ground", tag: "rect", attrs: { x: 0, y: 332, width: 400, height: 68 } },
        { id: "wagon", tag: "rect", attrs: { x: 12, y: 196, width: 148, height: 100, rx: 8 } },
        { id: "window-left", tag: "rect", attrs: { x: 28, y: 214, width: 48, height: 42, rx: 6 } },
        { id: "window-right", tag: "rect", attrs: { x: 94, y: 214, width: 48, height: 42, rx: 6 } },
        { id: "chimney", tag: "path", attrs: { d: "M282 212 L272 138 L316 138 L306 212 Z" } },
        { id: "cab", tag: "rect", attrs: { x: 174, y: 168, width: 82, height: 128, rx: 6 } },
        { id: "roof", tag: "rect", attrs: { x: 162, y: 132, width: 106, height: 38, rx: 10 } },
        { id: "cab-window", tag: "rect", attrs: { x: 192, y: 186, width: 46, height: 44, rx: 6 } },
        { id: "boiler", tag: "rect", attrs: { x: 256, y: 208, width: 84, height: 88, rx: 12 } },
        { id: "lamp", tag: "circle", attrs: { cx: 344, cy: 234, r: 22 } },
        { id: "cowcatcher", tag: "path", attrs: { d: "M342 250 L408 328 H342 Z" } },
        { id: "wheel1", tag: "circle", attrs: { cx: 50, cy: 304, r: 24 } },
        { id: "wheel2", tag: "circle", attrs: { cx: 122, cy: 304, r: 24 } },
        { id: "wheel3", tag: "circle", attrs: { cx: 214, cy: 298, r: 29 } },
        { id: "wheel4", tag: "circle", attrs: { cx: 282, cy: 304, r: 24 } },
        { id: "wheel5", tag: "circle", attrs: { cx: 326, cy: 304, r: 24 } },
      ],
      lines: [
        "M160 284 H174",
        "M282 210 V296 M306 210 V296",
        "M214 298 L282 304 L326 304",
        "M50 304 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M122 304 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M214 298 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0",
        "M10 332 H390 M10 342 H390",
        "M36 342 V364 M76 342 V364 M116 342 V364 M156 342 V364 M196 342 V364 M236 342 V364 M276 342 V364 M316 342 V364 M356 342 V364",
        "M57 62 Q62 69 67 62",
      ],
    },
    {
      id: "sailboat",
      name: { id: "Perahu layar", en: "Sailboat" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 62, r: 34 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(20, 118, 0.85) } },
        { id: "cloud-mid", tag: "path", attrs: { d: cloud(96, 68, 0.72) } },
        { id: "sea", tag: "path", attrs: { d: "M0 242 Q50 230 100 242 T200 242 T300 242 T400 242 V400 H0 Z" } },
        { id: "wave", tag: "path", attrs: { d: "M0 322 Q50 310 100 322 T200 322 T300 322 T400 322 V400 H0 Z" } },
        { id: "wave-front", tag: "path", attrs: { d: "M0 364 Q50 352 100 364 T200 364 T300 364 T400 364 V400 H0 Z" } },
        { id: "flag", tag: "path", attrs: { d: "M200 28 Q234 22 270 34 L270 74 Q234 64 200 70 Z" } },
        { id: "sail-main", tag: "path", attrs: { d: "M204 72 Q282 140 332 204 L204 204 Z" } },
        { id: "sail-stripe", tag: "path", clip: "sail-main", attrs: { d: "M200 134 H345 V174 H200 Z" } },
        { id: "sail-front", tag: "path", attrs: { d: "M196 80 L196 204 L84 204 Q140 142 196 80 Z" } },
        { id: "hull", tag: "path", attrs: { d: "M64 210 H336 L320 268 H80 Z" } },
        { id: "hull-stripe", tag: "path", attrs: { d: "M80 268 H320 Q306 306 286 308 L114 308 Q94 306 80 268 Z" } },
        { id: "lifebuoy", tag: "circle", attrs: { cx: 200, cy: 239, r: 24 } },
      ],
      lines: [
        "M200 26 V210 M80 204 H334",
        "M74 134 Q84 124 94 134 Q104 124 114 134 M264 110 Q274 100 284 110 Q294 100 304 110",
        "M335 62 Q340 69 345 62",
        lifebuoyMarks(200, 239, 24),
      ],
    },
    {
      id: "ice-cream",
      name: { id: "Es krim", en: "Ice cream" },
      regions: [
        sky,
        { id: "heart", tag: "path", attrs: { d: "M344 114 C302 82 312 44 344 64 C376 44 386 82 344 114 Z" } },
        { id: "star-left", tag: "path", attrs: { d: star(62, 82, 38, 21) } },
        { id: "candy-left", tag: "circle", attrs: { cx: 58, cy: 206, r: 22 } },
        { id: "star-low", tag: "path", attrs: { d: star(62, 326, 36, 20) } },
        { id: "candy-right", tag: "circle", attrs: { cx: 342, cy: 206, r: 22 } },
        { id: "star-right", tag: "path", attrs: { d: star(338, 326, 36, 20) } },
        { id: "cone", tag: "path", attrs: { d: "M130 274 L270 274 L200 392 Z" } },
        { id: "cone-rim", tag: "rect", attrs: { x: 118, y: 228, width: 164, height: 46, rx: 10 } },
        { id: "scoop-bottom", tag: "path", attrs: { d: "M118 228 C102 152 298 152 282 228 Q266 242 250 228 Q234 242 218 228 Q200 242 182 228 Q166 242 150 228 Q134 242 118 228 Z" } },
        { id: "scoop-top", tag: "path", attrs: { d: "M138 180 C120 70 280 70 262 180 Q246 196 230 180 Q215 196 200 180 Q185 196 170 180 Q154 196 138 180 Z" } },
        { id: "syrup", tag: "path", clip: "scoop-top", attrs: { d: "M130 70 H270 V136 Q252 154 234 134 Q216 158 200 130 Q184 158 166 134 Q148 154 130 136 Z" } },
        { id: "cherry", tag: "circle", attrs: { cx: 200, cy: 62, r: 22 } },
        { id: "wafer", tag: "path", attrs: { d: "M232 132 L278 52 L306 70 L260 150 Z" } },
      ],
      lines: [
        "M140 282 L234 336 M158 318 L218 362 M176 352 L202 388 M260 282 L166 336 M242 318 L182 362 M224 352 L198 388",
        "M200 40 Q206 20 230 12 M214 24 Q228 18 225 30",
        "M36 206 L20 194 L20 218 Z M80 206 L96 194 L96 218 Z M320 206 L304 194 L304 218 Z M364 206 L380 194 L380 218 Z",
        "M164 162 L176 158 M222 164 L228 156 M144 212 L156 206 M244 208 L254 216 M194 214 L206 208",
        "M250 112 L278 130 M265 86 L293 104",
      ],
    },
    {
      id: "owl",
      name: { id: "Burung hantu", en: "Owl" },
      regions: [
        sky,
        { id: "moon", tag: "circle", attrs: { cx: 336, cy: 70, r: 36 } },
        { id: "star1", tag: "path", attrs: { d: star(62, 68, 38, 21) } },
        { id: "star2", tag: "path", attrs: { d: star(342, 196, 36, 20) } },
        { id: "branch", tag: "path", attrs: { d: "M0 304 C120 284 260 314 400 280 L400 328 C260 358 120 328 0 348 Z" } },
        { id: "leaf", tag: "path", attrs: { d: "M304 298 Q334 238 388 248 Q372 304 304 298 Z" } },
        { id: "tuft-left", tag: "path", attrs: { d: "M134 156 Q98 102 110 54 Q164 78 192 122 Z" } },
        { id: "tuft-right", tag: "path", attrs: { d: "M266 156 Q302 102 290 54 Q236 78 208 122 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 214, rx: 98, ry: 108 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 266, rx: 56, ry: 56 } },
        { id: "wing-left", tag: "path", attrs: { d: "M108 188 C74 236 86 298 134 316 C126 274 128 230 108 188 Z" } },
        { id: "wing-right", tag: "path", attrs: { d: "M292 188 C326 236 314 298 266 316 C274 274 272 230 292 188 Z" } },
        { id: "eye-left", tag: "circle", attrs: { cx: 162, cy: 164, r: 25 } },
        { id: "eye-right", tag: "circle", attrs: { cx: 238, cy: 164, r: 25 } },
        { id: "beak", tag: "path", attrs: { d: "M176 184 Q200 168 224 184 Q216 218 200 226 Q184 218 176 184 Z" } },
        { id: "foot-left", tag: "ellipse", attrs: { cx: 166, cy: 320, rx: 22, ry: 19 } },
        { id: "foot-right", tag: "ellipse", attrs: { cx: 234, cy: 320, rx: 22, ry: 19 } },
      ],
      lines: [
        dot(164, 166, 10),
        dot(236, 166, 10),
        "M126 144 Q162 114 200 142 Q238 114 274 144",
        "M180 254 Q187 262 194 254 M206 254 Q213 262 220 254 M193 280 Q200 288 207 280",
        "M166 314 V334 M234 314 V334",
        "M329 68 Q335 74 341 68",
        "M68 164 L72 154 L76 164 L86 168 L76 172 L72 182 L68 172 L58 168 Z",
        "M46 244 L49 236 L52 244 L60 247 L52 250 L49 258 L46 250 L38 247 Z",
      ],
    },
    {
      id: "planet",
      name: { id: "Planet", en: "Planet" },
      regions: [
        sky,
        { id: "star1", tag: "path", attrs: { d: star(342, 62, 38, 21) } },
        { id: "star2", tag: "path", attrs: { d: star(346, 336, 36, 20) } },
        { id: "ufo-dome", tag: "ellipse", attrs: { cx: 82, cy: 134, rx: 34, ry: 30 } },
        { id: "ufo-saucer", tag: "ellipse", attrs: { cx: 82, cy: 168, rx: 58, ry: 22 } },
        { id: "comet-tail", tag: "path", attrs: { d: "M18 18 L156 54 L128 96 Z" } },
        { id: "comet", tag: "circle", attrs: { cx: 146, cy: 76, r: 24 } },
        { id: "planet", tag: "circle", attrs: { cx: 242, cy: 216, r: 88 } },
        { id: "stripe-top", tag: "path", attrs: { d: "M156 197.5 A88 88 0 0 1 305.2 154.7 Q228 166 156 197.5 Z" } },
        { id: "stripe-low", tag: "path", attrs: { d: "M160.9 250.1 Q248 238 328.9 202 A88 88 0 0 1 160.9 250.1 Z" } },
        { id: "ring-front", tag: "path", attrs: { d: "M160.2 183.6 A152 48 -16 1 0 293 144.3 A88 88 0 0 1 320.5 176.3 A106 8 -16 1 1 154.4 224.7 A88 88 0 0 1 160.2 183.6 Z" } },
        { id: "moon", tag: "circle", attrs: { cx: 74, cy: 312, r: 52 } },
        { id: "crater1", tag: "circle", clip: "moon", attrs: { cx: 54, cy: 294, r: 20 } },
      ],
      lines: [
        "M218 192 Q222 186 226 192 M248 184 Q252 178 256 184 M230 200 Q240 208 248 196",
        "M84 316 Q90 322 96 316 M86 300 A2.5 2.5 0 1 1 86 297 M100 298 A2.5 2.5 0 1 1 100 295",
        "M54 170 A3 3 0 1 1 54 167 M82 172 A3 3 0 1 1 82 169 M110 170 A3 3 0 1 1 110 167",
        "M192 356 L196 346 L200 356 L210 360 L200 364 L196 374 L192 364 L182 360 Z",
        "M356 124 L359 116 L362 124 L370 127 L362 130 L359 138 L356 130 L348 127 Z",
        "M84 334 A9 9 0 1 1 84 333.9",
      ],
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
