const assert = require("assert");
const tiles = require("../tiles.js");
const hand = require("../hand.js");
const game = require("../game.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function countsFromNotations(list) {
  const c = new Array(34).fill(0);
  for (const n of list) c[tiles.notationToIndex(n)]++;
  return c;
}

// deterministic PRNG so failures are reproducible
function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------

// Total physical tiles must always be exactly 136: wall + dead wall + every
// seat's (concealed + drawn tile + discards + open-meld tiles).
function countAllTiles(g) {
  const s = g.state;
  let total = s.wall.length + s.deadWall.length;
  for (const seat of s.seats) {
    total += tiles.totalCount(seat.concealed);
    if (seat.drawnTile != null) total += 1;
    total += seat.discards.length;
    for (const m of seat.openMelds) total += m.tiles.length;
  }
  return total;
}

function checkTileInvariant(g, label) {
  ok("tile conservation == 136 (" + label + ")", countAllTiles(g) === 136, { total: countAllTiles(g), label });
}

// riichi: sticks are held-and-paid amongst players, so the true invariant is
// scores + (sticks * 1000) == 4 * startingScore, not a bare score sum (a
// stick can legitimately sit on the table, carried across hands, until a
// winner claims it). classical has no sticks concept, so it's a bare sum.
function checkScoreInvariant(g, label) {
  const sum = g.state.seats.reduce((a, s) => a + s.score, 0);
  if (g.ruleset === "riichi") {
    const total = sum + g.state.riichiSticks * 1000;
    ok("riichi score+sticks invariant (" + label + ")", total === 4 * g.startingScore, { sum, sticks: g.state.riichiSticks, label });
  } else {
    ok("classical score sum invariant (" + label + ")", sum === 4 * g.startingScore, { sum, label });
  }
}

// ---------------------------------------------------------------------
// Random-but-legal driving policy (NOT an AI - just enough to keep a game
// moving and terminating for the end-to-end simulation tests below).
// ---------------------------------------------------------------------

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickRiichiSafeDiscard(g, seatIdx, options, rng) {
  const state = g.state;
  const seat = state.seats[seatIdx];
  const full = game.handTileCounts(seat);
  const setsNeeded = 4 - seat.openMelds.length;
  const candidates = [];
  for (const k of options.discardOptions) {
    const trial = full.slice();
    trial[k]--;
    if (hand.shanten(trial, { setsNeeded, allowChiitoi: true, allowKokushi: true }) === 0) candidates.push(k);
  }
  return candidates.length ? pickRandom(candidates, rng) : null;
}

function stepRandom(g, rng) {
  const state = g.state;

  if (state.phase === "draw") {
    game.drawTile(g);
    checkTileInvariant(g, "after draw");
    return;
  }

  if (state.phase === "awaiting-turn-action") {
    const seatIdx = state.turnSeat;
    const options = game.getTurnOptions(g);

    if (options.canTsumo) {
      game.declareTsumo(g, seatIdx);
      checkTileInvariant(g, "after tsumo");
      return;
    }
    if (options.closedKanOptions.length && rng() < 0.15) {
      game.declareKan(g, seatIdx, pickRandom(options.closedKanOptions, rng), "closed");
      checkTileInvariant(g, "after ankan");
      return;
    }
    if (options.addedKanOptions.length && rng() < 0.15) {
      game.declareKan(g, seatIdx, pickRandom(options.addedKanOptions, rng), "added");
      checkTileInvariant(g, "after shouminkan");
      return;
    }

    let declareRiichi = false;
    let tileKind = null;
    if (options.canRiichi && rng() < 0.7) {
      const safe = pickRiichiSafeDiscard(g, seatIdx, options, rng);
      if (safe != null) {
        declareRiichi = true;
        tileKind = safe;
      }
    }
    if (tileKind == null) tileKind = pickRandom(options.discardOptions, rng);

    game.discard(g, seatIdx, tileKind, { declareRiichi });
    checkTileInvariant(g, "after discard");
    return;
  }

  if (state.phase === "awaiting-calls") {
    const options = state.pendingChankan ? state.pendingChankan.options : state._pendingCallOptions;
    const decisions = {};
    let anyRon = false;
    for (const s in options) {
      if (options[s].ron) {
        decisions[s] = "ron"; // always take a winning call, per the test policy
        anyRon = true;
      }
    }
    if (!anyRon) {
      for (const s in options) {
        const o = options[s];
        if (o.pon && rng() < 0.2) decisions[s] = "pon";
        else if (o.kanOptions && rng() < 0.2) decisions[s] = "kan";
        else if (o.chiOptions && o.chiOptions.length && rng() < 0.2) {
          decisions[s] = "chi";
          decisions.chiTiles = pickRandom(o.chiOptions, rng);
        }
      }
    }
    game.resolveCalls(g, decisions);
    checkTileInvariant(g, "after resolveCalls");
    return;
  }

  throw new Error("stepRandom: unexpected phase " + state.phase);
}

function playHandToCompletion(g, rng) {
  let iterations = 0;
  const MAX_ITER = 3000;
  checkTileInvariant(g, "hand start");
  while (g.state.phase !== "hand-over" && g.state.phase !== "game-over") {
    iterations++;
    if (iterations > MAX_ITER) {
      throw new Error("playHandToCompletion: exceeded iteration cap (" + MAX_ITER + ") - possible infinite loop, phase=" + g.state.phase);
    }
    stepRandom(g, rng);
  }
}

function runRandomGame(ruleset, seed) {
  const rng = makeRng(seed);
  const opts = { ruleset, players: [{ name: "P0" }, { name: "P1" }, { name: "P2" }, { name: "P3" }] };
  if (ruleset === "classical") opts.roundLimit = 10;
  const g = game.createGame(opts);
  const MAX_HANDS = ruleset === "riichi" ? 200 : opts.roundLimit + 5;

  let handsPlayed = 0;
  while (g.state.phase !== "game-over") {
    handsPlayed++;
    if (handsPlayed > MAX_HANDS) {
      throw new Error("runRandomGame(" + ruleset + "): exceeded max hands cap (" + MAX_HANDS + ") - possible infinite loop");
    }
    game.startHand(g);
    playHandToCompletion(g, rng);
    ok("hand " + handsPlayed + " ended in hand-over/game-over (" + ruleset + " seed " + seed + ")", g.state.phase === "hand-over" || g.state.phase === "game-over");
    checkTileInvariant(g, "post hand-over");
    checkScoreInvariant(g, "post hand-over, hand #" + handsPlayed);
  }
  ok(ruleset + " game reached game-over within cap (seed " + seed + ")", g.state.phase === "game-over");
  return g;
}

// ---------------------------------------------------------------------
// 1a. Full randomized-but-legal simulated games: riichi
// ---------------------------------------------------------------------
for (let i = 0; i < 30; i++) {
  runRandomGame("riichi", 1000 + i);
}
console.log("game.test.js: 30 riichi simulated games completed");

// ---------------------------------------------------------------------
// 1b. Full randomized-but-legal simulated games: classical
// ---------------------------------------------------------------------
for (let i = 0; i < 30; i++) {
  runRandomGame("classical", 5000 + i);
}
console.log("game.test.js: 30 classical simulated games completed");

// ---------------------------------------------------------------------
// 2. Hand-picked scenario tests
// ---------------------------------------------------------------------

// --- scenario: ron call (also exercises dealer rotation after a non-dealer win) ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  g.state.seats[0].drawnTile = tiles.indexOf("s", 2);
  g.state.wall = [tiles.indexOf("z", 6)]; // keep the wall non-empty so this isn't incidentally a houtei win

  const opts = game.discard(g, 0, tiles.indexOf("s", 2), {});
  ok("scenario/ron: discard offers a callable option set", !!opts);

  // seat 1: tanyao + pinfu tenpai, ryanmen-waiting on 2s
  g.state.seats[1].concealed = countsFromNotations([
    "2m", "3m", "4m", "4m", "5m", "6m", "6p", "7p", "8p", "5s", "5s", "3s", "4s",
  ]);
  g.state.seats[1].openMelds = [];
  g.state.seats[1].discards = [];
  g.state.seats[1].isMenzen = true;
  // recompute since we mutated hand shape after the discard call cached options,
  // and refresh the cache discard() populated so resolveCalls sees the update
  const callOptions = game.getCallOptions(g, 0, tiles.indexOf("s", 2));
  g.state._pendingCallOptions = callOptions;
  ok("scenario/ron: seat 1 can ron", callOptions[1].ron === true, callOptions[1]);

  const scoreBefore1 = g.state.seats[1].score;
  const scoreBefore0 = g.state.seats[0].score;
  game.resolveCalls(g, { 1: "ron" });

  ok("scenario/ron: hand settles to hand-over", g.state.phase === "hand-over");
  ok("scenario/ron: winner (seat 1) gained 2000 (tanyao+pinfu, 2han30fu non-dealer ron)", g.state.seats[1].score - scoreBefore1 === 2000, g.state.seats[1].score);
  ok("scenario/ron: discarder (seat 0, dealer) paid 2000", scoreBefore0 - g.state.seats[0].score === 2000);
  ok("scenario/ron: dealer rotates after a non-dealer win", g.state.dealerSeat === 1);
  ok("scenario/ron: honba resets to 0 after a non-dealer win", g.state.honba === 0);
}

// --- scenario: tsumo, dealer repeats (renchan) ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  // same tanyao/pinfu shape, self-drawn 2s -> menzen tsumo + tanyao + pinfu(20fu tsumo)
  g.state.seats[0].concealed = countsFromNotations([
    "2m", "3m", "4m", "4m", "5m", "6m", "6p", "7p", "8p", "5s", "5s", "3s", "4s",
  ]);
  g.state.seats[0].drawnTile = tiles.indexOf("s", 2);
  g.state.seats[0].openMelds = [];
  g.state.seats[0].isMenzen = true;

  const turnOptions = game.getTurnOptions(g);
  ok("scenario/tsumo: dealer can tsumo", turnOptions.canTsumo === true, turnOptions);

  const before = g.state.seats.map((s) => s.score);
  game.declareTsumo(g, 0);

  ok("scenario/tsumo: hand settles to hand-over", g.state.phase === "hand-over");
  ok("scenario/tsumo: dealer gained points", g.state.seats[0].score > before[0]);
  ok("scenario/tsumo: each non-dealer paid the same amount (dealer tsumo splits evenly)", g.state.seats[1].score - before[1] === g.state.seats[2].score - before[2] && g.state.seats[2].score - before[2] === g.state.seats[3].score - before[3]);
  ok("scenario/tsumo: dealer repeats after a dealer win (renchan)", g.state.dealerSeat === 0);
  ok("scenario/tsumo: honba increments on dealer repeat", g.state.honba === 1);
}

// --- scenario: chi call changes turn order and opens the hand ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  g.state.seats[0].drawnTile = tiles.indexOf("m", 5);
  game.discard(g, 0, tiles.indexOf("m", 5), {});

  const chiSeat = 1;
  g.state.seats[chiSeat].concealed[tiles.indexOf("m", 4)] = 1;
  g.state.seats[chiSeat].concealed[tiles.indexOf("m", 6)] = 1;
  const callOptions = game.getCallOptions(g, 0, tiles.indexOf("m", 5));
  g.state._pendingCallOptions = callOptions; // refresh the cache discard() took before this seat's hand was set up
  ok("scenario/chi: seat 1 (shimocha) has a chi option", callOptions[1].chiOptions.length > 0, callOptions[1]);

  game.resolveCalls(g, { 1: "chi", chiTiles: [tiles.indexOf("m", 4), tiles.indexOf("m", 6)] });

  ok("scenario/chi: turn jumps straight to the caller", g.state.turnSeat === 1);
  ok("scenario/chi: phase is awaiting-turn-action with no new draw", g.state.phase === "awaiting-turn-action");
  ok("scenario/chi: caller's drawnTile is still null (no draw on a call)", g.state.seats[1].drawnTile === null);
  ok("scenario/chi: caller now has an open chi meld", g.state.seats[1].openMelds.length === 1 && g.state.seats[1].openMelds[0].type === "chi");
  ok("scenario/chi: caller's hand is no longer menzen", g.state.seats[1].isMenzen === false);
  ok("scenario/chi: claimed tiles removed from concealed", g.state.seats[1].concealed[tiles.indexOf("m", 4)] === 0 && g.state.seats[1].concealed[tiles.indexOf("m", 6)] === 0);
  ok("scenario/chi: discarder's pile no longer holds the claimed tile", g.state.seats[0].discards.length === 0);
}

// --- scenario: pon call jumps turn order past intervening seats ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  g.state.seats[0].drawnTile = tiles.indexOf("p", 7);
  game.discard(g, 0, tiles.indexOf("p", 7), {});

  g.state.seats[3].concealed[tiles.indexOf("p", 7)] = 2;
  const callOptions = game.getCallOptions(g, 0, tiles.indexOf("p", 7));
  g.state._pendingCallOptions = callOptions; // refresh the cache discard() took before this seat's hand was set up
  ok("scenario/pon: seat 3 can pon", callOptions[3].pon === true);

  game.resolveCalls(g, { 3: "pon" });
  ok("scenario/pon: turn jumps to the caller, skipping seats 1 and 2", g.state.turnSeat === 3);
  ok("scenario/pon: caller has an open pon meld", g.state.seats[3].openMelds[0].type === "pon");
  ok("scenario/pon: caller's concealed count for that tile is now 0", g.state.seats[3].concealed[tiles.indexOf("p", 7)] === 0);
}

// --- scenario: minkan (open kan via call) draws a rinshan tile and reveals a new dora indicator ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  g.state.deadWall = tiles.shuffle(tiles.buildWall()).map((t) => t.kind).slice(0, 14);
  g.state.doraIndicators = [g.state.deadWall[4]];
  g.state.uraDoraIndicators = [g.state.deadWall[5]];
  g.state.wall = [tiles.indexOf("z", 3)]; // one spare tile for the dead-wall replenishment pop
  g.state.seats[0].drawnTile = tiles.indexOf("z", 4);
  game.discard(g, 0, tiles.indexOf("z", 4), {});

  g.state.seats[2].concealed[tiles.indexOf("z", 4)] = 3;
  const callOptions = game.getCallOptions(g, 0, tiles.indexOf("z", 4));
  g.state._pendingCallOptions = callOptions; // refresh the cache discard() took before this seat's hand was set up
  ok("scenario/minkan: seat 2 has a kan option", callOptions[2].kanOptions === true);

  const doraCountBefore = g.state.doraIndicators.length;
  game.resolveCalls(g, { 2: "kan" });

  ok("scenario/minkan: caller's turn with a fresh (rinshan) drawn tile", g.state.turnSeat === 2 && g.state.seats[2].drawnTile != null);
  ok("scenario/minkan: kanCount incremented", g.state.kanCount === 1);
  ok("scenario/minkan: a new dora indicator was revealed", g.state.doraIndicators.length === doraCountBefore + 1);
  ok("scenario/minkan: caller has an open kan meld of 4 tiles", g.state.seats[2].openMelds[0].type === "kan" && g.state.seats[2].openMelds[0].tiles.length === 4);
}

// --- scenario: riichi declaration locks the discard choice to the drawn tile ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 1;
  g.state.phase = "awaiting-turn-action";
  // already-tenpai 13-tile hand: 3 complete simple runs + pair + 4m5m ryanmen
  // (waits on 3m/6m); the drawn tile is unrelated, so tsumogiri-ing it back
  // out is the tenpai-preserving riichi discard.
  g.state.seats[1].concealed = countsFromNotations([
    "2p", "3p", "4p", "5s", "6s", "7s", "2s", "3s", "4s", "6p", "6p", "4m", "5m",
  ]);
  g.state.seats[1].drawnTile = tiles.indexOf("z", 7); // unrelated isolated tile (Chun)
  g.state.seats[1].isMenzen = true;
  g.state.seats[1].score = 25000;

  const before = game.getTurnOptions(g);
  ok("scenario/riichi-lock: seat is eligible to riichi", before.canRiichi === true, before);

  game.discard(g, 1, tiles.indexOf("z", 7), { declareRiichi: true });
  ok("scenario/riichi-lock: riichiDeclared is now true", g.state.seats[1].riichiDeclared === true);
  ok("scenario/riichi-lock: 1000 points deducted", g.state.seats[1].score === 24000);
  ok("scenario/riichi-lock: riichi stick added to the pot", g.state.riichiSticks === 1);

  // simulate the next go-around back to seat 1 with a normal draw
  game.resolveCalls(g, {}); // everyone passes on the riichi discard
  // fast-forward turn/draws back to seat 1 without any calls happening
  g.state.turnSeat = 1;
  g.state.phase = "draw";
  g.state.wall = [tiles.indexOf("z", 5)]; // an unrelated tile
  game.drawTile(g);

  const afterOptions = game.getTurnOptions(g);
  ok("scenario/riichi-lock: post-riichi discardOptions is exactly [drawnTile]", afterOptions.discardOptions.length === 1 && afterOptions.discardOptions[0] === g.state.seats[1].drawnTile, afterOptions);
  ok("scenario/riichi-lock: no kan options are offered post-riichi", afterOptions.closedKanOptions.length === 0 && afterOptions.addedKanOptions.length === 0);

  assert.throws(() => game.discard(g, 1, tiles.indexOf("m", 5), {}), "scenario/riichi-lock: discarding a non-drawn tile after riichi must throw");
  passed++;
}

// --- scenario: furiten blocks a ron even though the discarded tile itself was never discarded by that seat ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0;
  g.state.turnSeat = 0;
  g.state.phase = "awaiting-turn-action";
  g.state.seats[0].drawnTile = tiles.indexOf("m", 3);
  game.discard(g, 0, tiles.indexOf("m", 3), {});

  // seat 2: tenpai on a 4m5m ryanmen (waits on 3m OR 6m), tanyao-valid shape
  g.state.seats[2].concealed = countsFromNotations([
    "2p", "3p", "4p", "5s", "6s", "7s", "2s", "3s", "4s", "6p", "6p", "4m", "5m",
  ]);
  g.state.seats[2].openMelds = [];
  g.state.seats[2].isMenzen = true;

  // sanity check: with a clean discard pile, this seat COULD ron on 3m
  g.state.seats[2].discards = [];
  let callOptions = game.getCallOptions(g, 0, tiles.indexOf("m", 3));
  ok("scenario/furiten: without furiten, seat 2 could ron on 3m", callOptions[2].ron === true, callOptions[2]);

  // now the seat has previously discarded 6m - the OTHER half of its own wait -
  // permanent furiten blocks ALL ron, including on 3m
  g.state.seats[2].discards = [tiles.indexOf("m", 6)];
  callOptions = game.getCallOptions(g, 0, tiles.indexOf("m", 3));
  ok("scenario/furiten: having discarded 6m (the other wait tile) blocks ron on 3m too", callOptions[2].ron === false, callOptions[2]);
}

// --- scenario: exhaustive draw computes tenpai payments correctly ---
{
  const g = game.createGame({ ruleset: "riichi", players: [{}, {}, {}, {}] });
  g.state.dealerSeat = 0; // dealer will be noten, to also check honba still increments on rotation
  g.state.turnSeat = 0;
  g.state.phase = "draw";
  g.state.wall = []; // already exhausted

  // seats 0 and 1: noten (scattered, no shape at all)
  g.state.seats[0].concealed = countsFromNotations(["1m", "3m", "5m", "7m", "9m", "1s", "3s", "5s", "7s", "9s", "1p", "3p", "5z"]);
  g.state.seats[1].concealed = countsFromNotations(["2m", "4m", "6m", "8m", "1s", "4s", "7s", "2p", "5p", "8p", "1z", "3z", "6z"]);
  // seats 2 and 3: tenpai (tanki wait on an isolated tile)
  g.state.seats[2].concealed = countsFromNotations(["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1s", "2s", "3s", "5p"]);
  g.state.seats[3].concealed = countsFromNotations(["1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "1s", "2s", "3s", "5m"]);

  const before = g.state.seats.map((s) => s.score);
  game.drawTile(g); // wall is empty -> triggers the exhaustive draw path

  ok("scenario/exhaustive: hand settles to hand-over", g.state.phase === "hand-over");
  ok("scenario/exhaustive: noten seat 0 pays 1500", before[0] - g.state.seats[0].score === 1500, g.state.seats[0].score);
  ok("scenario/exhaustive: noten seat 1 pays 1500", before[1] - g.state.seats[1].score === 1500);
  ok("scenario/exhaustive: tenpai seat 2 receives 1500", g.state.seats[2].score - before[2] === 1500);
  ok("scenario/exhaustive: tenpai seat 3 receives 1500", g.state.seats[3].score - before[3] === 1500);
  ok("scenario/exhaustive: dealer (noten) rotates", g.state.dealerSeat === 1);
  ok("scenario/exhaustive: honba still increments even though the dealer rotated", g.state.honba === 1);
}

console.log("game.test.js: " + passed + " assertions passed");
