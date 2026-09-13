const assert = require("assert");
const CARDS = require("../core/cards.js");
const CE = require("../games/crazy-eights.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function allCardIds(state) {
  return state.hands.flat().map((c) => c.id)
    .concat(state.drawPile.map((c) => c.id))
    .concat(state.discardPile.map((c) => c.id));
}

function stepAI(state, seat) {
  let legal = CE.getLegalPlays(state, seat);
  if (legal.length === 0 && !state.pendingDraw) {
    CE.drawCard(state, seat);
    legal = CE.getLegalPlays(state, seat);
  }
  if (legal.length > 0) {
    const { card, declaredSuit } = CE.aiChoosePlay(state, seat);
    CE.playCard(state, seat, card, declaredSuit);
  }
}

function playOutGame(state, maxSteps) {
  let steps = 0;
  while (!state.gameOver) {
    if (++steps > maxSteps) throw new Error("crazy eights game did not terminate within " + maxSteps + " steps");
    ok("deck conserved mid-game", new Set(allCardIds(state)).size === 52 && allCardIds(state).length === 52);
    stepAI(state, state.turnSeat);
  }
}

// ---- deal counts ------------------------------------------------------------

[2, 3, 4].forEach((n) => {
  const seatTypes = Array.from({ length: n }, () => "ai");
  const state = CE.createGame(seatTypes, { rng: CARDS.makeRng(n) });
  const expected = CE.dealCount(n);
  state.hands.forEach((h, i) => ok(n + "p: hand " + i + " has " + expected + " cards", h.length === expected));
  ok(n + "p: initial discard is not an eight", CE.topCard(state).rank !== 8);
  ok(n + "p: full deck accounted for", new Set(allCardIds(state)).size === 52);
});

// ---- legality ---------------------------------------------------------------

(function legalityMatchesSuitOrRankOrEight() {
  const state = CE.createGame(["ai", "ai"], { rng: CARDS.makeRng(11) });
  const top = CE.topCard(state);
  const seat = state.turnSeat;
  const legal = CE.getLegalPlays(state, seat);
  legal.forEach((c) => {
    ok("legal card matches suit/rank/eight", c.rank === 8 || c.suit === CE.effectiveSuit(state) || c.rank === top.rank,
      { card: c, top });
  });
})();

(function eightAlwaysLegalAndRequiresDeclaredSuit() {
  const state = CE.createGame(["ai", "ai"], { rng: CARDS.makeRng(12) });
  const seat = state.turnSeat;
  const eight = state.hands[seat].find((c) => c.rank === 8) || { suit: "C", rank: 8, id: "8Z" };
  state.hands[seat].push(eight);
  ok("an eight is always playable", CE.isPlayable(state, eight));
  assert.throws(() => CE.playCard(state, seat, eight, undefined), "playing an eight without a declared suit throws");
  passed++;
  CE.playCard(state, seat, eight, "H");
  ok("declared suit takes effect", state.declaredSuit === "H" && CE.effectiveSuit(state) === "H");
})();

// ---- pending-draw flow --------------------------------------------------------

(function drawingAnUnplayableCardAutoPasses() {
  const state = CE.createGame(["ai", "ai"], { rng: CARDS.makeRng(13) });
  const seat = state.turnSeat;
  // Strip the hand down to a card that can never match the current top/effective suit or rank.
  const top = CE.topCard(state);
  const offSuit = CARDS.SUITS.find((s) => s !== CE.effectiveSuit(state));
  const offRanks = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14].filter((r) => r !== top.rank);
  state.hands[seat] = [{ suit: offSuit, rank: offRanks[0], id: "rigged1" }];
  state.drawPile.push({ suit: offSuit, rank: offRanks[1], id: "rigged-draw" });
  ok("no legal plays before draw", CE.getLegalPlays(state, seat).length === 0);
  const result = CE.drawCard(state, seat);
  ok("drew the rigged unplayable card", result.playable === false);
  ok("turn auto-advanced after unplayable draw", state.turnSeat !== seat);
  ok("no pendingDraw left hanging", state.pendingDraw === null);
})();

// ---- full randomized games -----------------------------------------------------

[2, 3, 4].forEach((n) => {
  for (let g = 0; g < 8; g++) {
    const seatTypes = Array.from({ length: n }, () => "ai");
    const state = CE.createGame(seatTypes, { rng: CARDS.makeRng(200 + n * 100 + g) });
    playOutGame(state, 2000);
    ok(n + "p game " + g + " has a winner", state.winner !== null);
    ok(n + "p game " + g + " winner's hand is empty", state.hands[state.winner].length === 0);
  }
});

console.log("crazy-eights.test.js: " + passed + " assertions passed");
