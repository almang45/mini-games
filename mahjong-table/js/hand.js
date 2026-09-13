// Hand analysis: exact win-shape decomposition and shanten (distance-to-tenpai)
// calculation. Pure functions over 34-length "counts" arrays (index i = how many of
// tile-kind i are held). No DOM dependency - loadable via <script> (global MJ.hand)
// or require() in Node.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { hand: factory(root.MJ.tiles) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles) {
  "use strict";

  const { KIND_COUNT, suitOf, rankOf, isHonor } = tiles;

  function sameSuitAdj(i) {
    // i, i+1 form a valid two-tile run partial (needs rank <= 8, non-honor, same suit)
    if (isHonor(i) || rankOf(i) >= 9) return false;
    return suitOf(i) === suitOf(i + 1);
  }
  function sameSuitGap(i) {
    // i, i+2 form a kanchan (closed wait) partial (needs rank <= 7, non-honor, same suit)
    if (isHonor(i) || rankOf(i) >= 8) return false;
    return suitOf(i) === suitOf(i + 2);
  }
  function sameSuitRun(i) {
    // i, i+1, i+2 form a complete run (needs rank <= 7, non-honor, same suit)
    if (isHonor(i) || rankOf(i) >= 8) return false;
    return suitOf(i) === suitOf(i + 1) && suitOf(i + 1) === suitOf(i + 2);
  }

  // ---------------------------------------------------------------------
  // Exact decomposition: every way to split `counts` into `setsNeeded` complete
  // sets (triplet or run) plus exactly one pair, using ALL tiles in counts.
  // Used for definitive win validation and for yaku detection (which needs to
  // see every valid grouping, since yaku like pinfu/sanshoku are shape-specific).
  // ---------------------------------------------------------------------
  function decomposeConcealed(counts, setsNeeded) {
    const need = setsNeeded * 3 + 2;
    const total = counts.reduce((a, b) => a + b, 0);
    if (total !== need) return [];

    const work = counts.slice();
    const results = [];

    function rec(i, setsLeft, pairUsed, sets, pairKind) {
      while (i < KIND_COUNT && work[i] === 0) i++;
      if (i === KIND_COUNT) {
        if (setsLeft === 0 && pairUsed) results.push({ sets: sets.slice(), pair: pairKind });
        return;
      }
      const c = work[i];

      const pairChoices = !pairUsed && c >= 2 ? [1, 0] : [0];
      for (const usePair of pairChoices) {
        const afterPair = c - usePair * 2;
        const tripletChoices = afterPair >= 3 ? [1, 0] : [0];
        for (const useTriplet of tripletChoices) {
          const remainder = afterPair - useTriplet * 3;
          if (remainder < 0) continue;
          if (setsLeft - useTriplet - remainder < 0) continue;
          if (remainder > 0 && !sameSuitRun(i)) continue;
          if (remainder > 0 && (work[i + 1] < remainder || work[i + 2] < remainder)) continue;

          work[i + 1] -= remainder;
          work[i + 2] -= remainder;
          const newSets = sets.slice();
          if (useTriplet) newSets.push({ type: "triplet", tile: i });
          for (let s = 0; s < remainder; s++) newSets.push({ type: "run", tile: i });

          rec(i + 1, setsLeft - useTriplet - remainder, pairUsed || !!usePair, newSets, usePair ? i : pairKind);

          work[i + 1] += remainder;
          work[i + 2] += remainder;
        }
      }
    }

    rec(0, setsNeeded, false, [], -1);
    return results;
  }

  function isCompleteStandard(counts, setsNeeded) {
    return decomposeConcealed(counts, setsNeeded).length > 0;
  }

  function isChiitoi(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    let pairs = 0, kinds = 0;
    for (let i = 0; i < KIND_COUNT; i++) {
      if (counts[i] === 0) continue;
      kinds++;
      if (counts[i] !== 2) return false; // four-of-a-kind can't count as two pairs
      pairs++;
    }
    return pairs === 7 && kinds === 7;
  }

  const KOKUSHI_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]; // terminals + honors

  function isKokushi(counts) {
    if (counts.reduce((a, b) => a + b, 0) !== 14) return false;
    for (let i = 0; i < KIND_COUNT; i++) {
      if (KOKUSHI_KINDS.includes(i)) continue;
      if (counts[i] !== 0) return false;
    }
    let hasPair = false, present = 0;
    for (const k of KOKUSHI_KINDS) {
      if (counts[k] === 0) return false;
      if (counts[k] > 2) return false;
      if (counts[k] === 2) hasPair = true;
      present++;
    }
    return present === 13 && hasPair;
  }

  // ---------------------------------------------------------------------
  // Shanten (distance-to-tenpai). shanten === 0 means tenpai (one more tile
  // needed to reach a valid win); shanten === -1 means already complete.
  // Operates on the CONCEALED portion only; `setsNeeded` = 4 minus the number
  // of sets already fixed by open melds (pon/chi/kan).
  // ---------------------------------------------------------------------
  function standardShanten(counts, setsNeeded) {
    const S = setsNeeded;
    const work = counts.slice();
    let best = 2 * S + 1; // worst case: nothing usable at all

    function finalize(melds, partials, pairUsed) {
      const shanten = 2 * S - 2 * melds - partials - (pairUsed ? 1 : 0);
      if (shanten < best) best = shanten;
    }

    function rec(i, melds, partials, pairUsed) {
      if (i === KIND_COUNT) { finalize(melds, partials, pairUsed); return; }
      if (work[i] === 0) { rec(i + 1, melds, partials, pairUsed); return; }

      const c = work[i];
      const budgetOpen = melds + partials < S;

      // reserve a pair as the head (once only, independent of the S budget)
      if (!pairUsed && c >= 2) {
        work[i] -= 2;
        rec(i, melds, partials, true);
        work[i] += 2;
      }
      // complete triplet
      if (budgetOpen && c >= 3) {
        work[i] -= 3;
        rec(i, melds + 1, partials, pairUsed);
        work[i] += 3;
      }
      // pair used as a proto-triplet partial (not the head)
      if (budgetOpen && c >= 2) {
        work[i] -= 2;
        rec(i, melds, partials + 1, pairUsed);
        work[i] += 2;
      }
      // adjacent two-tile run partial (i, i+1)
      if (budgetOpen && sameSuitAdj(i) && work[i + 1] >= 1) {
        work[i] -= 1; work[i + 1] -= 1;
        rec(i, melds, partials + 1, pairUsed);
        work[i] += 1; work[i + 1] += 1;
      }
      // kanchan two-tile run partial (i, i+2)
      if (budgetOpen && sameSuitGap(i) && work[i + 2] >= 1) {
        work[i] -= 1; work[i + 2] -= 1;
        rec(i, melds, partials + 1, pairUsed);
        work[i] += 1; work[i + 2] += 1;
      }
      // complete run (i, i+1, i+2)
      if (budgetOpen && sameSuitRun(i) && work[i + 1] >= 1 && work[i + 2] >= 1) {
        work[i] -= 1; work[i + 1] -= 1; work[i + 2] -= 1;
        rec(i, melds + 1, partials, pairUsed);
        work[i] += 1; work[i + 1] += 1; work[i + 2] += 1;
      }
      // discard one copy of kind i as isolated/unused
      work[i] -= 1;
      rec(i, melds, partials, pairUsed);
      work[i] += 1;
    }

    rec(0, 0, 0, false);
    return best;
  }

  function chiitoiShanten(counts) {
    let pairs = 0, kinds = 0;
    for (let i = 0; i < KIND_COUNT; i++) {
      if (counts[i] === 0) continue;
      kinds++;
      if (counts[i] >= 2) pairs++;
    }
    return 6 - pairs + Math.max(0, 7 - kinds);
  }

  function kokushiShanten(counts) {
    let present = 0, hasPair = false;
    for (const k of KOKUSHI_KINDS) {
      if (counts[k] >= 1) present++;
      if (counts[k] >= 2) hasPair = true;
    }
    return 13 - present - (hasPair ? 1 : 0);
  }

  // overall shanten across applicable hand shapes for the given ruleset context
  function shanten(counts, opts) {
    const setsNeeded = (opts && opts.setsNeeded) != null ? opts.setsNeeded : 4;
    let best = standardShanten(counts, setsNeeded);
    if (opts && opts.allowChiitoi && setsNeeded === 4) best = Math.min(best, chiitoiShanten(counts));
    if (opts && opts.allowKokushi && setsNeeded === 4) best = Math.min(best, kokushiShanten(counts));
    return best;
  }

  return {
    decomposeConcealed,
    isCompleteStandard,
    isChiitoi,
    isKokushi,
    standardShanten,
    chiitoiShanten,
    kokushiShanten,
    shanten,
    KOKUSHI_KINDS,
  };
});
