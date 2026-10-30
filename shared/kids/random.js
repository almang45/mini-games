// Randomness shared by the Kids games' rule modules. Takes an optional rng so tests can pass a
// seeded one. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  // Fisher-Yates on a copy; the input is left as it was.
  function shuffle(list, rng) {
    const random = rng || Math.random;
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  const api = { shuffle };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.KIDS_RANDOM = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
