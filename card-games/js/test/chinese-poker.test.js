const assert = require("assert");
const CARDS = require("../core/cards.js");
const CP = require("../games/chinese-poker.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function C(rank, suit) { return { rank, suit, id: rank + suit }; }

// ---- hand evaluation: 3-card front hands --------------------------------------

(function frontHands() {
  ok("high card front", CP.evaluateHand([C(4, "D"), C(9, "C"), C(12, "H")]).category === 0);
  ok("pair front", CP.evaluateHand([C(4, "D"), C(4, "C"), C(12, "H")]).category === 1);
  ok("trips front", CP.evaluateHand([C(4, "D"), C(4, "C"), C(4, "H")]).category === 3);
  ok("pair of aces beats pair of fours", CP.compareHandStrength(
    CP.evaluateHand([C(14, "D"), C(14, "C"), C(2, "H")]),
    CP.evaluateHand([C(4, "D"), C(4, "C"), C(13, "H")])) > 0);
})();

// ---- hand evaluation: 5-card hands ---------------------------------------------

(function fiveCardHands() {
  const highCard = CP.evaluateHand([C(2, "D"), C(5, "C"), C(9, "H"), C(11, "S"), C(4, "D")]);
  ok("high card = 0", highCard.category === 0);

  const pair = CP.evaluateHand([C(5, "D"), C(5, "C"), C(9, "H"), C(11, "S"), C(4, "D")]);
  ok("pair = 1", pair.category === 1);

  const twoPair = CP.evaluateHand([C(5, "D"), C(5, "C"), C(9, "H"), C(9, "S"), C(4, "D")]);
  ok("two pair = 2", twoPair.category === 2);

  const trips = CP.evaluateHand([C(5, "D"), C(5, "C"), C(5, "H"), C(9, "S"), C(4, "D")]);
  ok("trips = 3", trips.category === 3);

  const straight = CP.evaluateHand([C(3, "D"), C(4, "C"), C(5, "H"), C(6, "S"), C(7, "D")]);
  ok("straight = 4", straight.category === 4);

  const wheel = CP.evaluateHand([C(14, "D"), C(2, "C"), C(3, "H"), C(4, "S"), C(5, "D")]);
  ok("wheel (A-2-3-4-5) is a straight", wheel.category === 4);
  ok("wheel's high card is 5, not the ace", wheel.tiebreak[0] === 5);

  const flush = CP.evaluateHand([C(2, "S"), C(9, "S"), C(7, "S"), C(4, "S"), C(11, "S")]);
  ok("flush = 5", flush.category === 5);

  const fullHouse = CP.evaluateHand([C(8, "D"), C(8, "C"), C(8, "H"), C(4, "S"), C(4, "D")]);
  ok("full house = 6", fullHouse.category === 6);

  const quad = CP.evaluateHand([C(9, "D"), C(9, "C"), C(9, "H"), C(9, "S"), C(4, "D")]);
  ok("four of a kind = 7", quad.category === 7);

  const straightFlush = CP.evaluateHand([C(3, "S"), C(4, "S"), C(5, "S"), C(6, "S"), C(7, "S")]);
  ok("straight flush = 8", straightFlush.category === 8);

  const order = [highCard, pair, twoPair, trips, straight, flush, fullHouse, quad, straightFlush];
  for (let i = 1; i < order.length; i++) {
    ok("category " + i + " beats category " + (i - 1), CP.compareHandStrength(order[i], order[i - 1]) > 0);
  }

  ok("pair of kings beats pair of fours with same-ish kickers",
    CP.compareHandStrength(
      CP.evaluateHand([C(13, "D"), C(13, "C"), C(9, "H"), C(6, "S"), C(2, "D")]),
      CP.evaluateHand([C(4, "D"), C(4, "C"), C(9, "H"), C(6, "S"), C(2, "S")])) > 0);

  ok("equal 5-card hands compare as a true tie",
    CP.compareHandStrength(
      CP.evaluateHand([C(9, "D"), C(11, "C"), C(4, "H"), C(6, "S"), C(2, "D")]),
      CP.evaluateHand([C(9, "C"), C(11, "H"), C(4, "S"), C(6, "D"), C(2, "C")])) === 0);
})();

// ---- arrangement validity -------------------------------------------------------

(function arrangementValidity() {
  const validFront = [C(4, "D"), C(9, "C"), C(2, "H")];
  const validMiddle = [C(5, "D"), C(5, "C"), C(5, "H"), C(9, "S"), C(4, "S")]; // trips
  const validBack = [C(3, "S"), C(4, "H"), C(5, "S"), C(6, "S"), C(7, "S")]; // straight-ish (not flush: mixed suits ok as long as > trips)
  ok("ascending strength front<=middle<=back is valid", CP.isValidArrangement(validFront, validMiddle, validBack));

  const foulFront = [C(13, "D"), C(13, "C"), C(13, "H")]; // trips of kings - stronger than a weak middle
  const weakMiddle = [C(2, "D"), C(5, "C"), C(9, "H"), C(11, "S"), C(4, "D")]; // high card only
  ok("a strong front beating a weak middle fouls", !CP.isValidArrangement(foulFront, weakMiddle, validBack));
})();

// ---- submitArrangement + full showdown scoring ---------------------------------

function fullDeal(rng) {
  const deck = CARDS.shuffle(CARDS.buildDeck(), rng);
  return CARDS.dealEven(deck, 4);
}

(function submitRejectsBadPartitions() {
  const state = CP.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(5) });
  const hand = state.hands[0];
  assert.throws(() => CP.submitArrangement(state, 0, hand.slice(0, 3), hand.slice(3, 7), hand.slice(7, 11)), "rejects wrong total count");
  assert.throws(() => CP.submitArrangement(state, 0, [hand[0], hand[0], hand[1]], hand.slice(3, 8), hand.slice(8, 13)), "rejects duplicate card");
  const foreign = { rank: 7, suit: "C", id: "7C-foreign" };
  const notForeignHand = hand.filter((c) => c.id !== "7C");
  assert.throws(() => CP.submitArrangement(state, 0, [foreign, notForeignHand[0], notForeignHand[1]], notForeignHand.slice(2, 7), notForeignHand.slice(7, 12)), "rejects a card not in this seat's hand");
  passed += 3;
})();

(function foulIsAcceptedNotRejected() {
  const state = CP.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(6) });
  const hand = CARDS.sortByRank(state.hands[0]);
  // Deliberately put the 3 highest cards in front to try to force a foul.
  const front = hand.slice(10, 13);
  const middle = hand.slice(0, 5);
  const back = hand.slice(5, 10);
  CP.submitArrangement(state, 0, front, middle, back);
  ok("submission is accepted even when it fouls (or doesn't - just must not throw)", state.arrangements[0] !== null);
})();

for (let g = 0; g < 20; g++) {
  const state = CP.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(700 + g) });
  // Auto-submission for AI seats is a UI-layer concern (see chinese-poker-ui.js
  // create()) - the engine itself only reacts once all 4 seats have submitted.
  for (let seat = 0; seat < 4; seat++) {
    const a = CP.aiArrange(state.hands[seat]);
    CP.submitArrangement(state, seat, a.front, a.middle, a.back);
  }
  ok("game " + g + " resolves once all 4 AI seats submit", state.gameOver === true);
  ok("game " + g + " scores are zero-sum", state.scores.reduce((a, b) => a + b, 0) === 0);
  state.hands.forEach((hand, seat) => {
    const arr = state.arrangements[seat];
    const combined = [...arr.front, ...arr.middle, ...arr.back];
    ok("game " + g + " seat " + seat + " arrangement uses exactly its 13 dealt cards",
      combined.length === 13 && new Set(combined.map((c) => c.id)).size === 13 &&
      combined.every((c) => hand.some((h) => h.id === c.id)));
  });
}

// ---- AI arrangement quality (structural validity across many random hands) ----

let aiFoulCount = 0;
for (let g = 0; g < 200; g++) {
  const hands = fullDeal(CARDS.makeRng(9000 + g));
  const hand = hands[0];
  const a = CP.aiArrange(hand);
  const combined = [...a.front, ...a.middle, ...a.back];
  ok("ai arrangement " + g + " is a full valid partition of the 13-card hand",
    combined.length === 13 && new Set(combined.map((c) => c.id)).size === 13 &&
    combined.every((c) => hand.some((h) => h.id === c.id)));
  if (!CP.isValidArrangement(a.front, a.middle, a.back)) aiFoulCount++;
}
ok("ai arrangement heuristic fouls rarely across 200 random hands", aiFoulCount < 10, { aiFoulCount });

console.log("chinese-poker.test.js: " + passed + " assertions passed (ai foul rate " + aiFoulCount + "/200)");
