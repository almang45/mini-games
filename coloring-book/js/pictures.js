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
        { id: "weed-left", tag: "path", attrs: { d: "M45 350 C15 290 65 245 30 180 C75 220 50 280 65 350 Z" } },
        { id: "weed-right", tag: "path", attrs: { d: "M355 350 C325 290 380 245 350 190 C390 230 365 290 375 350 Z" } },
        { id: "sand", tag: "path", attrs: { d: "M0 320 Q100 295 200 320 T400 310 V400 H0 Z" } },
        { id: "starfish", tag: "path", attrs: { d: star(340, 355, 24, 11) } },
        { id: "pebble1", tag: "ellipse", attrs: { cx: 75, cy: 365, rx: 18, ry: 12 } },
        { id: "pebble2", tag: "ellipse", attrs: { cx: 120, cy: 375, rx: 14, ry: 9 } },
        { id: "tail", tag: "path", attrs: { d: "M115 195 C65 120 25 130 22 160 C20 185 55 190 75 195 C55 200 20 205 22 230 C25 260 65 270 115 195 Z" } },
        { id: "fin-top", tag: "path", attrs: { d: "M150 135 C160 65 220 60 235 95 C250 70 280 75 285 135 Z" } },
        { id: "fin-bottom", tag: "path", attrs: { d: "M175 255 C195 305 245 305 255 245 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 205, cy: 195, rx: 105, ry: 78 } },
        { id: "stripe1", tag: "path", clip: "body", attrs: { d: "M155 100 Q135 195 155 290 L185 290 Q165 195 185 100 Z" } },
        { id: "stripe2", tag: "path", clip: "body", attrs: { d: "M210 100 Q190 195 210 290 L238 290 Q218 195 238 100 Z" } },
        { id: "fin-pec", tag: "ellipse", attrs: { cx: 185, cy: 215, rx: 25, ry: 16, transform: "rotate(-10 185 215)" } },
        { id: "eye", tag: "circle", attrs: { cx: 275, cy: 175, r: 18 } },
        { id: "pupil", tag: "circle", attrs: { cx: 279, cy: 175, r: 10 } },
        { id: "bubble1", tag: "circle", attrs: { cx: 330, cy: 120, r: 15 } },
        { id: "bubble2", tag: "circle", attrs: { cx: 355, cy: 75, r: 12 } },
        { id: "bubble3", tag: "circle", attrs: { cx: 325, cy: 40, r: 10 } },
      ],
      lines: [
        "M300 195 Q288 212 272 204",
        "M270 200 L273 207",
        "M150 135 Q185 100 235 95 M235 95 Q255 105 285 135",
        "M60 165 Q85 185 110 195 M60 225 Q85 205 110 195",
      ],
    },
    {
      id: "house",
      name: { id: "Rumah", en: "House" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 330, cy: 75, r: 35 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(45, 110, 1.05) } },
        { id: "hill", tag: "path", attrs: { d: "M0 290 Q200 240 400 280 V400 H0 Z" } },
        ground(330),
        { id: "path", tag: "path", attrs: { d: "M175 330 Q160 365 140 400 H250 Q230 365 220 330 Z" } },
        { id: "trunk", tag: "rect", attrs: { x: 338, y: 245, width: 24, height: 85, rx: 4 } },
        { id: "leaves", tag: "circle", attrs: { cx: 350, cy: 215, r: 42 } },
        { id: "bush", tag: "circle", attrs: { cx: 55, cy: 335, r: 25 } },
        { id: "chimney", tag: "rect", attrs: { x: 246, y: 105, width: 28, height: 55, rx: 3 } },
        { id: "smoke", tag: "circle", attrs: { cx: 260, cy: 80, r: 16 } },
        { id: "wall", tag: "rect", attrs: { x: 92, y: 195, width: 214, height: 135, rx: 6 } },
        { id: "roof", tag: "path", attrs: { d: "M70 202 L199 92 L328 202 Z" } },
        { id: "door", tag: "rect", attrs: { x: 176, y: 250, width: 46, height: 80, rx: 10 } },
        { id: "knob", tag: "circle", attrs: { cx: 210, cy: 295, r: 9 } },
        { id: "window-left", tag: "rect", attrs: { x: 112, y: 220, width: 46, height: 46, rx: 5 } },
        { id: "window-right", tag: "rect", attrs: { x: 240, y: 220, width: 46, height: 46, rx: 5 } },
        { id: "flower", tag: "circle", attrs: { cx: 75, cy: 365, r: 14 } },
      ],
      lines: [
        "M322 75 Q330 83 338 75 M330 30 V20 M330 120 V130 M285 75 H275 M375 75 H385 M298 43 L291 36 M362 107 L369 114 M298 107 L291 114 M362 43 L369 36",
        "M135 220 V266 M112 243 H158 M263 220 V266 M240 243 H286",
        "M75 379 V395",
      ],
    },
    {
      id: "butterfly",
      name: { id: "Kupu-kupu", en: "Butterfly" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 55, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(250, 95, 0.9) } },
        ground(335),
        { id: "flower1", tag: "circle", attrs: { cx: 65, cy: 345, r: 18 } },
        { id: "flower2", tag: "circle", attrs: { cx: 335, cy: 345, r: 18 } },
        { id: "wing-top-left", tag: "path", attrs: { d: "M200 185 C145 75 45 65 55 145 C62 205 145 215 200 195 Z" } },
        { id: "wing-top-right", tag: "path", attrs: { d: "M200 185 C255 75 355 65 345 145 C338 205 255 215 200 195 Z" } },
        { id: "wing-low-left", tag: "path", attrs: { d: "M200 200 C145 205 80 235 105 295 C125 335 185 285 200 225 Z" } },
        { id: "wing-low-right", tag: "path", attrs: { d: "M200 200 C255 205 320 235 295 295 C275 335 215 285 200 225 Z" } },
        { id: "spot-top-left", tag: "circle", attrs: { cx: 115, cy: 145, r: 24 } },
        { id: "spot-top-right", tag: "circle", attrs: { cx: 285, cy: 145, r: 24 } },
        { id: "spot-low-left", tag: "circle", attrs: { cx: 145, cy: 268, r: 16 } },
        { id: "spot-low-right", tag: "circle", attrs: { cx: 255, cy: 268, r: 16 } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 228, rx: 16, ry: 60 } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 148, r: 20 } },
        { id: "tip-left", tag: "circle", attrs: { cx: 162, cy: 82, r: 10 } },
        { id: "tip-right", tag: "circle", attrs: { cx: 238, cy: 82, r: 10 } },
      ],
      lines: [
        "M192 132 Q175 98 165 89 M208 132 Q225 98 235 89",
        "M192 145 Q195 141 198 145 M202 145 Q205 141 208 145 M196 153 Q200 158 204 153",
        "M186 210 H214 M184 230 H216 M186 250 H214",
        "M50 65 Q55 72 60 65 M65 363 V390 M335 363 V390",
      ],
    },
    {
      id: "flower",
      name: { id: "Bunga", en: "Flower" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(25, 95, 0.9) } },
        { id: "ground", tag: "path", attrs: { d: "M0 340 Q200 325 400 340 V400 H0 Z" } },
        { id: "stem", tag: "path", attrs: { d: "M194 285 Q185 220 196 155 L206 155 Q195 220 206 285 Z" } },
        { id: "leaf-left", tag: "path", attrs: { d: "M194 255 C125 255 85 215 90 180 C140 175 180 210 196 230 Z" } },
        { id: "leaf-right", tag: "path", attrs: { d: "M204 230 Q252 215 272 178 Q222 180 202 214 Z" } },
        { id: "ladybug", tag: "circle", attrs: { cx: 125, cy: 205, r: 16 } },
        { id: "ladybug-head", tag: "circle", attrs: { cx: 112, cy: 198, r: 9 } },
        { id: "pot", tag: "path", attrs: { d: "M138 295 L262 295 L246 385 L154 385 Z" } },
        { id: "rim", tag: "rect", attrs: { x: 124, y: 275, width: 152, height: 24, rx: 7 } },
      ].concat(petals(200, 138, 6, 48, 25, 42), [
        { id: "center", tag: "circle", attrs: { cx: 200, cy: 138, r: 30 } },
      ]),
      lines: [
        "M190 132 Q193 127 196 132 M204 132 Q207 127 210 132 M192 144 Q200 154 208 144 M183 140 Q186 144 189 140 M211 140 Q214 144 217 140",
        "M335 65 Q340 72 345 65 M340 22 V14 M340 108 V116 M297 65 H289 M383 65 H391",
        "M112 198 L140 210 M120 196 A2 2 0 1 1 120 194 M132 214 A2 2 0 1 1 132 212 M108 194 Q102 188 100 192",
        "M204 214 Q235 200 265 180",
      ],
    },
    {
      id: "car",
      name: { id: "Mobil", en: "Car" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 65, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(200, 85, 0.9) } },
        { id: "hill", tag: "path", attrs: { d: "M0 260 Q120 210 240 245 T400 230 V295 H0 Z" } },
        { id: "tree-trunk", tag: "rect", attrs: { x: 345, y: 215, width: 20, height: 80, rx: 5 } },
        { id: "tree-leaves", tag: "circle", attrs: { cx: 355, cy: 185, r: 35 } },
        { id: "road", tag: "rect", attrs: { x: 0, y: 295, width: 400, height: 105 } },
        { id: "line1", tag: "rect", attrs: { x: 30, y: 352, width: 56, height: 14, rx: 4 } },
        { id: "line2", tag: "rect", attrs: { x: 172, y: 352, width: 56, height: 14, rx: 4 } },
        { id: "line3", tag: "rect", attrs: { x: 314, y: 352, width: 56, height: 14, rx: 4 } },
        { id: "roof", tag: "path", attrs: { d: "M100 200 C105 125 240 125 255 200 Z" } },
        { id: "body", tag: "path", attrs: { d: "M45 285 C35 255 45 215 85 208 L100 200 L255 200 C275 200 295 215 315 245 C325 260 325 280 315 285 Z" } },
        { id: "window-back", tag: "path", attrs: { d: "M112 195 C116 145 168 145 174 195 Z" } },
        { id: "window-front", tag: "path", attrs: { d: "M182 195 C188 145 240 145 244 195 Z" } },
        { id: "light", tag: "circle", attrs: { cx: 312, cy: 250, r: 12 } },
        { id: "taillight", tag: "rect", attrs: { x: 42, y: 242, width: 12, height: 18, rx: 5 } },
        { id: "wheel-back", tag: "circle", attrs: { cx: 102, cy: 288, r: 32 } },
        { id: "wheel-front", tag: "circle", attrs: { cx: 258, cy: 288, r: 32 } },
        { id: "hub-back", tag: "circle", attrs: { cx: 102, cy: 288, r: 14 } },
        { id: "hub-front", tag: "circle", attrs: { cx: 258, cy: 288, r: 14 } },
      ],
      lines: [
        "M178 198 V268 M190 228 H208",
        "M308 275 Q322 282 318 288",
        "M60 65 Q65 72 70 65",
        "M102 274 V302 M88 288 H116 M258 274 V302 M244 288 H272",
      ],
    },
    {
      id: "rainbow",
      name: { id: "Pelangi", en: "Rainbow" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 60, r: 32 } },
        { id: "star1", tag: "path", attrs: { d: star(60, 50, 18, 8) } },
        { id: "star2", tag: "path", attrs: { d: star(300, 130, 16, 7) } },
        { id: "cloud-top", tag: "path", attrs: { d: cloud(30, 135, 0.7) } },
      ].concat(["band1", "band2", "band3", "band4", "band5", "band6", "band7"].map((id, i) => (
        { id, tag: "path", attrs: { d: band(200, 300, 190 - i * 20, 170 - i * 20) } }
      )), [
        { id: "hill-far", tag: "path", attrs: { d: "M0 310 Q100 270 200 295 T400 290 V400 H0 Z" } },
        ground(330),
        { id: "cloud-left", tag: "path", attrs: { d: cloud(-10, 325, 1.1) } },
        { id: "cloud-right", tag: "path", attrs: { d: cloud(280, 325, 1.1) } },
        { id: "flower-left", tag: "circle", attrs: { cx: 55, cy: 360, r: 16 } },
        { id: "flower-right", tag: "circle", attrs: { cx: 345, cy: 360, r: 16 } },
      ]),
      lines: [
        "M335 60 Q340 67 345 60",
        "M35 300 Q45 308 55 300 M335 300 Q345 308 355 300",
        "M55 376 V395 M345 376 V395",
        "M192 288 L196 280 L200 288 M204 288 L208 280 L212 288",
      ],
    },
    {
      id: "rocket",
      name: { id: "Roket", en: "Rocket" },
      regions: [
        sky,
        { id: "planet", tag: "circle", attrs: { cx: 325, cy: 80, r: 35 } },
        { id: "planet-ring", tag: "ellipse", attrs: { cx: 325, cy: 80, rx: 50, ry: 12, transform: "rotate(-20 325 80)" } },
        { id: "moon", tag: "circle", attrs: { cx: 65, cy: 155, r: 24 } },
        { id: "star1", tag: "path", attrs: { d: star(65, 65, 20, 9) } },
        { id: "star2", tag: "path", attrs: { d: star(85, 235, 18, 8) } },
        { id: "star3", tag: "path", attrs: { d: star(335, 215, 18, 8) } },
        { id: "star4", tag: "path", attrs: { d: star(60, 320, 18, 8) } },
        { id: "flame", tag: "path", attrs: { d: "M155 264 Q200 365 245 264 Z" } },
        { id: "flame-inner", tag: "path", attrs: { d: "M175 264 Q200 320 225 264 Z" } },
        { id: "smoke1", tag: "path", attrs: { d: "M115 390 C95 355 105 325 138 325 C152 305 182 305 200 320 C218 305 248 305 262 325 C295 325 305 355 285 390 Z" } },
        { id: "smoke2", tag: "path", attrs: { d: "M145 385 C135 360 145 340 170 340 C182 328 202 328 215 340 C240 340 250 360 240 385 Z" } },
        { id: "fin-left", tag: "path", attrs: { d: "M150 195 L95 275 L150 262 Z" } },
        { id: "fin-right", tag: "path", attrs: { d: "M250 195 L305 275 L250 262 Z" } },
        { id: "body", tag: "path", attrs: { d: "M200 50 C245 92 254 158 254 266 L146 266 C146 158 155 92 200 50 Z" } },
        { id: "nose", tag: "path", clip: "body", attrs: { d: "M120 40 H280 V125 H120 Z" } },
        { id: "window", tag: "circle", attrs: { cx: 200, cy: 170, r: 28 } },
        { id: "astronaut", tag: "circle", attrs: { cx: 200, cy: 172, r: 18 } },
      ],
      lines: [
        "M188 158 L192 165 M212 158 L208 165 M197 178 Q200 182 203 178",
        "M320 80 Q325 87 330 80",
        "M60 155 Q65 160 70 155",
        "M160 210 H240 M160 240 H240",
      ],
    },
    {
      id: "dinosaur",
      name: { id: "Dinosaurus", en: "Dinosaur" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 65, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(140, 100, 0.85) } },
        { id: "volcano", tag: "path", attrs: { d: "M305 326 L338 185 H372 L405 326 Z" } },
        { id: "volcano-smoke", tag: "circle", attrs: { cx: 355, cy: 160, r: 22 } },
        ground(326),
        { id: "tail", tag: "path", attrs: { d: "M132 238 Q65 235 22 272 Q20 282 36 284 Q82 272 134 278 Z" } },
        { id: "spike1", tag: "path", attrs: { d: "M135 210 Q145 170 160 205 Z" } },
        { id: "spike2", tag: "path", attrs: { d: "M170 202 Q185 160 200 200 Z" } },
        { id: "spike3", tag: "path", attrs: { d: "M210 202 Q225 165 238 215 Z" } },
        { id: "leg1", tag: "rect", attrs: { x: 122, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg2", tag: "rect", attrs: { x: 164, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg3", tag: "rect", attrs: { x: 220, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "leg4", tag: "rect", attrs: { x: 262, y: 266, width: 32, height: 72, rx: 12 } },
        { id: "neck", tag: "path", attrs: { d: "M246 222 C258 158 268 118 288 90 L320 102 C302 132 294 178 292 238 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 248, rx: 96, ry: 56 } },
        { id: "spot1", tag: "circle", clip: "body", attrs: { cx: 168, cy: 228, r: 16 } },
        { id: "spot2", tag: "circle", clip: "body", attrs: { cx: 216, cy: 214, r: 14 } },
        { id: "spot3", tag: "circle", clip: "body", attrs: { cx: 140, cy: 270, r: 12 } },
        { id: "bush", tag: "path", attrs: { d: cloud(295, 332, 0.75) } },
        { id: "head", tag: "ellipse", attrs: { cx: 314, cy: 92, rx: 36, ry: 25 } },
        { id: "eye", tag: "circle", attrs: { cx: 320, cy: 82, r: 11 } },
        { id: "cheek", tag: "circle", attrs: { cx: 298, cy: 98, r: 9 } },
      ],
      lines: [
        "M316 102 Q328 112 342 100",
        "M323 82 A3 3 0 1 1 323 80",
        "M60 65 Q65 72 70 65",
        "M128 335 Q130 330 134 335 M138 335 Q140 330 144 335",
      ],
    },
    {
      id: "cat",
      name: { id: "Kucing", en: "Cat" },
      regions: [
        sky,
        { id: "picture-frame", tag: "rect", attrs: { x: 25, y: 55, width: 68, height: 55, rx: 6 } },
        { id: "window", tag: "rect", attrs: { x: 308, y: 50, width: 70, height: 90, rx: 6 } },
        { id: "floor", tag: "rect", attrs: { x: 0, y: 295, width: 400, height: 105 } },
        { id: "rug", tag: "ellipse", attrs: { cx: 200, cy: 355, rx: 174, ry: 34 } },
        { id: "yarn", tag: "circle", attrs: { cx: 66, cy: 322, r: 32 } },
        { id: "tail", tag: "path", attrs: { d: "M262 318 C334 328 356 266 326 232 C316 222 302 232 308 244 C326 272 312 298 256 292 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 268, rx: 78, ry: 84 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 290, rx: 46, ry: 56 } },
        { id: "paw-left", tag: "ellipse", attrs: { cx: 170, cy: 344, rx: 25, ry: 15 } },
        { id: "paw-right", tag: "ellipse", attrs: { cx: 230, cy: 344, rx: 25, ry: 15 } },
        { id: "ear-left", tag: "path", attrs: { d: "M132 136 L136 54 L196 104 Z" } },
        { id: "ear-inner-left", tag: "path", attrs: { d: "M146 118 L146 74 L180 102 Z" } },
        { id: "ear-right", tag: "path", attrs: { d: "M268 136 L264 54 L204 104 Z" } },
        { id: "ear-inner-right", tag: "path", attrs: { d: "M254 118 L254 74 L220 102 Z" } },
        { id: "head", tag: "circle", attrs: { cx: 200, cy: 150, r: 72 } },
        { id: "eye-left", tag: "ellipse", attrs: { cx: 170, cy: 140, rx: 15, ry: 18 } },
        { id: "eye-right", tag: "ellipse", attrs: { cx: 230, cy: 140, rx: 15, ry: 18 } },
        { id: "pupil-left", tag: "ellipse", attrs: { cx: 172, cy: 142, rx: 9, ry: 12 } },
        { id: "pupil-right", tag: "ellipse", attrs: { cx: 228, cy: 142, rx: 9, ry: 12 } },
        { id: "cheek-left", tag: "circle", attrs: { cx: 144, cy: 172, r: 11 } },
        { id: "cheek-right", tag: "circle", attrs: { cx: 256, cy: 172, r: 11 } },
        { id: "nose", tag: "path", attrs: { d: "M192 168 L208 168 L200 178 Z" } },
      ],
      lines: [
        "M200 178 Q192 192 182 186 M200 178 Q208 192 218 186",
        "M152 178 L108 172 M152 188 L108 194 M248 178 L292 172 M248 188 L292 194",
        "M42 306 Q66 326 92 304 M36 326 Q66 346 98 324 M54 294 Q78 324 64 352 M98 330 Q124 350 140 340",
        "M343 50 V140 M308 95 H378",
        "M45 82 Q58 70 70 82 L78 74 L78 90 L70 82 Z",
      ],
    },
    {
      id: "turtle",
      name: { id: "Kura-kura", en: "Turtle" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 65, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(150, 95, 0.9) } },
        { id: "sea", tag: "path", attrs: { d: "M0 185 Q100 170 200 185 T400 185 V310 H0 Z" } },
        ground(300, "sand"),
        { id: "starfish", tag: "path", attrs: { d: star(345, 350, 26, 12) } },
        { id: "pebble1", tag: "ellipse", attrs: { cx: 80, cy: 360, rx: 16, ry: 11 } },
        { id: "pebble2", tag: "ellipse", attrs: { cx: 125, cy: 370, rx: 14, ry: 9 } },
        { id: "tail", tag: "path", attrs: { d: "M112 262 L70 278 L114 284 Z" } },
        { id: "leg-back", tag: "rect", attrs: { x: 118, y: 260, width: 36, height: 56, rx: 14 } },
        { id: "leg-front", tag: "rect", attrs: { x: 236, y: 260, width: 38, height: 56, rx: 14 } },
        { id: "head", tag: "ellipse", attrs: { cx: 320, cy: 230, rx: 48, ry: 34 } },
        { id: "shell", tag: "path", attrs: { d: "M96 280 C100 162 300 162 304 280 Z" } },
        { id: "plate-left", tag: "path", clip: "shell", attrs: { d: hexagon(140, 248, 30) } },
        { id: "plate-mid", tag: "path", attrs: { d: hexagon(200, 236, 32) } },
        { id: "plate-right", tag: "path", clip: "shell", attrs: { d: hexagon(260, 248, 30) } },
        { id: "rim", tag: "rect", attrs: { x: 86, y: 270, width: 228, height: 22, rx: 11 } },
        { id: "eye", tag: "circle", attrs: { cx: 334, cy: 218, r: 11 } },
        { id: "cheek", tag: "circle", attrs: { cx: 315, cy: 242, r: 9 } },
        { id: "bubble1", tag: "circle", attrs: { cx: 378, cy: 195, r: 13 } },
        { id: "bubble2", tag: "circle", attrs: { cx: 390, cy: 160, r: 10 } },
      ],
      lines: [
        "M342 238 Q354 248 364 236",
        "M14 235 Q30 225 46 235 Q62 245 78 235 M350 275 Q364 266 376 275 Q388 284 398 275",
        "M60 65 Q65 72 70 65",
      ],
    },
    {
      id: "train",
      name: { id: "Kereta", en: "Train" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 65, cy: 65, r: 32 } },
        { id: "hill", tag: "path", attrs: { d: "M0 285 Q120 235 240 265 T400 245 V340 H0 Z" } },
        { id: "smoke-big", tag: "circle", attrs: { cx: 242, cy: 52, r: 34 } },
        { id: "smoke3", tag: "circle", attrs: { cx: 288, cy: 82, r: 26 } },
        { id: "smoke-small", tag: "circle", attrs: { cx: 318, cy: 116, r: 20 } },
        { id: "ground", tag: "rect", attrs: { x: 0, y: 335, width: 400, height: 65 } },
        { id: "rail", tag: "rect", attrs: { x: 0, y: 324, width: 400, height: 14, rx: 3 } },
        { id: "wagon", tag: "rect", attrs: { x: 22, y: 195, width: 154, height: 100, rx: 8 } },
        { id: "window-left", tag: "rect", attrs: { x: 40, y: 214, width: 50, height: 42, rx: 6 } },
        { id: "window-right", tag: "rect", attrs: { x: 108, y: 214, width: 50, height: 42, rx: 6 } },
        { id: "chimney", tag: "path", attrs: { d: "M306 212 L296 138 L340 138 L330 212 Z" } },
        { id: "cab", tag: "rect", attrs: { x: 194, y: 170, width: 84, height: 126, rx: 5 } },
        { id: "roof", tag: "rect", attrs: { x: 184, y: 150, width: 104, height: 24, rx: 6 } },
        { id: "cab-window", tag: "rect", attrs: { x: 212, y: 188, width: 48, height: 44, rx: 6 } },
        { id: "boiler", tag: "rect", attrs: { x: 278, y: 208, width: 100, height: 88, rx: 12 } },
        { id: "lamp", tag: "circle", attrs: { cx: 366, cy: 238, r: 12 } },
        { id: "cowcatcher", tag: "path", attrs: { d: "M376 264 L398 312 L376 312 Z" } },
        { id: "wheel1", tag: "circle", attrs: { cx: 60, cy: 306, r: 22 } },
        { id: "wheel2", tag: "circle", attrs: { cx: 138, cy: 306, r: 22 } },
        { id: "wheel3", tag: "circle", attrs: { cx: 232, cy: 300, r: 28 } },
        { id: "wheel4", tag: "circle", attrs: { cx: 304, cy: 306, r: 22 } },
        { id: "wheel5", tag: "circle", attrs: { cx: 352, cy: 306, r: 22 } },
      ],
      lines: [
        "M176 286 H194",
        "M302 210 V296 M330 210 V296",
        "M232 300 L304 306 L352 306",
        "M40 338 V365 M80 338 V365 M120 338 V365 M160 338 V365 M200 338 V365 M240 338 V365 M280 338 V365 M320 338 V365 M360 338 V365",
        "M60 65 Q65 72 70 65",
      ],
    },
    {
      id: "sailboat",
      name: { id: "Perahu layar", en: "Sailboat" },
      regions: [
        sky,
        { id: "sun", tag: "circle", attrs: { cx: 340, cy: 65, r: 32 } },
        { id: "cloud", tag: "path", attrs: { d: cloud(20, 115, 0.8) } },
        { id: "cloud-mid", tag: "path", attrs: { d: cloud(95, 65, 0.6) } },
        { id: "sea", tag: "path", attrs: { d: "M0 270 Q50 258 100 270 T200 270 T300 270 T400 270 V400 H0 Z" } },
        { id: "wave", tag: "path", attrs: { d: "M0 322 Q50 310 100 322 T200 322 T300 322 T400 322 V400 H0 Z" } },
        { id: "wave-front", tag: "path", attrs: { d: "M0 365 Q50 352 100 365 T200 365 T300 365 T400 365 V400 H0 Z" } },
        { id: "mast", tag: "rect", attrs: { x: 194, y: 38, width: 14, height: 236, rx: 4 } },
        { id: "flag", tag: "path", attrs: { d: "M208 40 L256 54 L208 68 Z" } },
        { id: "sail-main", tag: "path", attrs: { d: "M212 72 Q285 160 336 254 L212 254 Z" } },
        { id: "sail-stripe", tag: "path", clip: "sail-main", attrs: { d: "M205 175 H345 V208 H205 Z" } },
        { id: "sail-front", tag: "path", attrs: { d: "M188 95 L188 254 L88 254 Q140 175 188 95 Z" } },
        { id: "hull", tag: "path", attrs: { d: "M70 262 L330 262 Q310 328 285 330 L115 330 Q90 328 70 262 Z" } },
        { id: "hull-stripe", tag: "path", clip: "hull", attrs: { d: "M50 280 H350 V300 H50 Z" } },
        { id: "lifebuoy", tag: "circle", attrs: { cx: 198, cy: 295, r: 16 } },
      ],
      lines: [
        "M75 140 Q85 130 95 140 Q105 130 115 140 M262 118 Q272 108 282 118 Q292 108 302 118",
        "M335 65 Q340 72 345 65",
        "M198 279 V311 M182 295 H214",
      ],
    },
    {
      id: "ice-cream",
      name: { id: "Es krim", en: "Ice cream" },
      regions: [
        sky,
        { id: "heart", tag: "path", attrs: { d: "M330 115 C288 85 298 48 330 68 C362 48 372 85 330 115 Z" } },
        { id: "star-left", tag: "path", attrs: { d: star(65, 85, 26, 11) } },
        { id: "candy-left", tag: "circle", attrs: { cx: 65, cy: 215, r: 16 } },
        { id: "star-low", tag: "path", attrs: { d: star(65, 310, 22, 9) } },
        { id: "candy-right", tag: "circle", attrs: { cx: 340, cy: 210, r: 18 } },
        { id: "star-right", tag: "path", attrs: { d: star(335, 305, 24, 10) } },
        { id: "cone", tag: "path", attrs: { d: "M130 226 L270 226 L200 385 Z" } },
        { id: "cone-rim", tag: "rect", attrs: { x: 122, y: 218, width: 156, height: 18, rx: 6 } },
        { id: "scoop-bottom", tag: "path", attrs: { d: "M120 234 C100 148 300 148 280 234 Q264 254 248 234 Q232 254 216 234 Q200 254 184 234 Q168 254 152 234 Q136 248 120 234 Z" } },
        { id: "scoop-top", tag: "path", attrs: { d: "M148 184 C134 100 266 100 252 184 Q239 200 226 184 Q213 200 200 184 Q187 200 174 184 Q161 200 148 184 Z" } },
        { id: "syrup", tag: "path", clip: "scoop-top", attrs: { d: "M140 100 H260 V155 Q245 170 230 145 Q215 175 200 140 Q185 170 170 145 Q155 165 140 150 Z" } },
        { id: "cherry", tag: "circle", attrs: { cx: 200, cy: 96, r: 20 } },
        { id: "wafer", tag: "path", attrs: { d: "M224 145 L266 65 L280 73 L242 155 Z" } },
      ],
      lines: [
        "M140 245 L234 305 M156 285 L218 342 M174 325 L202 380 M260 245 L166 305 M244 285 L182 342 M226 325 L198 380",
        "M200 76 Q204 50 228 40 M214 56 Q228 50 225 62",
        "M49 215 L35 205 L35 225 Z M81 215 L95 205 L95 225 Z M322 210 L308 200 L308 220 Z M358 210 L372 200 L372 220 Z",
        "M165 145 L175 140 M225 150 L230 142 M180 165 L188 170 M215 162 L222 168 M145 210 L155 205 M245 205 L252 212 M195 215 L205 210",
      ],
    },
    {
      id: "owl",
      name: { id: "Burung hantu", en: "Owl" },
      regions: [
        sky,
        { id: "moon", tag: "circle", attrs: { cx: 335, cy: 75, r: 36 } },
        { id: "star1", tag: "path", attrs: { d: star(65, 70, 20, 9) } },
        { id: "star2", tag: "path", attrs: { d: star(345, 195, 18, 8) } },
        { id: "star3", tag: "path", attrs: { d: star(95, 155, 16, 7) } },
        { id: "star4", tag: "path", attrs: { d: star(50, 245, 16, 7) } },
        { id: "branch", tag: "path", attrs: { d: "M0 315 C120 295 260 325 400 290 L400 322 C260 354 120 324 0 342 Z" } },
        { id: "leaf", tag: "path", attrs: { d: "M315 310 Q335 270 375 270 Q360 310 315 310 Z" } },
        { id: "leaf2", tag: "path", attrs: { d: "M285 320 Q295 355 330 350 Q315 325 285 320 Z" } },
        { id: "tuft-left", tag: "path", attrs: { d: "M146 160 L122 74 L184 132 Z" } },
        { id: "tuft-right", tag: "path", attrs: { d: "M254 160 L278 74 L216 132 Z" } },
        { id: "body", tag: "ellipse", attrs: { cx: 200, cy: 224, rx: 86, ry: 98 } },
        { id: "belly", tag: "ellipse", clip: "body", attrs: { cx: 200, cy: 268, rx: 52, ry: 60 } },
        { id: "wing-left", tag: "path", attrs: { d: "M120 196 C86 240 98 300 148 320 C140 280 140 236 120 196 Z" } },
        { id: "wing-right", tag: "path", attrs: { d: "M280 196 C314 240 302 300 252 320 C260 280 260 236 280 196 Z" } },
        { id: "ring-left", tag: "circle", attrs: { cx: 166, cy: 172, r: 32 } },
        { id: "ring-right", tag: "circle", attrs: { cx: 234, cy: 172, r: 32 } },
        { id: "eye-left", tag: "circle", attrs: { cx: 166, cy: 172, r: 18 } },
        { id: "eye-right", tag: "circle", attrs: { cx: 234, cy: 172, r: 18 } },
        { id: "pupil-left", tag: "circle", attrs: { cx: 168, cy: 174, r: 10 } },
        { id: "pupil-right", tag: "circle", attrs: { cx: 232, cy: 174, r: 10 } },
        { id: "cheek-left", tag: "circle", attrs: { cx: 130, cy: 205, r: 10 } },
        { id: "cheek-right", tag: "circle", attrs: { cx: 270, cy: 205, r: 10 } },
        { id: "beak", tag: "path", attrs: { d: "M188 198 L212 198 L200 222 Z" } },
        { id: "foot-left", tag: "ellipse", attrs: { cx: 172, cy: 322, rx: 17, ry: 10 } },
        { id: "foot-right", tag: "ellipse", attrs: { cx: 228, cy: 322, rx: 17, ry: 10 } },
      ],
      lines: [
        "M180 254 Q187 262 194 254 M206 254 Q213 262 220 254 M193 280 Q200 288 207 280 M180 306 Q187 314 194 306 M206 306 Q213 314 220 306",
        "M328 72 Q334 78 340 72",
      ],
    },
    {
      id: "planet",
      name: { id: "Planet", en: "Planet" },
      regions: [
        sky,
        { id: "star1", tag: "path", attrs: { d: star(335, 60, 22, 10) } },
        { id: "star4", tag: "path", attrs: { d: star(320, 165, 16, 7) } },
        { id: "star2", tag: "path", attrs: { d: star(355, 330, 18, 8) } },
        { id: "star3", tag: "path", attrs: { d: star(190, 355, 16, 7) } },
        { id: "ufo-saucer", tag: "ellipse", attrs: { cx: 80, cy: 155, rx: 36, ry: 14 } },
        { id: "ufo-dome", tag: "ellipse", attrs: { cx: 80, cy: 142, rx: 20, ry: 16 } },
        { id: "comet-tail", tag: "path", attrs: { d: "M20 20 L150 60 L130 88 Z" } },
        { id: "comet", tag: "circle", attrs: { cx: 145, cy: 75, r: 18 } },
        { id: "ring-back", tag: "path", attrs: { d: "M85 214 A145 36 0 0 1 375 214 L335 214 A105 22 0 0 0 125 214 Z" } },
        { id: "planet", tag: "circle", attrs: { cx: 230, cy: 210, r: 80 } },
        { id: "stripe-top", tag: "path", clip: "planet", attrs: { d: "M140 166 Q230 146 320 166 V184 Q230 164 140 184 Z" } },
        { id: "stripe-low", tag: "path", clip: "planet", attrs: { d: "M140 252 Q230 272 320 252 V270 Q230 290 140 270 Z" } },
        { id: "ring-front", tag: "path", attrs: { d: "M85 214 A145 36 0 0 0 375 214 L335 214 A105 22 0 0 1 125 214 Z" } },
        { id: "moon", tag: "circle", attrs: { cx: 75, cy: 310, r: 45 } },
        { id: "crater1", tag: "circle", clip: "moon", attrs: { cx: 62, cy: 295, r: 12 } },
        { id: "crater2", tag: "circle", clip: "moon", attrs: { cx: 95, cy: 308, r: 10 } },
        { id: "crater3", tag: "circle", clip: "moon", attrs: { cx: 70, cy: 334, r: 10 } },
      ],
      lines: [
        "M222 214 Q230 224 238 214",
        "M75 292 Q78 288 82 292",
        "M60 155 A2.5 2.5 0 1 1 60 152 M80 157 A2.5 2.5 0 1 1 80 154 M100 155 A2.5 2.5 0 1 1 100 152",
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
