const assert = require("assert");
const CARDS = require("../core/cards.js");
const B = require("../games/bust-seven.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const N = (...values) => values.map((v) => B.num(v));
const values = (hand) => hand.numbers.map((c) => c.value).join(",");

// Round 1 is dealt by seat 0, so the deal (and the first turn) starts at
// seat 1 and the dealer gets the last card. `stack` is drawn front first.
function dealt(seatCount, stack) {
  const state = B.createGame(Array(seatCount).fill("human"), { rng: CARDS.makeRng(1) });
  state.deck = stack;
  B.startRound(state);
  return state;
}

// ---- deck and scoring --------------------------------------------------------

(function deckTests() {
  const deck = B.buildDeck();
  ok("94 cards", deck.length === 94);
  const numbers = deck.filter((c) => c.kind === "number");
  ok("79 number cards", numbers.length === 79);
  ok("one 0", numbers.filter((c) => c.value === 0).length === 1);
  for (let v = 1; v <= 12; v++) ok(v + " copies of " + v, numbers.filter((c) => c.value === v).length === v);
  ok("+2..+10 once each", deck.filter((c) => c.kind === "add").map((c) => c.value).join() === "2,4,6,8,10");
  ok("one x2", deck.filter((c) => c.kind === "x2").length === 1);
  for (const type of ["freeze", "flip3", "second"]) ok("three " + type, deck.filter((c) => c.value === type).length === 3);
  ok("ids unique", new Set(deck.map((c) => c.id)).size === 94);
})();

(function scoreTests() {
  const hand = B.emptyHand();
  hand.numbers = N(3, 7, 12);
  ok("numbers add up", B.handScore(hand) === 22);
  hand.mods = [B.add(4), B.times2()];
  ok("x2 doubles numbers, then +4", B.handScore(hand) === 48);
  hand.status = "seven";
  ok("seven adds 15 after x2", B.handScore(hand) === 63);
  hand.status = "bust";
  ok("a bust scores 0", B.handScore(hand) === 0);
})();

(function createTests() {
  assert.throws(() => B.createGame(["human"]), /2-4/);
  assert.throws(() => B.createGame(Array(5).fill("ai")), /2-4/);
  const state = B.createGame(["human", "ai", "ai"]);
  ok("deck starts full", state.deck.length === 94 && state.discard.length === 0);
  ok("waits for the first deal", state.phase === "round-over" && state.round === 0);
})();

// ---- the deal and turns -------------------------------------------------------

(function dealTests() {
  const state = dealt(3, N(5, 7, 9, 5));
  ok("seat 1 dealt first", values(state.hands[1]) === "5");
  ok("seat 2 next", values(state.hands[2]) === "7");
  ok("dealer last", values(state.hands[0]) === "9");
  ok("seat 1 acts first", state.phase === "turn" && B.actingSeat(state) === 1);
  assert.throws(() => B.hit(state, 2), /turn/);

  B.hit(state, 1);
  ok("duplicate number busts", state.hands[1].status === "bust" && state.hands[1].bustCard.value === 5);
  ok("turn passes on", B.actingSeat(state) === 2);
  B.stay(state, 2);
  ok("stay banks the hand", state.hands[2].status === "stayed");
  ok("busted and stayed seats are skipped", B.actingSeat(state) === 0);
  B.stay(state, 0);
  ok("round ends once nobody is drawing", state.phase === "round-over");
  ok("scores banked", state.seats.map((s) => s.score).join() === "9,0,7");
  ok("every card goes to the discards", state.discard.length === 4 && state.deck.length === 0);

  state.deck = N(1, 2, 3);
  B.startRound(state);
  ok("the deal moves left", state.dealer === 1 && values(state.hands[2]) === "1" && values(state.hands[1]) === "3");
})();

(function modifierTests() {
  const state = dealt(2, [B.times2(), B.num(6), B.add(10)]);
  ok("modifier dealt to seat 1", state.hands[1].mods.length === 1);
  B.hit(state, 1);
  ok("modifiers never bust", state.hands[1].status === "active");
  ok("x2 doesn't double a +10", B.handScore(state.hands[1]) === 10);
})();

(function secondChanceTests() {
  const state = dealt(2, [B.action("second"), B.num(4), B.num(8), B.num(8)]);
  ok("first Second Chance is kept", !!state.hands[1].second);
  B.hit(state, 1); // 8
  B.stay(state, 0);
  B.hit(state, 1); // second 8
  ok("Second Chance saves a bust", state.hands[1].status === "active" && values(state.hands[1]) === "8");
  ok("it is used up", state.hands[1].second === null);
  ok("duplicate and Second Chance discarded", state.discard.length === 2);
})();

(function extraSecondChanceTests() {
  const state = dealt(3, [B.action("second"), B.num(1), B.num(2), B.action("second")]);
  B.hit(state, 1);
  ok("an extra Second Chance must be given away", state.phase === "target" && state.pending.targets.join() === "0,2");
  B.chooseTarget(state, 1, 0);
  ok("chosen seat gets it", !!state.hands[0].second && !state.hands[2].second);

  const solo = dealt(2, [B.action("second"), B.action("second"), B.action("second")]);
  ok("dealer takes the second Second Chance", !!solo.hands[0].second);
  B.hit(solo, 1);
  ok("nobody left to take it: discarded", solo.discard.length === 1 && solo.phase === "turn");
})();

(function freezeTests() {
  const state = dealt(3, [B.action("freeze"), B.num(6), B.num(9)]);
  ok("freeze in the deal waits on its drawer", state.phase === "target" && B.actingSeat(state) === 1);
  ok("any active seat, the drawer too", state.pending.targets.join() === "0,1,2");
  assert.throws(() => B.chooseTarget(state, 2, 0), /waiting/);
  B.chooseTarget(state, 1, 0);
  ok("the dealer is frozen before their card", state.hands[0].status === "frozen" && state.hands[0].numbers.length === 0);
  ok("the deal goes on and skips them", values(state.hands[2]) === "6" && state.deck.length === 1);
  assert.throws(() => B.chooseTarget(state, 1, 0), /waiting/);

  const last = dealt(2, N(3, 4).concat([B.action("freeze")]));
  B.stay(last, 1);
  B.hit(last, 0);
  ok("the only active seat freezes itself", last.phase === "round-over" && last.hands[0].status === "frozen");
  ok("and banks", last.seats[0].score === 4);
})();

(function flipThreeTests() {
  const state = dealt(3, [B.action("flip3"), B.num(5), B.action("freeze"), B.num(6), B.num(2), B.num(7)]);
  B.chooseTarget(state, 1, 2);
  ok("target flipped three", values(state.hands[2]) === "5,6");
  ok("a Freeze flipped mid-way waits until the three are done", state.phase === "target" && state.pending.seat === 2);
  ok("dealer not dealt yet", state.hands[0].numbers.length === 0);
  B.chooseTarget(state, 2, 1);
  ok("then the target resolves it", state.hands[1].status === "frozen");
  ok("and the deal finishes", values(state.hands[2]) === "5,6,2" && values(state.hands[0]) === "7");

  const bust = dealt(2, [B.action("flip3"), B.num(3), B.action("flip3"), B.num(3), B.num(9)]);
  B.chooseTarget(bust, 1, 0);
  ok("flip three stops at a bust", bust.hands[0].status === "bust" && bust.deck.length === 1);
  ok("a waiting action card is discarded on a bust", bust.discard.length === 1 && bust.discard[0].value === "flip3");
})();

(function sevenExactTests() {
  const state = dealt(2, N(1, 2, 3, 4, 5, 6, 7, 8));
  B.hit(state, 1); // 3
  B.stay(state, 0);
  [4, 5, 6, 7, 8].forEach(() => B.hit(state, 1));
  ok("seven different numbers", state.hands[1].status === "seven");
  ok("scores the bonus", state.seats[1].score === 1 + 3 + 4 + 5 + 6 + 7 + 8 + 15);
  ok("ends the round", state.phase === "round-over");
})();

(function sevenWithWaitingActionTests() {
  // Seat 1 holds six numbers and flips three: Freeze waits, then the seventh number ends the round.
  const state = dealt(2, N(1, 2));
  state.deck = N(3, 4, 5, 6, 7).concat([B.action("flip3"), B.action("freeze"), B.num(12), B.num(11)]);
  B.hit(state, 1); // 3
  B.stay(state, 0);
  for (let k = 0; k < 4; k++) B.hit(state, 1);
  ok("six numbers held", state.hands[1].numbers.length === 6);
  B.hit(state, 1); // Flip Three - seat 0 has stayed, so seat 1 takes it
  ok("seventh number ends the round mid-flip-three", state.phase === "round-over" && state.hands[1].status === "seven");
  ok("the waiting Freeze is discarded, the last card stays in the deck", state.deck.length === 1 && state.discard.length === 10);
})();

// ---- game end and reshuffle ----------------------------------------------------

(function gameEndTests() {
  const state = dealt(2, N(10, 12));
  state.seats[0].score = 190;
  state.seats[1].score = 190;
  B.stay(state, 1);
  B.stay(state, 0);
  ok("higher total at 200+ wins", state.gameOver && state.winner === 0 && state.seats[0].score === 202);

  const tie = dealt(2, N(10, 10));
  tie.seats[0].score = 195;
  tie.seats[1].score = 195;
  B.stay(tie, 1);
  ok("seat 0 can still play on", B.actingSeat(tie) === 0);
  tie.deck = N(5);
  B.stay(tie, 0);
  ok("a tie at the top plays on", !tie.gameOver && tie.phase === "round-over");
  assert.throws(() => B.stay(tie, 0), /turn/);
})();

(function reshuffleTests() {
  const state = dealt(2, N(4, 5));
  state.discard = N(9);
  B.hit(state, 1);
  ok("an empty deck is refilled from the discards", values(state.hands[1]) === "4,9" && state.discard.length === 0);
})();

// ---- AI --------------------------------------------------------------------------

(function aiTests() {
  const state = dealt(2, N(6, 9));
  state.deck = N(6, 6, 1, 2);
  ok("bust chance counts held numbers left in the deck", B.bustChance(state, 1) === 0.5);
  ok("only held numbers count", B.bustChance(state, 0) === 0 && B.aiShouldHit(state, 0));
  state.deck = N(1, 2, 3);
  ok("no risk: always hits", B.bustChance(state, 1) === 0 && B.aiShouldHit(state, 1));

  state.hands[1].numbers = N(12, 11, 10, 9);
  state.deck = N(12, 11, 10, 9, 1);
  ok("80% risk on 42: stays", !B.aiShouldHit(state, 1));
  state.hands[1].second = B.action("second");
  ok("a Second Chance makes the next card safe", B.aiShouldHit(state, 1));
  state.hands[1].second = null;

  state.seats[1].score = 160;
  state.hands[1].numbers = N(12, 11, 10, 9);
  state.deck = N(1, 2, 3, 4, 5);
  ok("no risk even at a winning total: keeps drawing", B.aiShouldHit(state, 1));
  state.deck = N(12, 2, 3, 4, 5);
  ok("banks a winning total rather than risk it", !B.aiShouldHit(state, 1));

  state.seats[1].score = 0;
  state.seats[0].score = 190;
  state.hands[0].status = "stayed";
  state.hands[0].numbers = N(10);
  state.deck = N(12, 11, 10, 9, 1);
  ok("draws on when an opponent has banked the win", B.aiShouldHit(state, 1));
})();

(function aiTargetTests() {
  const state = dealt(3, [B.action("freeze"), B.num(2), B.num(11)]);
  state.hands[0].numbers = N(12, 11, 10, 9);
  state.deck = N(12, 11, 10, 9, 3);
  ok("freeze goes to the seat with room to grow, not the one about to bust", B.aiChooseTarget(state, 1) === 2);

  const gift = dealt(3, [B.action("second"), B.num(1), B.num(2), B.action("second")]);
  gift.seats[2].score = 150;
  B.hit(gift, 1);
  ok("an extra Second Chance goes to the lowest threat", B.aiChooseTarget(gift, 1) === 0);

  const flip = dealt(2, [B.action("flip3")]);
  flip.deck = N(1, 2, 3, 4);
  ok("flip three on an empty hand with no risk: take it", B.aiChooseTarget(flip, 1) === 1);
  flip.hands[0].numbers = N(12, 11, 10);
  flip.deck = N(12, 11, 10, 12, 11);
  ok("aim it at a big, risky hand", B.aiChooseTarget(flip, 1) === 0);
})();

// ---- full AI games ---------------------------------------------------------------

function playOut(state, policyFor) {
  let steps = 0;
  while (!state.gameOver) {
    B.startRound(state);
    while (state.phase !== "round-over") {
      if (++steps > 20000) throw new Error("game did not finish");
      const seat = B.actingSeat(state);
      (policyFor(seat) || B.stepAI)(state, seat);
    }
    ok("all 94 cards accounted for after a round", state.deck.length + state.discard.length === 94,
      { deck: state.deck.length, discard: state.discard.length });
  }
  return state;
}

for (const n of [2, 3, 4]) {
  for (let g = 0; g < 40; g++) {
    const state = playOut(B.createGame(Array(n).fill("ai"), { rng: CARDS.makeRng(1000 * n + g) }), () => null);
    ok(n + " seats game " + g + ": a single winner at 200+",
      state.winner != null && state.seats[state.winner].score >= B.TARGET &&
      state.seats.every((s, i) => i === state.winner || s.score < state.seats[state.winner].score));
  }
}

// A fixed "stop at 20" player that aims action cards at the other seat.
function stayAt20(state, seat) {
  if (state.phase === "target") return B.chooseTarget(state, seat, state.pending.targets.find((t) => t !== seat) ?? seat);
  return B.handScore(state.hands[seat]) < 20 ? B.hit(state, seat) : B.stay(state, seat);
}

(function aiStrengthTest() {
  let aiWins = 0;
  const games = 200;
  for (let g = 0; g < games; g++) {
    const baseline = g % 2;
    const state = playOut(B.createGame(["ai", "ai"], { rng: CARDS.makeRng(g + 1) }), (seat) => (seat === baseline ? stayAt20 : null));
    if (state.winner !== baseline) aiWins++;
  }
  ok("AI beats a stop-at-20 player in most games (" + aiWins + "/" + games + ")", aiWins > games * 0.58);
})();

console.log("bust-seven.test.js: " + passed + " assertions passed");
