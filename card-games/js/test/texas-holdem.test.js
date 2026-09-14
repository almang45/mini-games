const assert = require("assert");
const CARDS = require("../core/cards.js");
const HOLDEM = require("../games/texas-holdem.js");
const CHINESE_POKER = require("../games/chinese-poker.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const card = (id) => {
  const suit = id.slice(-1);
  const rank = { T: 10, J: 11, Q: 12, K: 13, A: 14 }[id.slice(0, -1)] || Number(id.slice(0, -1));
  return { suit, rank, id: rank + suit };
};
const cards = (ids) => ids.split(" ").map(card);
const total = (state) => state.chips.reduce((a, b) => a + b, 0) + (state.hand.phase === "betting" ? HOLDEM.potTotal(state.hand) : 0);

// Board cards come off the end of the deck with a burn before each street.
function rig(state, holes, board) {
  const h = state.hand;
  holes.forEach((ids, seat) => { h.holes[seat] = cards(ids); });
  const [b1, b2, b3, b4, b5] = cards(board);
  const burn = card("2C");
  h.deck = [b5, burn, b4, burn, b3, b2, b1, burn];
}

function checkDown(state) {
  while (state.hand.phase === "betting") HOLDEM.act(state, state.hand.turnSeat, { type: "check" });
}

// ---- hand ranking --------------------------------------------------------------

(function namedHands() {
  const cat = (ids) => HOLDEM.evaluate(cards(ids));
  ok("wheel straight is 5-high", JSON.stringify(cat("AS 2D 3C 4H 5S KD KC")) === JSON.stringify({ category: 4, tiebreak: [5] }));
  ok("steel wheel", cat("AH 2H 3H 4H 5H 9C 9D").category === 8);
  ok("flush uses the top five of six suited cards", JSON.stringify(cat("AH 9H 7H 5H 3H 2H KS").tiebreak) === "[14,9,7,5,3]");
  ok("two trips make a full house with the higher set", JSON.stringify(cat("9S 9D 9C 4H 4S 4D AC")) === JSON.stringify({ category: 6, tiebreak: [9, 4] }));
  ok("third pair can be the kicker", JSON.stringify(cat("KS KD 8C 8H 6S 6D 2C").tiebreak) === "[13,8,6]");
  ok("quads keep the best kicker", JSON.stringify(cat("7S 7D 7C 7H AS 2D 3C").tiebreak) === "[7,14]");
  ok("flush beats straight", HOLDEM.compare(cat("AH 9H 7H 5H 3H KS QD"), cat("TS JD QC KH AS 2D 3C")) > 0);
})();

(function matchesBruteForce() {
  const rng = CARDS.makeRng(99);
  const deck = CARDS.buildDeck();
  const subsets = [];
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) subsets.push([a, b]);
  let mismatches = 0;
  for (let i = 0; i < 3000; i++) {
    const seven = CARDS.shuffle(deck, rng).slice(0, 7);
    let best = null;
    for (const [a, b] of subsets) {
      const score = CHINESE_POKER.evaluateHand(seven.filter((_, k) => k !== a && k !== b));
      if (!best || CHINESE_POKER.compareHandStrength(score, best) > 0) best = score;
    }
    if (JSON.stringify(HOLDEM.evaluate(seven)) !== JSON.stringify(best)) mismatches++;
  }
  ok("7-card evaluator matches the best of 21 five-card hands on 3000 deals", mismatches === 0, { mismatches });
})();

// ---- blinds and action order -----------------------------------------------------

(function threeHanded() {
  const state = HOLDEM.createGame(["human", "human", "human"], { rng: CARDS.makeRng(1) });
  const h = state.hand;
  ok("Seat 1 has the first button", state.dealerSeat === 0);
  ok("blinds come from the next two seats", h.smallBlindSeat === 1 && h.bigBlindSeat === 2 && state.chips.join() === "500,490,480");
  ok("two hole cards each", h.holes.every((x) => x.length === 2));
  ok("the button acts first three-handed", h.turnSeat === 0);
  assert.throws(() => HOLDEM.act(state, 0, { type: "check" }), /facing a bet/); passed++;
  assert.throws(() => HOLDEM.act(state, 1, { type: "call" }), /turn/); passed++;
  assert.throws(() => HOLDEM.act(state, 0, { type: "raise", to: 39 }), /illegal raise/); passed++;

  HOLDEM.act(state, 0, { type: "call" });
  HOLDEM.act(state, 1, { type: "call" });
  ok("the big blind gets an option", h.turnSeat === 2 && HOLDEM.legalActions(state, 2).canCheck);
  HOLDEM.act(state, 2, { type: "raise", to: 60 });
  ok("a raise reopens the action", h.turnSeat === 0 && HOLDEM.legalActions(state, 0).toCall === 40);
  ok("the next raise must be at least as big", HOLDEM.legalActions(state, 0).minRaiseTo === 100);
  HOLDEM.act(state, 0, { type: "call" });
  HOLDEM.act(state, 1, { type: "fold" });
  ok("the flop comes after everyone matches", h.street === 1 && h.board.length === 3 && h.turnSeat === 2);
  HOLDEM.act(state, 2, { type: "check" });
  HOLDEM.act(state, 0, { type: "raise", to: 50 });
  HOLDEM.act(state, 2, { type: "fold" });
  ok("the last player standing takes the pot uncontested", h.phase === "hand-end" && h.result.uncontested && state.chips.join() === "580,480,440", state.chips);

  HOLDEM.startHand(state);
  ok("the button moves left", state.dealerSeat === 1 && state.hand.smallBlindSeat === 2 && state.hand.bigBlindSeat === 0);
})();

(function headsUp() {
  const state = HOLDEM.createGame(["human", "human"], { rng: CARDS.makeRng(2) });
  const h = state.hand;
  ok("heads-up the button posts the small blind", h.smallBlindSeat === 0 && h.bigBlindSeat === 1);
  ok("and acts first before the flop", h.turnSeat === 0);
  HOLDEM.act(state, 0, { type: "call" });
  HOLDEM.act(state, 1, { type: "check" });
  ok("the big blind acts first after the flop", h.street === 1 && h.turnSeat === 1);
  HOLDEM.act(state, 1, { type: "raise", to: 20 });
  ok("the first bet on a street is a bet, not a raise", /bets 20/.test(state.log[state.log.length - 1].text));
})();

// ---- showdown and side pots --------------------------------------------------------

(function sidePot() {
  const state = HOLDEM.createGame(["human", "human", "human"], { rng: CARDS.makeRng(3) });
  state.chips[0] = 80;
  rig(state, ["AS AD", "KS KD", "QS QD"], "2H 7D 9C JS 3H");
  HOLDEM.act(state, 0, { type: "raise", to: 80 });
  HOLDEM.act(state, 1, { type: "raise", to: 300 });
  HOLDEM.act(state, 2, { type: "call" });
  const before = total(state);
  const pots = HOLDEM.buildPots(state);
  ok("main pot for the short stack, side pot for the rest",
    pots.length === 2 && pots[0].amount === 240 && pots[0].eligible.join() === "0,1,2" && pots[1].amount === 440 && pots[1].eligible.join() === "1,2", pots);
  checkDown(state);
  ok("aces win the main pot, kings the side pot", state.chips.join() === "240,640,200", state.chips);
  ok("no chips created or lost", state.chips.reduce((a, b) => a + b, 0) === before);
  ok("showdown shows every live hand", state.hand.result.hands.length === 3);
})();

(function splitWithOddChip() {
  const state = HOLDEM.createGame(["human", "human", "human"], { rng: CARDS.makeRng(4) });
  rig(state, ["2C 3D", "4S 5C", "6D 7S"], "AH KH QH JH TH");
  HOLDEM.act(state, 0, { type: "raise", to: 45 });
  HOLDEM.act(state, 1, { type: "raise", to: 105 });
  HOLDEM.act(state, 2, { type: "call" });
  HOLDEM.act(state, 0, { type: "fold" });
  checkDown(state);
  ok("a 255 pot splits 128/127, odd chip left of the button", state.chips.join() === "455,523,522", state.chips);
})();

(function bustEndsSession() {
  const state = HOLDEM.createGame(["human", "human"], { rng: CARDS.makeRng(5) });
  state.chips[1] = 30;
  rig(state, ["AS AD", "7C 2D"], "3C 8D 9S JH KC");
  HOLDEM.act(state, 0, { type: "raise", to: 500 });
  ok("an all-in for less can only be called or folded", !HOLDEM.legalActions(state, 1).canRaise && HOLDEM.legalActions(state, 1).toCall === 30);
  HOLDEM.act(state, 1, { type: "call" });
  ok("all in: the board runs out by itself", state.hand.board.length === 5);
  ok("the uncalled 450 goes back", state.chips.join() === "550,0", state.chips);
  ok("one player holding every chip ends the session", state.gameOver && state.hand.phase === "game-end");
})();

(function lastHumanBustsEndsSession() {
  const state = HOLDEM.createGame(["human", "ai", "ai"], { rng: CARDS.makeRng(7) });
  state.chips[0] = 30;
  rig(state, ["7C 2D", "4S 6H", "AS AD"], "3C 8D 9S JH KC");
  HOLDEM.act(state, 0, { type: "raise", to: 30 });
  HOLDEM.act(state, 1, { type: "fold" });
  HOLDEM.act(state, 2, { type: "call" });
  ok("the human busting ends the session while two AIs still have chips", state.gameOver && state.chips[0] === 0 && state.chips.filter((c) => c > 0).length === 2, state.chips);
})();

// ---- AI --------------------------------------------------------------------------------

(function aiDecisions() {
  const state = HOLDEM.createGame(["ai", "ai"], { rng: CARDS.makeRng(6) });
  rig(state, ["AS AH", "7C 2D"], "3C 8D 9S JH KC");
  const equity = HOLDEM.estimateEquity(state, 0, 3000);
  ok("aces are about 85% heads-up before the flop", equity > 0.8 && equity < 0.9, equity);
  ok("AI raises aces", HOLDEM.aiChooseAction(state, 0).type === "raise");
  HOLDEM.act(state, 0, { type: "raise", to: 500 });
  ok("AI folds seven-deuce to an all-in", HOLDEM.aiChooseAction(state, 1).type === "fold");
})();

(function aiSessions() {
  let busted = 0;
  for (let game = 0; game < 12; game++) {
    const seats = ["ai", "ai", "ai", "ai"].slice(0, 2 + (game % 3));
    const state = HOLDEM.createGame(seats, { rng: CARDS.makeRng(1000 + game) });
    const expected = HOLDEM.STARTING_CHIPS * seats.length;
    let steps = 0, leaks = 0;
    while (!state.gameOver) {
      if (state.hand.phase === "hand-end") HOLDEM.startHand(state);
      else HOLDEM.act(state, state.hand.turnSeat, HOLDEM.aiChooseAction(state, state.hand.turnSeat));
      if (total(state) !== expected) leaks++;
      if (++steps > 5000) throw new Error("session " + game + " did not finish");
    }
    const standing = state.chips.filter((c) => c > 0).length;
    ok("session " + game + " keeps every chip", leaks === 0 && state.chips.reduce((a, b) => a + b, 0) === expected, { leaks });
    ok("session " + game + " ends on the hand limit or a single stack", state.handNumber === HOLDEM.HAND_LIMIT || standing === 1, { hand: state.handNumber, standing });
    if (standing < seats.length) busted++;
  }
  ok("AI play is aggressive enough to bust someone in some sessions", busted > 0, { busted });
})();

console.log("texas-holdem.test.js: " + passed + " assertions passed");
