const assert = require("assert");
const PATTERNS = require("../patterns.js");
const MIX = require("../../../color-fusion/js/mix.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// Small seeded generator so every run checks the same rounds.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (bead) => bead.color + "/" + bead.shape;

(function paletteComesFromColorFusion() {
  for (const color of PATTERNS.COLORS) ok(color + " is a Color Fusion color", Boolean(MIX.NAMED_BY_ID[color]));
  const closeIds = new Set(PATTERNS.CLOSE_PAIRS.map((pair) => pair.slice().sort().join("+")));
  for (let i = 0; i < PATTERNS.COLORS.length; i++) {
    for (let j = i + 1; j < PATTERNS.COLORS.length; j++) {
      const a = PATTERNS.COLORS[i];
      const b = PATTERNS.COLORS[j];
      if (closeIds.has([a, b].sort().join("+"))) continue;
      const d = MIX.distance(MIX.NAMED_BY_ID[a].rgb, MIX.NAMED_BY_ID[b].rgb);
      ok(a + " and " + b + " are easy to tell apart", d >= 0.15, d.toFixed(3));
    }
  }
})();

(function levelsAreWellFormed() {
  const ids = PATTERNS.LEVELS.map((l) => l.id);
  ok("level ids are unique", new Set(ids).size === ids.length);
  for (const level of PATTERNS.LEVELS) {
    const letters = new Set(level.unit).size;
    ok(level.id + " repeats at least two kinds of bead", letters >= 2);
    ok(level.id + " starts its unit with A", level.unit[0] === "A");
    if (level.vary !== "color") ok(level.id + " has enough shapes for the tray", letters + 1 <= PATTERNS.SHAPES.length);
  }
})();

(function roundsFollowTheirUnit() {
  for (const level of PATTERNS.LEVELS) {
    for (let seed = 1; seed <= 60; seed++) {
      const round = PATTERNS.makeRound(level, seeded(seed * 97 + level.id.length));
      const unit = level.unit;
      const label = level.id + " seed " + seed;
      ok(label + ": shows two repeats", round.shown === unit.length * 2);
      ok(label + ": leaves 2-3 places empty", round.blanks >= 2 && round.blanks <= 3 && round.sequence.length === round.shown + round.blanks);

      const letterBead = {};
      round.sequence.forEach((bead, i) => {
        const letter = unit[i % unit.length];
        if (letterBead[letter]) ok(label + ": letter " + letter + " is always the same bead", PATTERNS.sameBead(letterBead[letter], bead));
        else letterBead[letter] = bead;
      });
      const distinct = new Set(Object.values(letterBead).map(key));
      ok(label + ": different letters are different beads", distinct.size === Object.keys(letterBead).length);

      const shapes = new Set(round.sequence.map((b) => b.shape));
      const colors = new Set(round.sequence.map((b) => b.color));
      if (level.vary === "color") ok(label + ": one shape when colors vary", shapes.size === 1);
      if (level.vary === "shape") ok(label + ": one color when shapes vary", colors.size === 1);
      if (level.vary === "both") ok(label + ": color and shape both change", shapes.size === distinct.size && colors.size === distinct.size);
      const closeTogether = PATTERNS.CLOSE_PAIRS.some(([a, b]) => colors.has(a) && colors.has(b));
      ok(label + ": no look-alike colors on one string", !closeTogether);

      const choiceKeys = round.choices.map(key);
      ok(label + ": tray beads are all different", new Set(choiceKeys).size === choiceKeys.length);
      ok(label + ": tray has every bead the pattern uses", [...distinct].every((k) => choiceKeys.includes(k)));
      const odd = round.choices.filter((b) => !distinct.has(key(b)));
      ok(label + ": tray has exactly one bead that doesn't belong", odd.length === 1);
      const trayColors = new Set(round.choices.map((b) => b.color));
      ok(label + ": no look-alike colors in the tray", !PATTERNS.CLOSE_PAIRS.some(([a, b]) => trayColors.has(a) && trayColors.has(b)));
      for (let slot = 0; slot < round.blanks; slot++) {
        ok(label + ": slot " + slot + " expects the next bead in the unit",
          PATTERNS.sameBead(PATTERNS.expected(round, slot), letterBead[unit[(round.shown + slot) % unit.length]]));
      }
    }
  }
})();

(function shuffleKeepsEveryItem() {
  const list = [1, 2, 3, 4, 5, 6];
  const out = PATTERNS.shuffle(list, seeded(7));
  ok("shuffle keeps every item", out.slice().sort().join() === list.join());
  ok("shuffle doesn't touch its input", list.join() === "1,2,3,4,5,6");
})();

console.log("patterns.test.js: " + passed + " assertions passed");
