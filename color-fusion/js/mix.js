// Paint-mixing model for Color Fusion: drop counts in, an sRGB color out, plus the named
// colors and challenge levels built on top of it. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const PIGMENTS = ["red", "yellow", "blue", "white", "black"];
  const MAX_DROPS = 12;

  // Corners of the RYB cube from Gossett & Chen, "Paint Inspired Color Compositing" (2004),
  // retuned brighter for a kids' palette. Interpolating inside this cube is what makes
  // blue + yellow come out green; averaging plain RGB would give grey.
  const RYB_CORNERS = {
    "100": [226, 35, 43],   // red
    "010": [255, 210, 0],   // yellow
    "001": [28, 92, 200],   // blue
    "110": [248, 128, 16],  // orange
    "101": [118, 44, 156],  // purple
    "011": [26, 158, 76],   // green
    "111": [112, 68, 40],   // all three primaries: brown, as kids are taught
  };
  const WHITE = [255, 255, 255];
  const BLACK = [30, 30, 36];

  const PIGMENT_RGB = {
    red: RYB_CORNERS["100"],
    yellow: RYB_CORNERS["010"],
    blue: RYB_CORNERS["001"],
    white: WHITE,
    black: BLACK,
  };

  function emptyRecipe() {
    return { red: 0, yellow: 0, blue: 0, white: 0, black: 0 };
  }

  function recipeFrom(partial) {
    const recipe = emptyRecipe();
    for (const p of PIGMENTS) recipe[p] = partial[p] || 0;
    return recipe;
  }

  function dropCount(recipe) {
    return PIGMENTS.reduce((sum, p) => sum + recipe[p], 0);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Trilinear interpolation over the cube; the (0,0,0) corner is never needed because
  // rybToRgb always scales the strongest primary up to 1.
  function cube(r, y, b) {
    const corner = (cr, cy, cb) => RYB_CORNERS["" + cr + cy + cb] || WHITE;
    const out = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const c00 = lerp(corner(0, 0, 0)[i], corner(1, 0, 0)[i], r);
      const c10 = lerp(corner(0, 1, 0)[i], corner(1, 1, 0)[i], r);
      const c01 = lerp(corner(0, 0, 1)[i], corner(1, 0, 1)[i], r);
      const c11 = lerp(corner(0, 1, 1)[i], corner(1, 1, 1)[i], r);
      out[i] = lerp(lerp(c00, c10, y), lerp(c01, c11, y), b);
    }
    return out;
  }

  // Hue comes from the ratio of the primaries only, so 2 red + 2 yellow is the same orange as
  // 1 + 1. White and black then tint or shade that hue by their share of all the drops.
  function mixRecipe(recipe) {
    const chroma = recipe.red + recipe.yellow + recipe.blue;
    const total = chroma + recipe.white + recipe.black;
    if (total === 0) return null;

    const parts = [];
    if (chroma > 0) {
      const strongest = Math.max(recipe.red, recipe.yellow, recipe.blue);
      parts.push([cube(recipe.red / strongest, recipe.yellow / strongest, recipe.blue / strongest), chroma]);
    }
    if (recipe.white > 0) parts.push([WHITE, recipe.white]);
    if (recipe.black > 0) parts.push([BLACK, recipe.black]);

    const rgb = [0, 0, 0];
    for (const [color, weight] of parts) {
      for (let i = 0; i < 3; i++) rgb[i] += color[i] * weight / total;
    }
    return rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))));
  }

  function toHex(rgb) {
    return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  // OKLab (Ottosson, 2020): distances here track how different two colors look, which RGB
  // distances don't, so one match threshold works for pale and dark colors alike.
  function toOklab(rgb) {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675778 * s,
    ];
  }

  function distance(rgbA, rgbB) {
    const a = toOklab(rgbA);
    const b = toOklab(rgbB);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  // Close enough to count as making the color; NEAR is "almost there" encouragement.
  const MATCH_DISTANCE = 0.03;
  const NEAR_DISTANCE = 0.07;

  const NAMED = [
    { id: "red", recipe: { red: 1 }, name: { id: "Merah", en: "Red" } },
    { id: "yellow", recipe: { yellow: 1 }, name: { id: "Kuning", en: "Yellow" } },
    { id: "blue", recipe: { blue: 1 }, name: { id: "Biru", en: "Blue" } },
    { id: "white", recipe: { white: 1 }, name: { id: "Putih", en: "White" } },
    { id: "black", recipe: { black: 1 }, name: { id: "Hitam", en: "Black" } },
    { id: "orange", recipe: { red: 1, yellow: 1 }, name: { id: "Oranye", en: "Orange" } },
    { id: "green", recipe: { yellow: 1, blue: 1 }, name: { id: "Hijau", en: "Green" } },
    { id: "purple", recipe: { red: 1, blue: 1 }, name: { id: "Ungu", en: "Purple" } },
    { id: "red-orange", recipe: { red: 2, yellow: 1 }, name: { id: "Merah jingga", en: "Red-orange" } },
    { id: "yellow-orange", recipe: { red: 1, yellow: 2 }, name: { id: "Kuning jingga", en: "Yellow-orange" } },
    { id: "yellow-green", recipe: { yellow: 2, blue: 1 }, name: { id: "Kuning kehijauan", en: "Yellow-green" } },
    { id: "blue-green", recipe: { yellow: 1, blue: 2 }, name: { id: "Hijau kebiruan", en: "Blue-green" } },
    { id: "blue-violet", recipe: { red: 1, blue: 2 }, name: { id: "Biru keunguan", en: "Blue-violet" } },
    { id: "red-violet", recipe: { red: 2, blue: 1 }, name: { id: "Merah keunguan", en: "Red-violet" } },
    { id: "pink", recipe: { red: 1, white: 1 }, name: { id: "Merah muda", en: "Pink" } },
    { id: "light-blue", recipe: { blue: 1, white: 1 }, name: { id: "Biru muda", en: "Light blue" } },
    { id: "light-yellow", recipe: { yellow: 1, white: 1 }, name: { id: "Kuning muda", en: "Light yellow" } },
    { id: "lavender", recipe: { red: 1, blue: 1, white: 2 }, name: { id: "Ungu muda", en: "Lavender" } },
    { id: "light-green", recipe: { yellow: 1, blue: 1, white: 2 }, name: { id: "Hijau muda", en: "Light green" } },
    { id: "peach", recipe: { red: 1, yellow: 1, white: 2 }, name: { id: "Persik", en: "Peach" } },
    { id: "turquoise", recipe: { yellow: 1, blue: 2, white: 1 }, name: { id: "Toska", en: "Turquoise" } },
    { id: "gray", recipe: { white: 1, black: 1 }, name: { id: "Abu-abu", en: "Gray" } },
    { id: "maroon", recipe: { red: 2, black: 1 }, name: { id: "Merah marun", en: "Maroon" } },
    { id: "navy", recipe: { blue: 2, black: 1 }, name: { id: "Biru tua", en: "Navy" } },
    { id: "dark-green", recipe: { yellow: 1, blue: 1, black: 1 }, name: { id: "Hijau tua", en: "Dark green" } },
    { id: "brown", recipe: { red: 1, yellow: 1, blue: 1 }, name: { id: "Cokelat", en: "Brown" } },
    { id: "milk-chocolate", recipe: { red: 1, yellow: 1, blue: 1, white: 1 }, name: { id: "Cokelat susu", en: "Milk chocolate" } },
  ].map((entry) => {
    const recipe = recipeFrom(entry.recipe);
    return Object.freeze({ id: entry.id, recipe, name: entry.name, rgb: mixRecipe(recipe) });
  });
  const NAMED_BY_ID = Object.fromEntries(NAMED.map((n) => [n.id, n]));

  function nearestNamed(rgb) {
    let best = null;
    let bestDistance = Infinity;
    for (const named of NAMED) {
      const d = distance(rgb, named.rgb);
      if (d < bestDistance) { best = named; bestDistance = d; }
    }
    return { named: best, distance: bestDistance };
  }

  // Grouped so each stage teaches one idea; `pots` is what's on the table for that level.
  const STAGES = [
    { id: "secondary", pots: ["red", "yellow", "blue"], targets: ["orange", "green", "purple"] },
    { id: "light-dark", pots: ["red", "blue", "white", "black"], targets: ["pink", "light-blue", "gray", "navy"] },
    { id: "ratios", pots: ["red", "yellow", "blue"], targets: ["red-orange", "yellow-orange", "yellow-green", "blue-green", "blue-violet", "red-violet"] },
    { id: "expert", pots: PIGMENTS, targets: ["brown", "dark-green", "lavender", "turquoise", "peach", "maroon", "milk-chocolate"] },
  ];
  const LEVELS = STAGES.flatMap((stage) =>
    stage.targets.map((target) => Object.freeze({ stage: stage.id, pots: stage.pots, target: NAMED_BY_ID[target] })));

  const api = {
    PIGMENTS,
    PIGMENT_RGB,
    MAX_DROPS,
    MATCH_DISTANCE,
    NEAR_DISTANCE,
    NAMED,
    NAMED_BY_ID,
    STAGES,
    LEVELS,
    emptyRecipe,
    recipeFrom,
    dropCount,
    mixRecipe,
    toHex,
    toOklab,
    distance,
    nearestNamed,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MIX = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
