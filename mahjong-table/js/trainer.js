// Discard trainer ("what would you cut?"): ranks every discard from a 14-tile
// closed hand by shanten, then by ukeire - how many unseen tiles would move the
// hand one step closer to ready. Pure functions over 34-length counts arrays,
// same conventions as hand.js; <script> (global MJ.trainer) or require() in Node.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"), require("./hand.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { trainer: factory(root.MJ.tiles, root.MJ.hand) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, hand) {
  "use strict";

  const SHANTEN_OPTS = { setsNeeded: 4, allowChiitoi: true, allowKokushi: true }; // closed Riichi hand
  const MAX_DEAL_SHANTEN = 2;

  // Only the 14 tiles in hand count as seen - there's no table, discards, or dora here.
  function analyzeDiscards(counts) {
    const results = [];
    for (let k = 0; k < tiles.KIND_COUNT; k++) {
      if (counts[k] === 0) continue;
      const after = counts.slice();
      after[k]--;
      const shanten = hand.shanten(after, SHANTEN_OPTS);
      const waits = [];
      let ukeire = 0;
      for (let j = 0; j < tiles.KIND_COUNT; j++) {
        const unseen = 4 - counts[j];
        if (unseen === 0) continue;
        after[j]++;
        if (hand.shanten(after, SHANTEN_OPTS) < shanten) {
          waits.push(j);
          ukeire += unseen;
        }
        after[j]--;
      }
      results.push({ discard: k, shanten, ukeire, waits });
    }
    return results.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || a.discard - b.discard);
  }

  function isBest(results, choice) {
    return choice.shanten === results[0].shanten && choice.ukeire === results[0].ukeire;
  }

  // Rejection-samples a hand at most 2-shanten after its best discard (about 1
  // in 5 random deals) where at least one discard is worse than the best -
  // close enough to ready that the choice matters.
  function dealHand(rng) {
    for (;;) {
      const kinds = tiles.shuffle(tiles.buildWall(), rng).slice(0, 14).map((t) => t.kind);
      const counts = tiles.countsFromKinds(kinds);
      const results = analyzeDiscards(counts);
      if (results[0].shanten <= MAX_DEAL_SHANTEN && results.some((r) => !isBest(results, r))) {
        return { counts, drawn: kinds[13], results };
      }
    }
  }

  return { SHANTEN_OPTS, analyzeDiscards, isBest, dealHand };
});
