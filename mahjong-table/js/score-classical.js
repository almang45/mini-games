// Chinese Classical scoring.
//
// "Chinese Classical" scoring varies significantly by source/region; there is no
// single authoritative table the way modern Riichi competitive rules are
// standardized. This module implements ONE clearly-defined, internally consistent
// traditional-style doubling variant:
//
//   score = BASE(8) x 2^doubles, capped at LIMIT_DOUBLES(8) => max 2048 points.
//   Instant-limit hand shapes (All Honors, All Terminals, Big Three/Four Dragons
//   or Winds) score at the limit directly.
//
// Payment (the classical convention that distinguishes it from Riichi):
//   - Won by discard: only the discarder pays the full score.
//   - Won by self-draw: EVERY other player pays the full score (not split/reduced).
//   - Dealer win: payment amounts are doubled.
//
// No riichi, dora, or ura-dora concepts (those are Japanese-specific and did not
// exist in classical play).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"), require("./hand.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { scoreClassical: factory(root.MJ.tiles, root.MJ.hand) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, hand) {
  "use strict";

  const BASE_POINTS = 8;
  const LIMIT_DOUBLES = 8;

  function buildGroups(concealedSets, openMelds) {
    const groups = [];
    for (const m of openMelds) {
      if (m.type === "chi") groups.push({ type: "run", tile: m.tiles[0], concealed: false });
      else if (m.type === "pon") groups.push({ type: "triplet", tile: m.tiles[0], concealed: false });
      else if (m.type === "kan") groups.push({ type: "kan", tile: m.tiles[0], concealed: !!m.concealed });
    }
    for (const s of concealedSets) {
      groups.push({ type: s.type === "triplet" ? "triplet" : "run", tile: s.tile, concealed: true });
    }
    return groups;
  }

  function classifyWaitSimple(concealedSets, pairKind, winTile) {
    if (pairKind === winTile) return "tanki";
    for (const s of concealedSets) {
      if (s.type === "triplet" && s.tile === winTile) return "shanpon";
      if (s.type === "run") {
        const r = tiles.rankOf(s.tile);
        if (winTile === s.tile) return r === 7 ? "penchan" : "ryanmen";
        if (winTile === s.tile + 1) return "kanchan";
        if (winTile === s.tile + 2) return r === 1 ? "penchan" : "ryanmen";
      }
    }
    return "ryanmen";
  }

  function evaluatePatterns(concealedSets, pairKind, groups, isMenzen, winBy, seatWind, roundWind, wait) {
    const patterns = [];
    const nonRun = groups.filter((g) => g.type !== "run");
    const windTriplets = nonRun.filter((g) => tiles.isWind(g.tile));
    const dragonTriplets = nonRun.filter((g) => tiles.isDragon(g.tile));

    // instant-limit shapes
    if (groups.every((g) => g.type !== "run" && tiles.isHonor(g.tile)) && tiles.isHonor(pairKind)) {
      return { patterns: [{ name: "All Honors", limit: true }], isLimit: true };
    }
    if (groups.every((g) => g.type !== "run" && tiles.isTerminal(g.tile)) && tiles.isTerminal(pairKind)) {
      return { patterns: [{ name: "All Terminals", limit: true }], isLimit: true };
    }
    if (dragonTriplets.length === 3) return { patterns: [{ name: "Great Three Dragons", limit: true }], isLimit: true };
    if (windTriplets.length === 4) return { patterns: [{ name: "Great Four Winds", limit: true }], isLimit: true };

    if (windTriplets.length === 3 && tiles.isWind(pairKind)) patterns.push({ name: "Small Four Winds", doubles: 3 });
    if (dragonTriplets.length === 2 && tiles.isDragon(pairKind)) patterns.push({ name: "Small Three Dragons", doubles: 2 });
    for (const g of dragonTriplets) patterns.push({ name: "Dragon Triplet (" + tiles.nameOf(g.tile) + ")", doubles: 1 });
    if (nonRun.some((g) => g.tile === seatWind)) patterns.push({ name: "Seat Wind Triplet", doubles: 1 });
    if (nonRun.some((g) => g.tile === roundWind)) patterns.push({ name: "Round Wind Triplet", doubles: 1 });

    if (nonRun.length === 4) patterns.push({ name: "All Triplets (Peng Peng Hu)", doubles: 1 });

    const allSimples = groups.every((g) => {
      if (g.type === "run") { const r = tiles.rankOf(g.tile); return r >= 2 && r <= 6; }
      return tiles.isSimple(g.tile);
    }) && tiles.isSimple(pairKind);
    if (allSimples) patterns.push({ name: "All Simples", doubles: 1 });

    const suitsUsed = new Set();
    let hasHonor = tiles.isHonor(pairKind);
    for (const g of groups) {
      if (g.type === "run") suitsUsed.add(tiles.suitOf(g.tile));
      else if (tiles.isHonor(g.tile)) hasHonor = true;
      else suitsUsed.add(tiles.suitOf(g.tile));
    }
    if (!tiles.isHonor(pairKind)) suitsUsed.add(tiles.suitOf(pairKind));
    if (suitsUsed.size === 1) patterns.push({ name: hasHonor ? "Half Flush" : "Full Flush", doubles: hasHonor ? 1 : 3 });

    if (isMenzen && winBy === "discard") patterns.push({ name: "Concealed Hand", doubles: 1 });
    if (winBy === "self-draw") patterns.push({ name: "Self-Drawn", doubles: 1 });
    if (wait === "tanki" || wait === "kanchan" || wait === "penchan") patterns.push({ name: "Closed Wait", doubles: 1 });

    return { patterns, isLimit: false };
  }

  // input mirrors yaku-riichi's evaluateWin but winBy is 'discard' | 'self-draw',
  // and there is no seat/round-wind ambiguity concept beyond simple wind matching.
  function evaluateWinClassical(input) {
    const openMelds = input.openMelds || [];
    const isMenzen = openMelds.every((m) => m.type === "kan" && m.concealed);
    const setsNeeded = 4 - openMelds.length;

    const candidates = [];

    if (openMelds.length === 0 && hand.isChiitoi(input.concealedCounts)) {
      const patterns = [{ name: "Seven Pairs", doubles: 2 }];
      if (input.winBy === "self-draw") patterns.push({ name: "Self-Drawn", doubles: 1 });
      if (input.winBy === "discard") patterns.push({ name: "Concealed Hand", doubles: 1 });
      candidates.push(finalize(patterns, false, input.isDealer));
    }

    const decomps = hand.decomposeConcealed(input.concealedCounts, setsNeeded);
    for (const d of decomps) {
      const groups = buildGroups(d.sets, openMelds);
      const wait = classifyWaitSimple(d.sets, d.pair, input.winTile);
      const { patterns, isLimit } = evaluatePatterns(d.sets, d.pair, groups, isMenzen, input.winBy, input.seatWind, input.roundWind, wait);
      candidates.push(finalize(patterns, isLimit, input.isDealer));
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.totalScore - a.totalScore);
    return candidates[0];
  }

  function finalize(patterns, isLimit, isDealer) {
    const doubles = isLimit ? LIMIT_DOUBLES : Math.min(patterns.reduce((a, p) => a + (p.doubles || 0), 0), LIMIT_DOUBLES);
    let score = BASE_POINTS * Math.pow(2, doubles);
    if (isDealer) score *= 2;
    return { patterns, doubles, isLimit, basePoints: BASE_POINTS, totalScore: score };
  }

  return { evaluateWinClassical, BASE_POINTS, LIMIT_DOUBLES };
});
