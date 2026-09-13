const assert = require("assert");
const CARDS = require("../core/cards.js");
const PRES = require("../games/president.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function allCardIds(state) { return state.hands.flat().map((c) => c.id); }

function playOutGame(state, maxSteps) {
  let steps = 0;
  while (!state.gameOver) {
    if (++steps > maxSteps) throw new Error("president game did not terminate within " + maxSteps + " steps");
    const seat = state.turnSeat;
    const combo = PRES.aiChoosePlay(state, seat);
    if (combo) {
      ok("ai combo is a legal selection", PRES.isLegalSelection(state, seat, combo), { seat, combo, pile: state.pile });
      PRES.playCards(state, seat, combo);
    } else {
      PRES.passSeat(state, seat);
    }
  }
}

// ---- deal + leader -----------------------------------------------------------

[3, 4].forEach((n) => {
  const seatTypes = Array.from({ length: n }, () => "ai");
  const state = PRES.createGame(seatTypes, { rng: CARDS.makeRng(n) });
  ok(n + "p: 52 cards dealt", new Set(allCardIds(state)).size === 52 && allCardIds(state).length === 52);
  ok(n + "p: leader holds 3 of clubs", state.hands[state.turnSeat].some((c) => c.suit === "C" && c.rank === 3));
});

// ---- rank ordering & legality -------------------------------------------------

(function twoIsHighAceIsSecond() {
  const state = PRES.createGame(["ai", "ai", "ai"], { rng: CARDS.makeRng(50) });
  const seat = state.turnSeat;
  const two = { suit: "S", rank: 2, id: "2S" };
  const ace = { suit: "S", rank: 14, id: "14S" };
  state.hands[seat] = [ace];
  state.pile = [two]; state.pileRank = CARDS.presidentValue(two); state.pileSize = 1;
  ok("ace cannot beat a lone 2 on the pile", !PRES.isLegalSelection(state, seat, [ace]));
})();

(function mustMatchPileSizeAndRank() {
  const state = PRES.createGame(["ai", "ai", "ai"], { rng: CARDS.makeRng(51) });
  const seat = state.turnSeat;
  const pair = [{ suit: "S", rank: 9, id: "9S" }, { suit: "H", rank: 9, id: "9H" }];
  const single = { suit: "C", rank: 10, id: "10C" };
  state.hands[seat] = [single, ...pair];
  state.pile = pair; state.pileRank = CARDS.presidentValue(pair[0]); state.pileSize = 2;
  ok("a single cannot beat a pair on the pile", !PRES.isLegalSelection(state, seat, [single]));
  const higherPair = [{ suit: "D", rank: 10, id: "10D" }, single];
  state.hands[seat] = higherPair;
  ok("a higher pair beats a lower pair", PRES.isLegalSelection(state, seat, higherPair));
})();

(function passingClearsPileAndReturnsLeadToSetter() {
  const state = PRES.createGame(["ai", "ai", "ai"], { rng: CARDS.makeRng(52) });
  const setter = state.turnSeat;
  const low = state.hands[setter].find((c) => c.suit === "C" && c.rank === 3);
  PRES.playCards(state, setter, [low]);
  ok("pile is set after the lead", state.pile.length === 1);
  const p1 = state.turnSeat;
  PRES.passSeat(state, p1);
  const p2 = state.turnSeat;
  ok("still on the pile after only one pass (3 active players)", state.pile.length === 1);
  PRES.passSeat(state, p2);
  ok("pile clears once every other active player has passed", state.pile.length === 0);
  ok("lead returns to whoever set the pile", state.turnSeat === setter);
})();

(function skipsFinishedPlayersOnLeadReturn() {
  const state = PRES.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(53) });
  // Force seat 0 to finish by giving it a single low card and everyone else nothing that beats it.
  const rest = [];
  for (let s = 1; s < 4; s++) { rest.push(...state.hands[s]); state.hands[s] = []; }
  state.hands[0] = [{ suit: "C", rank: 3, id: "3C" }];
  state.hands[1] = rest.slice(0, 17);
  state.hands[2] = rest.slice(17, 34);
  state.hands[3] = rest.slice(34);
  state.turnSeat = 0;
  const result = PRES.playCards(state, 0, [{ suit: "C", rank: 3, id: "3C" }]);
  ok("seat 0 finished (hand emptied)", state.finished[0] === true && !result.gameOver);
  ok("turn skips straight to seat 1", state.turnSeat === 1);
  // With the setter (seat 0) already finished, all 3 remaining active seats must pass to clear.
  PRES.passSeat(state, 1);
  PRES.passSeat(state, 2);
  ok("pile still open - not every active seat has passed yet", state.pile.length === 1);
  PRES.passSeat(state, 3);
  ok("pile clears once every remaining active seat has passed", state.pile.length === 0);
  ok("lead moves to the next active seat after the finished setter, not seat 0", state.turnSeat === 1 && !state.finished[1]);
})();

// ---- full randomized games -----------------------------------------------------

[3, 4].forEach((n) => {
  for (let g = 0; g < 10; g++) {
    const seatTypes = Array.from({ length: n }, () => "ai");
    const state = PRES.createGame(seatTypes, { rng: CARDS.makeRng(500 + n * 100 + g) });
    playOutGame(state, 500);
    ok(n + "p game " + g + " finish order covers all seats", state.finishOrder.length === n);
    ok(n + "p game " + g + " finish order has no duplicates", new Set(state.finishOrder).size === n);
    ok(n + "p game " + g + " everyone else emptied their hand", state.hands.every((h, i) => i === state.finishOrder[n - 1] ? true : h.length === 0));
  }
});

console.log("president.test.js: " + passed + " assertions passed");
