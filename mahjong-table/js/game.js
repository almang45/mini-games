// Turn/call state machine for a 4-player mahjong table, supporting both the
// 'riichi' (Japanese) and 'classical' (Chinese Classical) rulesets.
//
// This module contains NO AI logic and NO UI code: it only exposes functions
// that a caller (an AI driver, a human-facing UI, or a headless test loop)
// calls to drive the game forward one step at a time. Every function takes
// the `game` object (or an explicit seat/tile) and mutates + returns
// `game.state`. Follows the same UMD pattern as tiles.js/hand.js/etc. so it
// works via require() in Node and as `MJ.game` in the browser.
//
// ---------------------------------------------------------------------------
// SIMPLIFICATIONS / DOCUMENTED RULE CHOICES (read this before reviewing logic)
// ---------------------------------------------------------------------------
// 1. Dead wall layout (riichi only, 14 tiles carved off the shuffled wall):
//      index 0-3   : rinshan (kan replacement) draws, consumed in kan order
//      index 4,6,8,10,12 : dora indicators, revealed one at a time (start + 1 per kan)
//      index 5,7,9,11,13 : the corresponding ura-dora indicators (same cadence)
//    This supports the standard maximum of 4 kans -> 5 total dora indicators.
// 2. Classical ruleset has no dead wall. Kan replacement tiles are drawn from
//    the front of the live wall like a normal draw (they just don't consume
//    the claiming seat's regular turn-draw slot). The live wall is drawn all
//    the way down to 0 tiles (no reserve) before an exhaustive draw triggers;
//    classical rules vary a lot on wall-reserve conventions, so this is the
//    simplest internally-consistent choice. If a kan replacement is needed
//    with an empty wall, we treat it as an immediate exhaustive draw instead
//    (no tile exists to hand out).
// 3. Furiten: only PERMANENT furiten is implemented (a seat may never ron if
//    any tile that would complete their current hand shape sits in their own
//    discard pile). Temporary furiten (missing one ron this go-around locks
//    you out until your next discard) is NOT implemented - it would require
//    tracking per-go-around pass decisions against all 3 opponents'
//    discards, which is a materially bigger state-tracking job; noted here
//    as a deliberate simplification rather than a bug.
// 4. Riichi discard lock: once riichi is declared, `getTurnOptions` /
//    `discard` only ever allow discarding the just-drawn tile. As a
//    consequence, ankan after riichi is disabled entirely (closedKanOptions
//    is forced empty once riichiDeclared is true). The real rule permits a
//    post-riichi ankan only when it provably doesn't change the wait; that
//    equivalence check is out of scope, so we simply forbid it.
// 5. Ankan/shouminkan (closed/added kan) may only be declared on a turn where
//    the seat just self-drew a tile (mirrors real rules: you can't kan
//    immediately after calling pon/chi without drawing).
// 5b. A seat that has declared riichi can never pon/chi/minkan (standard
//     rule - the hand must stay closed after riichi); `getCallOptions`
//     forces those false for a riichi'd seat regardless of what tiles it
//     holds. Ron remains available.
// 6. Chankan (robbing a kan) is only offered for shouminkan (added kan), not
//    for ankan (closed kan) - the rare "kokushi may rob an ankan" exception
//    is intentionally skipped.
// 7. Suukaikan (four kans by more than one distinct player) is detected the
//    instant the 4th such kan is declared: we abort the hand immediately
//    (skipping any rinshan draw / chankan window for that kan) rather than
//    letting one more replacement-draw-and-discard cycle play out first.
//    This is a minor simplification of the exact real-world timing.
// 8. Ippatsu bookkeeping: a seat's `isIppatsu` flag is set true the instant
//    they declare riichi, cleared the moment ANY call (pon/chi/kan) happens
//    anywhere at the table (voids ippatsu for every seat with a pending
//    window), and also cleared on that seat's own next discard if they
//    didn't win by then. This correctly models "win before your own next
//    discard, with nothing called in between."
// 9. Double riichi = riichi declared on a seat's very first discard of the
//    hand AND no call has happened anywhere yet this hand.
// 10. Honba: increments on every hand that is NOT a straight non-dealer
//     ron/tsumo win (i.e. dealer win, exhaustive draw, or abortive draw all
//     increment honba even when the dealer rotates on a noten exhaustive
//     draw) and resets to 0 only when a non-dealer wins by ron/tsumo. This
//     matches standard competitive rule, and is worth calling out because
//     "honba resets whenever the dealer rotates" is a common-but-wrong
//     simplification we deliberately avoided.
//     Honba bonus points: riichi ruleset adds the standard 300/honba (ron,
//     paid once per winning seat on multi-ron) or 100/honba-per-payer
//     (tsumo) on top of score-riichi's base computeScore, since
//     score-riichi.js itself is honba-agnostic. Classical has no honba bonus
//     convention in score-classical.js, so honba is tracked for
//     record-keeping only there (no extra points).
// 11. Riichi-stick pot: on a win, the ENTIRE pot goes to whichever ron winner
//     sits earliest in turn order after the discarder (or to the sole
//     tsumo winner). On an exhaustive/abortive draw, the pot is left
//     untouched and simply carries into the next hand (this is the standard
//     rule - unclaimed sticks accumulate until someone wins). Unclaimed
//     sticks at game-over are not redistributed. Because of this, the true
//     score invariant is `sum(seat scores) + riichiSticks*1000 === 4 *
//     startingScore` at all times, NOT a bare sum-of-scores invariant - see
//     the comment in game.test.js.
// 12. Exhaustive draw (ryuukyoku) tenpai payments: riichi pays a flat 3000
//     pot split evenly among tenpai seats and funded evenly by noten seats
//     (no payment if 0 or 4 seats are tenpai); classical pays nothing.
//     Dealer keeps the deal (renchan) if tenpai (riichi) or unconditionally
//     (classical - documented simplification, since classical conventions
//     vary; "dealer always keeps the deal on a no-result" was picked as the
//     simplest option explicitly offered by the spec).
// 13. Game end: riichi ends after South-4 completes (a standard East+South
//     hanchan, no All-Last/sudden-death nuance) OR immediately if any
//     player's score goes negative (bust). Classical ends after
//     `roundLimit` hands have been played (tracked independently of dealer
//     rotation/repeats) OR on the same bust condition, whichever comes
//     first.
// ---------------------------------------------------------------------------
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(
      require("./tiles.js"),
      require("./hand.js"),
      require("./yaku-riichi.js"),
      require("./score-riichi.js"),
      require("./score-classical.js")
    );
  } else {
    root.MJ = Object.assign(root.MJ || {}, {
      game: factory(root.MJ.tiles, root.MJ.hand, root.MJ.yakuRiichi, root.MJ.scoreRiichi, root.MJ.scoreClassical),
    });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, hand, yakuRiichi, scoreRiichi, scoreClassical) {
  "use strict";

  const KIND_COUNT = tiles.KIND_COUNT;
  const EAST = tiles.indexOf("z", 1);
  const SOUTH = tiles.indexOf("z", 2);
  const WIND_KINDS = [tiles.indexOf("z", 1), tiles.indexOf("z", 2), tiles.indexOf("z", 3), tiles.indexOf("z", 4)];

  // ---------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------

  function seatWindKind(seatIdx, dealerSeat) {
    return WIND_KINDS[(seatIdx - dealerSeat + 4) % 4];
  }

  // the tiles a seat currently has "in hand" for decision-making purposes:
  // concealed counts, plus the just-drawn tile if there is one.
  function handTileCounts(seat) {
    const c = tiles.cloneCounts(seat.concealed);
    if (seat.drawnTile != null) c[seat.drawnTile]++;
    return c;
  }

  function evaluateWinForRuleset(ruleset, input) {
    if (ruleset === "riichi") return yakuRiichi.evaluateWin(input);
    return scoreClassical.evaluateWinClassical(input);
  }

  // Builds the {concealedCounts, openMelds, winTile, winBy, ...} input shape
  // each ruleset's scoring module expects, from live game state.
  function buildWinInputForSeat(game, seatIdx, winTile, winBy, extra) {
    extra = extra || {};
    const state = game.state;
    const seat = state.seats[seatIdx];
    const concealedCounts = tiles.cloneCounts(seat.concealed);
    concealedCounts[winTile]++;
    const seatWind = seatWindKind(seatIdx, state.dealerSeat);

    if (game.ruleset === "riichi") {
      const flags = {
        riichi: seat.riichiDeclared,
        doubleRiichi: !!(seat.riichiDeclared && seat.doubleRiichi),
        ippatsu: !!(seat.riichiDeclared && seat.isIppatsu),
        haitei: winBy === "tsumo" && !!state._lastDrawHaitei,
        houtei: winBy === "ron" && !!state._lastDiscardHoutei,
        rinshan: winBy === "tsumo" && !!state._lastDrawWasRinshan,
        chankan: !!extra.chankan,
      };
      return {
        concealedCounts,
        openMelds: seat.openMelds,
        winTile,
        winBy, // 'ron' | 'tsumo'
        seatWind,
        roundWind: state.roundWind,
        flags,
        doraIndicators: state.doraIndicators,
        uraDoraIndicators: seat.riichiDeclared ? state.uraDoraIndicators : [],
      };
    }

    return {
      concealedCounts,
      openMelds: seat.openMelds,
      winTile,
      winBy: winBy === "tsumo" ? "self-draw" : "discard", // classical vocabulary
      seatWind,
      roundWind: state.roundWind,
      isDealer: seatIdx === state.dealerSeat,
    };
  }

  // Every tile kind that, if added to `seat`'s current concealed hand, would
  // complete a valid hand SHAPE (ignoring yaku). Used for furiten checks.
  function winningTilesForHand(game, seatIdx) {
    const state = game.state;
    const seat = state.seats[seatIdx];
    const setsNeeded = 4 - seat.openMelds.length;
    const winners = [];
    for (let k = 0; k < KIND_COUNT; k++) {
      if (seat.concealed[k] >= 4) continue;
      const trial = tiles.cloneCounts(seat.concealed);
      trial[k]++;
      let complete = hand.isCompleteStandard(trial, setsNeeded);
      if (!complete && seat.openMelds.length === 0) {
        complete = hand.isChiitoi(trial) || (game.ruleset === "riichi" && hand.isKokushi(trial));
      }
      if (complete) winners.push(k);
    }
    return winners;
  }

  function isFuriten(game, seatIdx) {
    const seat = game.state.seats[seatIdx];
    const winners = winningTilesForHand(game, seatIdx);
    if (winners.length === 0) return false; // not even tenpai -> furiten is moot
    return winners.some((k) => seat.discards.indexOf(k) !== -1);
  }

  function chiCombinations(concealed, tile) {
    if (tiles.isHonor(tile)) return [];
    const suit = tiles.suitOf(tile);
    const r = tiles.rankOf(tile);
    const candidates = [
      [r - 2, r - 1],
      [r - 1, r + 1],
      [r + 1, r + 2],
    ];
    const combos = [];
    for (const [a, b] of candidates) {
      if (a < 1 || b > 9) continue;
      const ka = tiles.indexOf(suit, a);
      const kb = tiles.indexOf(suit, b);
      if (concealed[ka] >= 1 && concealed[kb] >= 1) combos.push([ka, kb]);
    }
    return combos;
  }

  // ---------------------------------------------------------------------
  // createGame / startHand
  // ---------------------------------------------------------------------

  function createGame(opts) {
    opts = opts || {};
    const ruleset = opts.ruleset;
    if (ruleset !== "riichi" && ruleset !== "classical") throw new Error("createGame: ruleset must be 'riichi' or 'classical'");
    const startingScore = opts.startingScore != null ? opts.startingScore : ruleset === "riichi" ? 25000 : 2000;

    const seats = [];
    for (let i = 0; i < 4; i++) {
      seats.push({
        concealed: new Array(KIND_COUNT).fill(0),
        drawnTile: null,
        openMelds: [],
        discards: [],
        riichiDeclared: false,
        riichiDiscardIndex: null,
        doubleRiichi: false,
        score: startingScore,
        isIppatsu: false,
        isMenzen: true,
      });
    }

    return {
      ruleset,
      players: opts.players || [null, null, null, null],
      startingScore,
      roundLimit: opts.roundLimit || null, // classical: max hands; riichi ignores this (fixed East+South hanchan)
      state: {
        ruleset,
        seats,
        dealerSeat: 0,
        roundWind: EAST,
        handNumber: 1,
        honba: 0,
        riichiSticks: 0,
        wall: [],
        deadWall: [],
        doraIndicators: [],
        uraDoraIndicators: [],
        turnSeat: 0,
        phase: "hand-over", // no hand started yet
        lastDiscard: null,
        kanCount: 0,
        log: [],
        totalHandsPlayed: 0,
      },
    };
  }

  // Reveals the next dora indicator (riichi only): called once at the start
  // of a hand and again immediately after each kan. See dead-wall layout
  // convention documented at the top of this file.
  function revealNextDoraIndicator(state) {
    const count = state.doraIndicators.length;
    state.doraIndicators.push(state.deadWall[4 + count * 2]);
    state.uraDoraIndicators.push(state.deadWall[5 + count * 2]);
  }

  function dealHands(state) {
    for (let round = 0; round < 13; round++) {
      for (let step = 0; step < 4; step++) {
        const s = (state.dealerSeat + step) % 4;
        const k = state.wall.shift();
        state.seats[s].concealed[k]++;
      }
    }
    const dealerSeat = state.seats[state.dealerSeat];
    dealerSeat.drawnTile = state.wall.shift();
  }

  function startHand(game) {
    const state = game.state;
    if (state.phase === "game-over") throw new Error("startHand: game has already ended");

    for (const seat of state.seats) {
      seat.concealed = new Array(KIND_COUNT).fill(0);
      seat.drawnTile = null;
      seat.openMelds = [];
      seat.discards = [];
      seat.riichiDeclared = false;
      seat.riichiDiscardIndex = null;
      seat.doubleRiichi = false;
      seat.isIppatsu = false;
      seat.isMenzen = true;
    }

    const shuffledKinds = tiles.shuffle(tiles.buildWall()).map((t) => t.kind);

    state.kanCount = 0;
    state._kansBySeat = [0, 0, 0, 0];
    state._callMade = false;
    state.pendingChankan = null;
    state._lastDrawHaitei = false;
    state._lastDrawWasRinshan = false;
    state._lastDiscardHoutei = false;
    state._pendingCallOptions = null;
    state.lastDiscard = null;
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    if (game.ruleset === "riichi") {
      state.deadWall = shuffledKinds.slice(shuffledKinds.length - 14);
      state.wall = shuffledKinds.slice(0, shuffledKinds.length - 14);
      revealNextDoraIndicator(state);
    } else {
      state.deadWall = [];
      state.wall = shuffledKinds; // classical: draw straight down to 0, no reserve (see file header)
    }

    dealHands(state);

    state.turnSeat = state.dealerSeat;
    state.phase = "awaiting-turn-action"; // dealer already holds their 14th tile
    state.log.push({ type: "hand-start", dealerSeat: state.dealerSeat, roundWind: state.roundWind, handNumber: state.handNumber, honba: state.honba });
    return state;
  }

  // ---------------------------------------------------------------------
  // drawTile / getTurnOptions / discard / declareKan
  // ---------------------------------------------------------------------

  function drawTile(game) {
    const state = game.state;
    if (state.phase === "hand-over" || state.phase === "game-over") throw new Error("drawTile: no hand in progress");
    if (state.wall.length === 0) {
      handleExhaustiveDraw(game);
      return state;
    }
    const seat = state.seats[state.turnSeat];
    const k = state.wall.shift();
    seat.drawnTile = k;
    state._lastDrawWasRinshan = false;
    state._lastDrawHaitei = state.wall.length === 0;
    state.phase = "awaiting-turn-action";
    state.log.push({ type: "draw", seat: state.turnSeat, tile: k });
    return state;
  }

  function getTurnOptions(game) {
    const state = game.state;
    const seatIdx = state.turnSeat;
    const seat = state.seats[seatIdx];
    if (state.phase !== "awaiting-turn-action") throw new Error("getTurnOptions: not awaiting a turn action");
    const full = handTileCounts(seat);
    const setsNeeded = 4 - seat.openMelds.length;

    let canTsumo = false;
    if (seat.drawnTile != null) {
      const winInput = buildWinInputForSeat(game, seatIdx, seat.drawnTile, "tsumo");
      canTsumo = !!evaluateWinForRuleset(game.ruleset, winInput);
    }

    let canRiichi = false;
    if (game.ruleset === "riichi" && seat.isMenzen && !seat.riichiDeclared && seat.score >= 1000 && seat.drawnTile != null) {
      for (let k = 0; k < KIND_COUNT; k++) {
        if (full[k] <= 0) continue;
        const trial = full.slice();
        trial[k]--;
        if (hand.shanten(trial, { setsNeeded, allowChiitoi: true, allowKokushi: true }) === 0) {
          canRiichi = true;
          break;
        }
      }
    }

    const closedKanOptions = [];
    const addedKanOptions = [];
    if (!seat.riichiDeclared && seat.drawnTile != null) {
      for (let k = 0; k < KIND_COUNT; k++) if (full[k] === 4) closedKanOptions.push(k);
      for (const m of seat.openMelds) {
        if (m.type === "pon" && full[m.tiles[0]] >= 1) addedKanOptions.push(m.tiles[0]);
      }
    }

    let discardOptions;
    if (seat.riichiDeclared) {
      discardOptions = seat.drawnTile != null ? [seat.drawnTile] : [];
    } else {
      discardOptions = [];
      for (let k = 0; k < KIND_COUNT; k++) if (full[k] > 0) discardOptions.push(k);
    }

    return { canTsumo, canRiichi, closedKanOptions, addedKanOptions, discardOptions };
  }

  function discard(game, seatIdx, tileKind, opts) {
    opts = opts || {};
    const state = game.state;
    if (state.phase !== "awaiting-turn-action") throw new Error("discard: not awaiting a turn action");
    if (state.turnSeat !== seatIdx) throw new Error("discard: seat " + seatIdx + " does not have the turn");
    const seat = state.seats[seatIdx];
    const full = handTileCounts(seat);

    if (seat.riichiDeclared && tileKind !== seat.drawnTile) {
      throw new Error("discard: riichi lock - may only discard the just-drawn tile");
    }
    if (!full[tileKind]) throw new Error("discard: tile " + tileKind + " is not available to discard");

    if (opts.declareRiichi) {
      if (game.ruleset !== "riichi") throw new Error("discard: riichi is not applicable to the classical ruleset");
      if (seat.riichiDeclared) throw new Error("discard: seat is already in riichi");
      if (!seat.isMenzen) throw new Error("discard: riichi requires a closed hand");
      if (seat.score < 1000) throw new Error("discard: insufficient score to declare riichi");
      const trial = full.slice();
      trial[tileKind]--;
      const setsNeeded = 4 - seat.openMelds.length;
      if (hand.shanten(trial, { setsNeeded, allowChiitoi: true, allowKokushi: true }) !== 0) {
        throw new Error("discard: this discard would not leave the hand in tenpai");
      }
    }

    const wasAlreadyRiichi = seat.riichiDeclared;
    full[tileKind]--;
    seat.concealed = full;
    seat.drawnTile = null;
    seat.discards.push(tileKind);

    if (opts.declareRiichi) {
      seat.riichiDeclared = true;
      seat.riichiDiscardIndex = seat.discards.length - 1;
      seat.doubleRiichi = seat.discards.length === 1 && !state._callMade;
      seat.score -= 1000;
      state.riichiSticks += 1;
      seat.isIppatsu = true;
    } else if (wasAlreadyRiichi) {
      seat.isIppatsu = false; // a full go-around passed with no win: ippatsu window closes
    }

    state._lastDiscardHoutei = state.wall.length === 0;
    state.lastDiscard = { seat: seatIdx, tile: tileKind };
    state.log.push({ type: "discard", seat: seatIdx, tile: tileKind, riichi: !!opts.declareRiichi });

    const callOptions = getCallOptions(game, seatIdx, tileKind);
    state._pendingCallOptions = callOptions;
    state.phase = "awaiting-calls";
    return callOptions;
  }

  function declareKan(game, seatIdx, tileKind, type) {
    const state = game.state;
    if (state.phase !== "awaiting-turn-action") throw new Error("declareKan: not awaiting a turn action");
    if (state.turnSeat !== seatIdx) throw new Error("declareKan: seat " + seatIdx + " does not have the turn");
    const seat = state.seats[seatIdx];
    if (seat.riichiDeclared) throw new Error("declareKan: kan is disabled after riichi (see simplification notes)");
    if (seat.drawnTile == null) throw new Error("declareKan: kan requires a just-drawn tile");
    const full = handTileCounts(seat);

    if (type === "closed") {
      if (full[tileKind] !== 4) throw new Error("declareKan: need all 4 copies concealed for ankan");
      const newConcealed = tiles.cloneCounts(seat.concealed);
      newConcealed[tileKind] = 0;
      // if the just-drawn tile is a DIFFERENT kind than the one being kan'd
      // (the 4th copy was already sitting in concealed before this draw), it
      // must be folded back into concealed rather than discarded silently -
      // otherwise it simply vanishes from the game when drawnTile is cleared.
      if (seat.drawnTile != null && seat.drawnTile !== tileKind) newConcealed[seat.drawnTile]++;
      seat.concealed = newConcealed;
      seat.drawnTile = null;
      seat.openMelds.push({ type: "kan", tiles: [tileKind, tileKind, tileKind, tileKind], concealed: true });
    } else if (type === "added") {
      const ponIdx = seat.openMelds.findIndex((m) => m.type === "pon" && m.tiles[0] === tileKind);
      if (ponIdx === -1) throw new Error("declareKan: no existing pon of that tile to add to");
      if (full[tileKind] < 1) throw new Error("declareKan: seat does not hold the 4th tile");
      const newConcealed = tiles.cloneCounts(seat.concealed);
      if (seat.drawnTile === tileKind) {
        // the drawn tile itself is the 4th copy; concealed already lacks it
      } else {
        newConcealed[tileKind]--; // the 4th copy was sitting in concealed
        if (seat.drawnTile != null) newConcealed[seat.drawnTile]++; // preserve the unrelated drawn tile (see ankan comment above)
      }
      seat.concealed = newConcealed;
      seat.drawnTile = null;
      seat.openMelds[ponIdx] = { type: "kan", tiles: [tileKind, tileKind, tileKind, tileKind], concealed: false };
    } else {
      throw new Error("declareKan: unknown kan type " + type);
    }

    state.kanCount++;
    state._kansBySeat = state._kansBySeat || [0, 0, 0, 0];
    state._kansBySeat[seatIdx]++;
    state.log.push({ type: "kan", kanType: type, seat: seatIdx, tile: tileKind });

    if (state.kanCount >= 4 && state._kansBySeat.filter((c) => c > 0).length > 1) {
      abortHandSuukaikan(game);
      return state;
    }

    if (type === "added") {
      const chankanOptions = {};
      let any = false;
      for (let s = 0; s < 4; s++) {
        if (s === seatIdx) continue;
        const winInput = buildWinInputForSeat(game, s, tileKind, "ron", { chankan: true });
        const canRon = !!evaluateWinForRuleset(game.ruleset, winInput) && !isFuriten(game, s);
        chankanOptions[s] = { ron: canRon };
        if (canRon) any = true;
      }
      state.pendingChankan = { seat: seatIdx, tile: tileKind, options: chankanOptions, any };
      state.phase = "awaiting-calls";
      return chankanOptions;
    }

    // closed kan: no chankan opportunity, straight to the rinshan draw
    drawKanReplacement(game, seatIdx);
    return state;
  }

  function drawKanReplacement(game, seatIdx) {
    const state = game.state;
    const seat = state.seats[seatIdx];
    let kind;
    if (game.ruleset === "riichi") {
      // the dead wall is replenished from the tail of the live wall so it
      // stays at a constant 14 tiles (matches the real rule): each kan
      // shrinks the live wall by one extra tile beyond the claiming seat's
      // own draw. If the live wall has nothing left to replenish it with,
      // that IS the live wall running out (same trigger a normal draw would
      // hit) - resolve as an exhaustive draw instead of handing out a
      // replacement tile.
      if (state.wall.length === 0) {
        handleExhaustiveDraw(game);
        return;
      }
      state.wall.pop();
      const idx = state.kanCount - 1; // 0-based: this is the Nth kan this hand
      kind = state.deadWall[idx];
      revealNextDoraIndicator(state);
    } else {
      if (state.wall.length === 0) {
        // no tile left to hand out as a replacement: fall back to exhaustive draw
        handleExhaustiveDraw(game);
        return;
      }
      kind = state.wall.shift();
    }
    seat.drawnTile = kind;
    state._lastDrawWasRinshan = true;
    state._lastDrawHaitei = false;
    state.turnSeat = seatIdx;
    state.phase = "awaiting-turn-action";
    state.log.push({ type: "rinshan-draw", seat: seatIdx, tile: kind });
  }

  // ---------------------------------------------------------------------
  // getCallOptions / resolveCalls
  // ---------------------------------------------------------------------

  function getCallOptions(game, discardSeat, tile) {
    const state = game.state;
    const result = {};
    for (let s = 0; s < 4; s++) {
      if (s === discardSeat) continue;
      const seat = state.seats[s];
      const winInput = buildWinInputForSeat(game, s, tile, "ron");
      const canRon = !!evaluateWinForRuleset(game.ruleset, winInput) && !isFuriten(game, s);
      // a seat that has declared riichi must keep its hand closed, so it may
      // never pon/chi/minkan - ron remains available.
      const canCall = !seat.riichiDeclared;
      const opts = {
        ron: canRon,
        pon: canCall && seat.concealed[tile] >= 2,
        kanOptions: canCall && seat.concealed[tile] >= 3,
        chiOptions: canCall && s === (discardSeat + 1) % 4 ? chiCombinations(seat.concealed, tile) : [],
      };
      result[s] = opts;
    }
    return result;
  }

  function resolveCalls(game, decisions) {
    decisions = decisions || {};
    const state = game.state;
    if (state.phase !== "awaiting-calls") throw new Error("resolveCalls: not awaiting calls");

    if (state.pendingChankan) return resolveChankan(game, decisions);

    const discardSeat = state.lastDiscard.seat;
    const tile = state.lastDiscard.tile;
    const callOptions = state._pendingCallOptions || getCallOptions(game, discardSeat, tile);

    const ronSeats = [];
    for (let s = 0; s < 4; s++) {
      if (decisions[s] === "ron") {
        if (!callOptions[s] || !callOptions[s].ron) throw new Error("resolveCalls: seat " + s + " cannot ron");
        ronSeats.push(s);
      }
    }
    if (ronSeats.length > 0) return settleRon(game, discardSeat, tile, ronSeats);

    let callingSeat = null;
    let callType = null;
    for (let step = 1; step <= 3; step++) {
      const s = (discardSeat + step) % 4;
      const d = decisions[s];
      if (d === "pon" || d === "kan") {
        if (!callOptions[s]) throw new Error("resolveCalls: seat " + s + " has no call options");
        if (d === "pon" && !callOptions[s].pon) throw new Error("resolveCalls: seat " + s + " cannot pon");
        if (d === "kan" && !callOptions[s].kanOptions) throw new Error("resolveCalls: seat " + s + " cannot kan");
        callingSeat = s;
        callType = d;
        break;
      }
    }
    if (callingSeat == null) {
      const chiSeat = (discardSeat + 1) % 4;
      if (decisions[chiSeat] === "chi") {
        if (!callOptions[chiSeat] || callOptions[chiSeat].chiOptions.length === 0) {
          throw new Error("resolveCalls: seat " + chiSeat + " cannot chi");
        }
        callingSeat = chiSeat;
        callType = "chi";
      }
    }

    if (callingSeat != null) return applyCall(game, discardSeat, tile, callingSeat, callType, decisions.chiTiles);

    return advanceTurnAfterPass(game, discardSeat);
  }

  function applyCall(game, discardSeat, tile, seatIdx, type, chiTiles) {
    const state = game.state;
    const seat = state.seats[seatIdx];
    state._callMade = true;
    for (const s2 of state.seats) s2.isIppatsu = false; // any call voids every pending ippatsu window
    // the claimed discard is lifted out of the discarder's pile and into the
    // meld below - without this it would be double-counted (still sitting in
    // discards AND newly present in the claiming seat's openMelds).
    state.seats[discardSeat].discards.pop();

    if (type === "pon") {
      seat.concealed[tile] -= 2;
      seat.openMelds.push({ type: "pon", tiles: [tile, tile, tile], concealed: false });
      seat.isMenzen = false;
    } else if (type === "chi") {
      const a = chiTiles[0];
      const b = chiTiles[1];
      seat.concealed[a]--;
      seat.concealed[b]--;
      const sorted = [a, tile, b].sort((x, y) => x - y);
      seat.openMelds.push({ type: "chi", tiles: sorted, concealed: false });
      seat.isMenzen = false;
    } else if (type === "kan") {
      seat.concealed[tile] -= 3;
      seat.openMelds.push({ type: "kan", tiles: [tile, tile, tile, tile], concealed: false });
      seat.isMenzen = false;
      state.kanCount++;
      state._kansBySeat = state._kansBySeat || [0, 0, 0, 0];
      state._kansBySeat[seatIdx]++;
      state.lastDiscard = null;
      state._pendingCallOptions = null;
      state.log.push({ type: "call", seat: seatIdx, callType: "kan", tile, from: discardSeat });
      if (state.kanCount >= 4 && state._kansBySeat.filter((c) => c > 0).length > 1) {
        abortHandSuukaikan(game);
        return state;
      }
      drawKanReplacement(game, seatIdx);
      return state;
    }

    state.turnSeat = seatIdx;
    state.phase = "awaiting-turn-action";
    state.lastDiscard = null;
    state._pendingCallOptions = null;
    state.log.push({ type: "call", seat: seatIdx, callType: type, tile, from: discardSeat });
    return state;
  }

  function advanceTurnAfterPass(game, discardSeat) {
    const state = game.state;
    state.turnSeat = (discardSeat + 1) % 4;
    state.lastDiscard = null;
    state._pendingCallOptions = null;
    state.phase = "draw";
    return state;
  }

  function resolveChankan(game, decisions) {
    const state = game.state;
    const pending = state.pendingChankan;
    const ronSeats = [];
    for (let s = 0; s < 4; s++) {
      if (decisions[s] === "ron") {
        if (!pending.options[s] || !pending.options[s].ron) throw new Error("resolveCalls: seat " + s + " cannot chankan-ron");
        ronSeats.push(s);
      }
    }
    if (ronSeats.length > 0) {
      state.pendingChankan = null;
      return settleRon(game, pending.seat, pending.tile, ronSeats, { chankan: true });
    }
    state.pendingChankan = null;
    drawKanReplacement(game, pending.seat);
    return state;
  }

  // ---------------------------------------------------------------------
  // win resolution: tsumo / ron / exhaustive draw / abortive draw
  // ---------------------------------------------------------------------

  function declareTsumo(game, seatIdx) {
    const state = game.state;
    if (state.phase !== "awaiting-turn-action") throw new Error("declareTsumo: not awaiting a turn action");
    if (state.turnSeat !== seatIdx) throw new Error("declareTsumo: seat " + seatIdx + " does not have the turn");
    const seat = state.seats[seatIdx];
    if (seat.drawnTile == null) throw new Error("declareTsumo: no drawn tile to win with");

    const winInput = buildWinInputForSeat(game, seatIdx, seat.drawnTile, "tsumo");
    const winResult = evaluateWinForRuleset(game.ruleset, winInput);
    if (!winResult) throw new Error("declareTsumo: rejected - hand has no valid yaku/shape");

    const isDealer = seatIdx === state.dealerSeat;
    const deltas = [0, 0, 0, 0];

    if (game.ruleset === "riichi") {
      const sc = scoreRiichi.computeScore(winResult.han, winResult.fu, isDealer, "tsumo");
      const bonus = state.honba * 100; // standard: 100/honba from each payer
      if (isDealer) {
        const each = sc.payments.eachPays + bonus;
        for (let s = 0; s < 4; s++) if (s !== seatIdx) deltas[s] -= each;
        deltas[seatIdx] += each * 3;
      } else {
        const dealerPay = sc.payments.dealerPays + bonus;
        const eachPay = sc.payments.eachPays + bonus;
        for (let s = 0; s < 4; s++) {
          if (s === seatIdx) continue;
          const pay = s === state.dealerSeat ? dealerPay : eachPay;
          deltas[s] -= pay;
          deltas[seatIdx] += pay;
        }
      }
      deltas[seatIdx] += state.riichiSticks * 1000;
      state.riichiSticks = 0;
      settleHand(game, {
        type: "tsumo",
        deltas,
        dealerContinues: isDealer,
        honbaBehavior: isDealer ? "increment" : "reset",
        details: { seat: seatIdx, winResult },
      });
    } else {
      for (let s = 0; s < 4; s++) {
        if (s === seatIdx) continue;
        deltas[s] -= winResult.totalScore;
        deltas[seatIdx] += winResult.totalScore;
      }
      settleHand(game, {
        type: "tsumo",
        deltas,
        dealerContinues: isDealer,
        honbaBehavior: isDealer ? "increment" : "reset",
        details: { seat: seatIdx, winResult },
      });
    }
    return state;
  }

  function settleRon(game, discardSeat, tile, ronSeats, extra) {
    extra = extra || {};
    const state = game.state;
    const deltas = [0, 0, 0, 0];
    const results = [];

    const orderedWinners = ronSeats.slice().sort((a, b) => ((a - discardSeat + 4) % 4) - ((b - discardSeat + 4) % 4));

    for (const s of ronSeats) {
      const winInput = buildWinInputForSeat(game, s, tile, "ron", extra);
      const winResult = evaluateWinForRuleset(game.ruleset, winInput);
      if (!winResult) throw new Error("settleRon: seat " + s + " has no valid win (should have been screened earlier)");
      const isDealer = s === state.dealerSeat;
      let payment;
      if (game.ruleset === "riichi") {
        const sc = scoreRiichi.computeScore(winResult.han, winResult.fu, isDealer, "ron");
        payment = sc.payments.discarderPays + state.honba * 300;
      } else {
        payment = winResult.totalScore;
      }
      deltas[discardSeat] -= payment;
      deltas[s] += payment;
      results.push({ seat: s, winResult, payment, isDealer });
    }

    if (game.ruleset === "riichi") {
      deltas[orderedWinners[0]] += state.riichiSticks * 1000;
      state.riichiSticks = 0;
    }

    const dealerWon = ronSeats.indexOf(state.dealerSeat) !== -1;
    settleHand(game, {
      type: extra.chankan ? "chankan" : "ron",
      deltas,
      dealerContinues: dealerWon,
      honbaBehavior: dealerWon ? "increment" : "reset",
      details: { discardSeat, tile, results },
    });
    return state;
  }

  function handleExhaustiveDraw(game) {
    const state = game.state;
    const tenpaiSeats = [];
    for (let s = 0; s < 4; s++) {
      const seat = state.seats[s];
      const setsNeeded = 4 - seat.openMelds.length;
      const shOpts = { setsNeeded };
      if (game.ruleset === "riichi" && seat.openMelds.length === 0) {
        shOpts.allowChiitoi = true;
        shOpts.allowKokushi = true;
      }
      if (hand.shanten(seat.concealed, shOpts) === 0) tenpaiSeats.push(s);
    }

    const deltas = [0, 0, 0, 0];
    if (game.ruleset === "riichi" && tenpaiSeats.length > 0 && tenpaiSeats.length < 4) {
      const notenSeats = [0, 1, 2, 3].filter((s) => tenpaiSeats.indexOf(s) === -1);
      const pot = 3000;
      const perTenpai = pot / tenpaiSeats.length;
      const perNoten = pot / notenSeats.length;
      for (const s of tenpaiSeats) deltas[s] += perTenpai;
      for (const s of notenSeats) deltas[s] -= perNoten;
    }

    const dealerContinues = game.ruleset === "riichi" ? tenpaiSeats.indexOf(state.dealerSeat) !== -1 : true; // classical: always keeps deal (documented)

    settleHand(game, {
      type: "exhaustive",
      deltas,
      dealerContinues,
      honbaBehavior: "increment",
      details: { tenpaiSeats },
    });
  }

  function abortHandSuukaikan(game) {
    settleHand(game, {
      type: "abortive",
      deltas: [0, 0, 0, 0],
      dealerContinues: true, // abortive draws always keep the same dealer
      honbaBehavior: "increment",
      details: { reason: "suukaikan" },
    });
  }

  // Single point where score deltas are applied and dealer/round progression
  // is decided. Every win/draw path funnels through here.
  function settleHand(game, outcome) {
    const state = game.state;
    for (let s = 0; s < 4; s++) state.seats[s].score += outcome.deltas[s];
    state.totalHandsPlayed = (state.totalHandsPlayed || 0) + 1;

    if (outcome.honbaBehavior === "reset") state.honba = 0;
    else state.honba++;

    if (!outcome.dealerContinues) {
      state.dealerSeat = (state.dealerSeat + 1) % 4;
      state.handNumber++;
      if (game.ruleset === "riichi" && state.handNumber > 4) {
        state.handNumber = 1;
        if (state.roundWind === EAST) {
          state.roundWind = SOUTH;
        } else {
          state.log.push({ type: "hand-over", outcome });
          state.phase = "game-over";
          state.log.push({ type: "game-over", reason: "hanchan-complete" });
          return state;
        }
      }
    }

    state.log.push({ type: "hand-over", outcome });

    const bust = state.seats.some((s) => s.score < 0);
    if (bust) {
      state.phase = "game-over";
      state.log.push({ type: "game-over", reason: "bust" });
      return state;
    }

    if (game.ruleset === "classical" && game.roundLimit && state.totalHandsPlayed >= game.roundLimit) {
      state.phase = "game-over";
      state.log.push({ type: "game-over", reason: "round-limit" });
      return state;
    }

    state.phase = "hand-over";
    return state;
  }

  return {
    createGame,
    startHand,
    drawTile,
    getTurnOptions,
    discard,
    declareKan,
    getCallOptions,
    resolveCalls,
    declareTsumo,
    settleHand,
    // exposed for scenario tests / advanced callers
    seatWindKind,
    handTileCounts,
    isFuriten,
    winningTilesForHand,
    evaluateWinForRuleset,
    buildWinInputForSeat,
  };
});
