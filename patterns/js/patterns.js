// Pattern rules for Lanjutkan Pola: build a repeating row of beads, leave the end of the
// string empty, and check the beads a kid threads on. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const SHAPES = ["circle", "square", "triangle", "heart"];
  // Color ids from color-fusion/js/mix.js, so a bead is called what the paint is called.
  const COLORS = ["red", "yellow", "blue", "green", "orange", "purple", "pink", "indigo"];
  // Too alike side by side on a small bead, so they never share a string.
  const CLOSE_PAIRS = [["blue", "indigo"], ["purple", "indigo"], ["orange", "pink"]];
  const ROUNDS_PER_LEVEL = 3;

  // `unit` is the repeating core ("AAB" reads red, red, blue, red, red, blue...). `vary` says
  // what tells the beads apart: their color, their shape, or both at once (an easier cue).
  const LEVELS = [
    { id: "ab-color", unit: "AB", vary: "color" },
    { id: "ab-shape", unit: "AB", vary: "shape" },
    { id: "aab-color", unit: "AAB", vary: "color" },
    { id: "abb-color", unit: "ABB", vary: "color" },
    { id: "ab-both", unit: "AB", vary: "both" },
    { id: "abc-color", unit: "ABC", vary: "color" },
    { id: "aab-shape", unit: "AAB", vary: "shape" },
    { id: "aabb-color", unit: "AABB", vary: "color" },
    { id: "abc-shape", unit: "ABC", vary: "shape" },
    { id: "abc-both", unit: "ABC", vary: "both" },
    { id: "abcd-color", unit: "ABCD", vary: "color" },
    { id: "abac-color", unit: "ABAC", vary: "color" },
  ].map((level) => Object.freeze(level));

  function pick(list, rng) {
    return list[Math.floor(rng() * list.length)];
  }

  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const tooClose = (a, b) => CLOSE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));

  function pickColors(count, rng) {
    const chosen = [];
    for (const color of shuffle(COLORS, rng)) {
      if (chosen.length === count) break;
      if (!chosen.some((other) => tooClose(color, other))) chosen.push(color);
    }
    return chosen;
  }

  // `count` distinct beads that differ only in what the level varies.
  function makeBeads(vary, count, rng) {
    if (vary === "color") {
      const shape = pick(SHAPES, rng);
      return pickColors(count, rng).map((color) => ({ color, shape }));
    }
    if (vary === "shape") {
      const color = pick(COLORS, rng);
      return shuffle(SHAPES, rng).slice(0, count).map((shape) => ({ color, shape }));
    }
    const colors = pickColors(count, rng);
    return shuffle(SHAPES, rng).slice(0, count).map((shape, i) => ({ color: colors[i], shape }));
  }

  const lettersOf = (unit) => Array.from(new Set(unit));

  function blanksFor(unit) {
    return Math.max(2, Math.min(3, unit.length));
  }

  // Two full repeats are shown, then a few empty places to fill. The tray holds every bead
  // the pattern uses plus one that doesn't belong.
  function makeRound(level, rng) {
    const random = rng || Math.random;
    const letters = lettersOf(level.unit);
    const beads = makeBeads(level.vary, letters.length + 1, random);
    const byLetter = Object.fromEntries(letters.map((letter, i) => [letter, Object.freeze(beads[i])]));
    const odd = Object.freeze(beads[letters.length]);
    const shown = level.unit.length * 2;
    const length = shown + blanksFor(level.unit);
    const sequence = Array.from({ length }, (_, i) => byLetter[level.unit[i % level.unit.length]]);
    return Object.freeze({
      level,
      sequence,
      shown,
      blanks: length - shown,
      choices: shuffle(letters.map((letter) => byLetter[letter]).concat([odd]), random),
    });
  }

  function sameBead(a, b) {
    return a.color === b.color && a.shape === b.shape;
  }

  // The bead that belongs in empty place `slot` (0 = the first empty one).
  function expected(round, slot) {
    return round.sequence[round.shown + slot];
  }

  const api = {
    SHAPES,
    COLORS,
    CLOSE_PAIRS,
    ROUNDS_PER_LEVEL,
    LEVELS,
    makeRound,
    sameBead,
    expected,
    shuffle,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PATTERNS = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
