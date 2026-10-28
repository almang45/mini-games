const assert = require("assert");
const MIX = require("../mix.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const mix = (partial) => MIX.mixRecipe(MIX.recipeFrom(partial));
const named = (id) => MIX.NAMED_BY_ID[id];
const lightness = (rgb) => MIX.toOklab(rgb)[0];

// ---- paint behaviour kids are taught -------------------------------------------

(function primariesMixLikePaint() {
  const green = mix({ yellow: 1, blue: 1 });
  ok("blue + yellow is green, not grey", green[1] > green[0] + 60 && green[1] > green[2] + 40, green);
  ok("blue + yellow is named Green", MIX.nearestNamed(green).named.id === "green");
  ok("red + yellow is named Orange", MIX.nearestNamed(mix({ red: 1, yellow: 1 })).named.id === "orange");
  ok("red + blue is named Purple", MIX.nearestNamed(mix({ red: 1, blue: 1 })).named.id === "purple");
  ok("all three primaries make Brown", MIX.nearestNamed(mix({ red: 1, yellow: 1, blue: 1 })).named.id === "brown");
})();

(function onlyTheRatioMatters() {
  ok("2 red + 2 yellow equals 1 red + 1 yellow",
    MIX.toHex(mix({ red: 2, yellow: 2 })) === MIX.toHex(mix({ red: 1, yellow: 1 })));
  ok("3 blue equals 1 blue", MIX.toHex(mix({ blue: 3 })) === MIX.toHex(mix({ blue: 1 })));
  ok("2 red : 1 yellow differs from 1 : 1",
    MIX.distance(mix({ red: 2, yellow: 1 }), mix({ red: 1, yellow: 1 })) > MIX.MATCH_DISTANCE * 2);
})();

(function whiteTintsBlackShades() {
  const red = mix({ red: 1 });
  ok("white makes a color lighter", lightness(mix({ red: 1, white: 1 })) > lightness(red));
  ok("more white makes it lighter still", lightness(mix({ red: 1, white: 3 })) > lightness(mix({ red: 1, white: 1 })));
  ok("black makes a color darker", lightness(mix({ red: 1, black: 1 })) < lightness(red));
  const gray = mix({ white: 1, black: 1 });
  ok("white + black is a neutral grey", Math.max(...gray) - Math.min(...gray) <= 8, gray);
})();

(function emptyBowl() {
  ok("no drops mixes to nothing", MIX.mixRecipe(MIX.emptyRecipe()) === null);
  ok("empty recipe has zero drops", MIX.dropCount(MIX.emptyRecipe()) === 0);
  ok("dropCount sums every pigment", MIX.dropCount(MIX.recipeFrom({ red: 2, white: 1, black: 3 })) === 6);
})();

(function hexAndDistance() {
  ok("toHex pads each channel", MIX.toHex([0, 10, 255]) === "#000aff");
  ok("a color is zero distance from itself", MIX.distance([12, 200, 99], [12, 200, 99]) === 0);
  ok("black to white is roughly the full OKLab lightness range",
    Math.abs(MIX.distance([0, 0, 0], [255, 255, 255]) - 1) < 0.001);
})();

// ---- named colors ----------------------------------------------------------------

(function namedColorsAreUnambiguous() {
  const ids = MIX.NAMED.map((n) => n.id);
  ok("named ids are unique", new Set(ids).size === ids.length);
  // Two names closer than 2x the match radius would let one mix count as both.
  for (let i = 0; i < MIX.NAMED.length; i++) {
    for (let j = i + 1; j < MIX.NAMED.length; j++) {
      const a = MIX.NAMED[i];
      const b = MIX.NAMED[j];
      const d = MIX.distance(a.rgb, b.rgb);
      ok(a.id + " and " + b.id + " are told apart", d > MIX.MATCH_DISTANCE * 2, d);
    }
  }
  for (const n of MIX.NAMED) {
    ok(n.id + " is its own nearest name", MIX.nearestNamed(n.rgb).named === n);
    ok(n.id + " fits in the bowl", MIX.dropCount(n.recipe) >= 1 && MIX.dropCount(n.recipe) <= MIX.MAX_DROPS);
    ok(n.id + " has Indonesian and English names", Boolean(n.name.id) && Boolean(n.name.en));
  }
})();

// ---- challenge levels ------------------------------------------------------------

(function levelsAreSolvable() {
  ok("there are levels", MIX.LEVELS.length > 0);
  const targets = MIX.LEVELS.map((l) => l.target.id);
  ok("no level repeats a target", new Set(targets).size === targets.length);
  for (const level of MIX.LEVELS) {
    ok(level.target.id + " level has a target", Boolean(level.target));
    const missing = MIX.PIGMENTS.filter((p) => level.target.recipe[p] > 0 && !level.pots.includes(p));
    ok(level.target.id + " can be made from its own pots", missing.length === 0, missing);
    ok(level.target.id + " pots are real pigments", level.pots.every((p) => MIX.PIGMENTS.includes(p)));
  }
})();

console.log("mix.test.js: " + passed + " assertions passed");
