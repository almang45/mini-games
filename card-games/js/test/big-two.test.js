const assert = require("assert");
const CARDS = require("../core/cards.js");
const BIG_TWO = require("../games/big-two.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function C(rank, suit) { return { rank, suit, id: rank + suit }; }
function allCardIds(state) { return state.hands.flat().map((c) => c.id); }

// ---- deal + leader -----------------------------------------------------------

(function dealAndLeader() {
  const state = BIG_TWO.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(1) });
  ok("52 cards dealt across 4 hands", new Set(allCardIds(state)).size === 52 && allCardIds(state).length === 52);
  state.hands.forEach((h, i) => ok("hand " + i + " has 13 cards", h.length === 13));
  ok("leader holds 3 of diamonds", state.hands[state.turnSeat].some((c) => c.suit === "D" && c.rank === 3));
})();

// ---- combo classification -----------------------------------------------------

(function singlesAndPairsAndTriples() {
  ok("single: describeCombo size 1", BIG_TWO.describeCombo([C(5, "S")]).size === 1);
  const pair = BIG_TWO.describeCombo([C(5, "D"), C(5, "C")]);
  ok("pair recognized", pair.size === 2);
  const mismatchPair = BIG_TWO.describeCombo([C(5, "D"), C(6, "C")]);
  ok("mismatched pair rejected", mismatchPair === null);
  const triple = BIG_TWO.describeCombo([C(9, "D"), C(9, "C"), C(9, "H")]);
  ok("triple recognized", triple.size === 3);
  ok("club 5 outranks diamond 5 (suit tiebreak)",
    BIG_TWO.describeCombo([C(5, "C")]).strength > BIG_TWO.describeCombo([C(5, "D")]).strength);
  ok("2 outranks ace as a single", BIG_TWO.describeCombo([C(2, "D")]).strength > BIG_TWO.describeCombo([C(14, "S")]).strength);
  ok("four raw cards is not a legal shape", BIG_TWO.describeCombo([C(5, "D"), C(5, "C"), C(5, "H"), C(5, "S")]) === null);
})();

(function fiveCardCategories() {
  const straight = BIG_TWO.describeCombo([C(3, "D"), C(4, "C"), C(5, "H"), C(6, "S"), C(7, "D")]);
  ok("3-4-5-6-7 is a straight (category 2)", straight && Math.floor(straight.strength / 1000) === 2);

  const brokenByTwo = BIG_TWO.describeCombo([C(10, "D"), C(11, "C"), C(12, "H"), C(13, "S"), C(2, "D")]);
  ok("a straight can't include the 2", brokenByTwo === null);

  const aceHighStraight = BIG_TWO.describeCombo([C(10, "D"), C(11, "C"), C(12, "H"), C(13, "S"), C(14, "D")]);
  ok("10-J-Q-K-A is a valid straight", aceHighStraight && Math.floor(aceHighStraight.strength / 1000) === 2);

  const flush = BIG_TWO.describeCombo([C(2, "S"), C(9, "S"), C(7, "S"), C(4, "S"), C(11, "S")]);
  ok("same-suit non-consecutive is a flush (category 3)", flush && Math.floor(flush.strength / 1000) === 3);

  const fullHouse = BIG_TWO.describeCombo([C(8, "D"), C(8, "C"), C(8, "H"), C(4, "S"), C(4, "D")]);
  ok("full house recognized (category 4)", fullHouse && Math.floor(fullHouse.strength / 1000) === 4);

  const quad = BIG_TWO.describeCombo([C(9, "D"), C(9, "C"), C(9, "H"), C(9, "S"), C(4, "D")]);
  ok("four of a kind + kicker recognized (category 5)", quad && Math.floor(quad.strength / 1000) === 5);

  const straightFlush = BIG_TWO.describeCombo([C(3, "S"), C(4, "S"), C(5, "S"), C(6, "S"), C(7, "S")]);
  ok("straight flush recognized (category 6)", straightFlush && Math.floor(straightFlush.strength / 1000) === 6);

  ok("category order: straight flush beats four of a kind", straightFlush.strength > quad.strength);
  ok("category order: four of a kind beats full house", quad.strength > fullHouse.strength);
  ok("category order: full house beats flush", fullHouse.strength > flush.strength);
  ok("category order: flush beats straight", flush.strength > straight.strength);

  const randomFive = BIG_TWO.describeCombo([C(2, "D"), C(5, "C"), C(9, "H"), C(11, "S"), C(4, "D")]);
  ok("an unrelated 5-card selection is illegal", randomFive === null);
})();

// ---- legality against a live pile ----------------------------------------------

(function mustMatchSizeAndBeatStrength() {
  const state = BIG_TWO.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(30) });
  const seat = state.turnSeat;
  state.pile = [C(9, "S")];
  state.pileCombo = BIG_TWO.describeCombo(state.pile);
  state.hands[seat] = [C(9, "D"), C(10, "C"), C(9, "C"), C(9, "H")];
  ok("same rank, lower suit does not beat the pile", !BIG_TWO.isLegalSelection(state, seat, [C(9, "D")]));
  ok("higher rank single beats the pile", BIG_TWO.isLegalSelection(state, seat, [C(10, "C")]));
  ok("a pair cannot answer a single", !BIG_TWO.isLegalSelection(state, seat, [C(9, "C"), C(9, "H")]));
})();

(function passingClearsPileAndSkipsFinishedSetter() {
  const state = BIG_TWO.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(31) });
  const rest = [];
  for (let s = 1; s < 4; s++) { rest.push(...state.hands[s]); state.hands[s] = []; }
  state.hands[0] = [C(3, "D")];
  state.hands[1] = rest.slice(0, 17);
  state.hands[2] = rest.slice(17, 34);
  state.hands[3] = rest.slice(34);
  state.turnSeat = 0;
  const result = BIG_TWO.playCards(state, 0, [C(3, "D")]);
  ok("seat 0 finished", state.finished[0] === true && !result.gameOver);
  ok("turn skips to seat 1", state.turnSeat === 1);
  BIG_TWO.passSeat(state, 1);
  BIG_TWO.passSeat(state, 2);
  ok("pile still open - setter finished, all 3 remaining must pass", state.pile.length === 1);
  BIG_TWO.passSeat(state, 3);
  ok("pile clears once every remaining active seat has passed", state.pile.length === 0);
  ok("lead moves to seat 1, not the finished seat 0", state.turnSeat === 1);
})();

// ---- full randomized AI-vs-AI games --------------------------------------------

for (let g = 0; g < 15; g++) {
  const state = BIG_TWO.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(600 + g) });
  let guard = 0;
  while (!state.gameOver) {
    if (++guard > 500) throw new Error("big two game " + g + " did not terminate within 500 steps");
    const seat = state.turnSeat;
    const combo = BIG_TWO.aiChoosePlay(state, seat);
    if (combo) {
      ok("ai combo is a legal selection", BIG_TWO.isLegalSelection(state, seat, combo), { seat, combo, pile: state.pile });
      BIG_TWO.playCards(state, seat, combo);
    } else {
      BIG_TWO.passSeat(state, seat);
    }
  }
  ok("game " + g + " finish order covers all 4 seats", state.finishOrder.length === 4);
  ok("game " + g + " finish order has no duplicates", new Set(state.finishOrder).size === 4);
}

console.log("big-two.test.js: " + passed + " assertions passed");
