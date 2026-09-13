// AI decision policy for computer-controlled seats. Reasonable, not optimal:
// shanten-minimizing discards with a light safety/usefulness tie-break, calls
// taken only when they improve shanten (or complete a valuable yakuhai
// triplet), riichi declared whenever legal. No DOM dependency - loadable via
// <script> (global MJ.ai) or require() in Node, same UMD pattern as the rest
// of this project.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"), require("./hand.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { ai: factory(root.MJ.tiles, root.MJ.hand) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, hand) {
  "use strict";

  const WIND_KINDS = [tiles.indexOf("z", 1), tiles.indexOf("z", 2), tiles.indexOf("z", 3), tiles.indexOf("z", 4)];

  function seatWindOf(game, seat) {
    return WIND_KINDS[(seat - game.state.dealerSeat + 4) % 4];
  }

  // Rough "how connected is this tile to the rest of the hand" score, used only
  // to break ties between discards that leave the same shanten: higher = more
  // worth keeping. Honors are valuable only in multiples (heading to a
  // triplet); number tiles are valuable when neighbors within 2 ranks exist.
  function tileUsefulness(counts, k) {
    if (tiles.isHonor(k)) return counts[k] * 3;
    const suit = tiles.suitOf(k);
    const r = tiles.rankOf(k);
    let score = 0;
    for (let d = -2; d <= 2; d++) {
      const rr = r + d;
      if (rr < 1 || rr > 9) continue;
      score += d === 0 ? counts[k] * 2 : counts[tiles.indexOf(suit, rr)];
    }
    return score;
  }

  function currentShanten(game, seat) {
    const seatState = game.state.seats[seat];
    const setsNeeded = 4 - seatState.openMelds.length;
    const allowSpecial = game.ruleset === "riichi" && seatState.openMelds.length === 0;
    return hand.shanten(seatState.concealed, { setsNeeded, allowChiitoi: allowSpecial, allowKokushi: allowSpecial });
  }

  function chooseDiscard(game, seat) {
    const state = game.state;
    const seatState = state.seats[seat];
    if (seatState.riichiDeclared) return seatState.drawnTile; // discard is locked to the just-drawn tile

    const full = tiles.cloneCounts(seatState.concealed);
    if (seatState.drawnTile != null) full[seatState.drawnTile]++;
    const setsNeeded = 4 - seatState.openMelds.length;
    const allowSpecial = game.ruleset === "riichi" && seatState.openMelds.length === 0;

    let bestShanten = Infinity;
    let candidates = [];
    for (let k = 0; k < tiles.KIND_COUNT; k++) {
      if (full[k] <= 0) continue;
      const trial = full.slice();
      trial[k]--;
      const sh = hand.shanten(trial, { setsNeeded, allowChiitoi: allowSpecial, allowKokushi: allowSpecial });
      if (sh < bestShanten) { bestShanten = sh; candidates = [k]; }
      else if (sh === bestShanten) candidates.push(k);
    }
    if (candidates.length <= 1) return candidates[0] != null ? candidates[0] : (seatState.drawnTile != null ? seatState.drawnTile : 0);

    // tie-break: prefer a tile that's already 100% safe against any riichi'd opponent
    const riichiDiscards = [];
    for (let s = 0; s < 4; s++) if (s !== seat && state.seats[s].riichiDeclared) riichiDiscards.push(...state.seats[s].discards);
    if (riichiDiscards.length) {
      const safe = candidates.filter((k) => riichiDiscards.includes(k));
      if (safe.length) candidates = safe;
    }
    if (candidates.length === 1) return candidates[0];

    // tie-break: discard the least-connected tile
    candidates.sort((a, b) => tileUsefulness(full, a) - tileUsefulness(full, b));
    return candidates[0];
  }

  function shouldDeclareRiichi(game, seat, turnOptions) {
    return !!(turnOptions && turnOptions.canRiichi);
  }

  function chooseKan(game, seat, turnOptions) {
    if (!turnOptions) return null;
    if (turnOptions.closedKanOptions && turnOptions.closedKanOptions.length) return { kind: turnOptions.closedKanOptions[0], kanType: "closed" };
    if (turnOptions.addedKanOptions && turnOptions.addedKanOptions.length) return { kind: turnOptions.addedKanOptions[0], kanType: "added" };
    return null;
  }

  // High-level convenience: what should this seat do on its turn?
  // Returns one of { type:'tsumo' } | { type:'kan', kind, kanType } | { type:'discard', kind, declareRiichi }
  function chooseTurnAction(game, seat, turnOptions) {
    if (turnOptions.canTsumo) return { type: "tsumo" };
    const kan = chooseKan(game, seat, turnOptions);
    if (kan) return { type: "kan", kind: kan.kind, kanType: kan.kanType };
    return { type: "discard", kind: chooseDiscard(game, seat), declareRiichi: shouldDeclareRiichi(game, seat, turnOptions) };
  }

  function simulateShantenAfterCall(seatState, action, tile, chiTiles) {
    const trial = tiles.cloneCounts(seatState.concealed);
    const setsNeeded = 4 - seatState.openMelds.length - 1;
    if (action === "pon") trial[tile] -= 2;
    else if (action === "kan") trial[tile] -= 3;
    else { trial[chiTiles[0]]--; trial[chiTiles[1]]--; }
    return hand.shanten(trial, { setsNeeded });
  }

  function isValuableTriplet(game, seat, tile) {
    return tiles.isDragon(tile) || tile === seatWindOf(game, seat) || tile === game.state.roundWind;
  }

  // Decide a reaction to another seat's discard. Returns one of:
  // { action:'ron' } | { action:'pon' } | { action:'kan' } | { action:'chi', chiTiles:[a,b] } | { action:'pass' }
  function chooseCallDecision(game, seat, opt, discardTile) {
    if (opt.ron) return { action: "ron" };

    const seatState = game.state.seats[seat];
    const before = currentShanten(game, seat);

    if (opt.kanOptions) {
      const sh = simulateShantenAfterCall(seatState, "kan", discardTile);
      if (sh <= before) return { action: "kan" };
    }
    if (opt.pon) {
      const sh = simulateShantenAfterCall(seatState, "pon", discardTile);
      if (sh < before || (sh === before && isValuableTriplet(game, seat, discardTile))) return { action: "pon" };
    }
    if (opt.chiOptions && opt.chiOptions.length) {
      let bestCombo = null, bestShanten = Infinity;
      for (const combo of opt.chiOptions) {
        const sh = simulateShantenAfterCall(seatState, "chi", discardTile, combo);
        if (sh < bestShanten) { bestShanten = sh; bestCombo = combo; }
      }
      if (bestCombo && bestShanten < before) return { action: "chi", chiTiles: bestCombo };
    }
    return { action: "pass" };
  }

  return { chooseDiscard, shouldDeclareRiichi, chooseKan, chooseTurnAction, chooseCallDecision, tileUsefulness, currentShanten };
});
