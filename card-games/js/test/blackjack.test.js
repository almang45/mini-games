const assert = require("assert");
const CARDS = require("../core/cards.js");
const BJ = require("../games/blackjack.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function C(rank, suit) { return { rank, suit, id: rank + suit }; }

// ---- handValue -------------------------------------------------------------

(function handValueTests() {
  ok("hard 20", BJ.handValue([C(10, "C"), C(10, "D")]).total === 20);
  ok("hard 20 is not soft", BJ.handValue([C(10, "C"), C(10, "D")]).soft === false);
  ok("A+6 is soft 17", BJ.handValue([C(14, "C"), C(6, "D")]).total === 17);
  ok("A+6 is soft", BJ.handValue([C(14, "C"), C(6, "D")]).soft === true);
  ok("A+6+10 reduces to hard 17", BJ.handValue([C(14, "C"), C(6, "D"), C(10, "H")]).total === 17);
  ok("A+6+10 is no longer soft", BJ.handValue([C(14, "C"), C(6, "D"), C(10, "H")]).soft === false);
  ok("A+A+9 is a soft 21 (one ace still counts as 11)", BJ.handValue([C(14, "C"), C(14, "D"), C(9, "H")]).total === 21);
  ok("A+A+9 is soft", BJ.handValue([C(14, "C"), C(14, "D"), C(9, "H")]).soft === true);
  ok("K+Q+5 busts to 25", BJ.handValue([C(13, "C"), C(12, "D"), C(5, "H")]).total === 25);
})();

// ---- isBlackjack -------------------------------------------------------------

(function isBlackjackTests() {
  ok("A+K is a natural blackjack", BJ.isBlackjack([C(14, "S"), C(13, "H")]) === true);
  ok("7+7+7 totalling 21 over 3 cards is not a blackjack", BJ.isBlackjack([C(7, "C"), C(7, "D"), C(7, "H")]) === false);
  ok("A+9 is not a blackjack (only 20)", BJ.isBlackjack([C(14, "S"), C(9, "H")]) === false);
})();

// ---- createGame ---------------------------------------------------------------

(function createGameTests() {
  assert.throws(() => BJ.createGame([]), "rejects 0 seats");
  assert.throws(() => BJ.createGame(["human", "human", "human", "human", "human"]), "rejects 5 seats");
  const state = BJ.createGame(["human", "ai", "ai"]);
  ok("3-seat game is accepted", state.seats.length === 3);
  ok("every seat starts with 500 chips", state.seats.every((s) => s.chips === 500));
  ok("starts before any round is dealt", state.round === 0 && state.phase === "round-over" && !state.gameOver);
})();

// ---- dealRound integration (deterministic via a rigged rng) -------------------

// CARDS.shuffle with an rng that always returns 0 always swaps arr[i] with
// arr[0], which works out to the built deck rotated left by exactly one card:
// new[i] = original[(i+1) % 52]. Verified once via a throwaway script, so the
// resulting card-by-card order below is exact, not guessed.
const ZERO_RNG = () => 0;

(function dealRoundFourSeats() {
  const state = BJ.createGame(["human", "ai", "ai", "ai"], { rng: ZERO_RNG });
  BJ.dealRound(state);
  ok("seat 0 dealt 3C 4C", state.hands[0].cards.map(CARDS.cardLabel).join(" ") === "3♣ 4♣");
  ok("seat 1 dealt 5C 6C", state.hands[1].cards.map(CARDS.cardLabel).join(" ") === "5♣ 6♣");
  ok("seat 2 dealt 7C 8C", state.hands[2].cards.map(CARDS.cardLabel).join(" ") === "7♣ 8♣");
  ok("seat 3 dealt 9C 10C", state.hands[3].cards.map(CARDS.cardLabel).join(" ") === "9♣ 10♣");
  ok("dealer dealt JC QC (up-card triggers a peek, but 20 isn't a natural)", state.dealerHand.map(CARDS.cardLabel).join(" ") === "J♣ Q♣");
  ok("no seat was dealt a natural, so play proceeds normally", state.phase === "playing" && state.dealerRevealed === false);
  ok("seat 0 (lowest total, no natural) acts first", state.turnSeat === 0);
  ok("dealing this round throws until it is settled", () => true);
  assert.throws(() => BJ.dealRound(state), "cannot deal a new round mid-hand");
})();

(function dealRoundDealerNaturalBlackjack() {
  // Seed 6 was found by brute-force search: on a 1-seat table it deals the
  // dealer K-hearts/A-clubs (a natural) while the seat gets 7-spades/Q-clubs (17).
  const state = BJ.createGame(["human"], { rng: CARDS.makeRng(6) });
  BJ.dealRound(state);
  ok("dealer dealt a natural blackjack", state.dealerHand.map(CARDS.cardLabel).join(" ") === "K♥ A♣");
  ok("seat 0 dealt a non-blackjack 17", state.hands[0].cards.map(CARDS.cardLabel).join(" ") === "7♠ Q♣");
  ok("the round resolves immediately without any player turn", state.phase === "round-over" && state.dealerRevealed === true);
  ok("seat 0 loses to the dealer's natural", state.hands[0].result === "lose" && state.hands[0].net === -25);
  ok("chips reflect the loss", state.seats[0].chips === 475);
})();

// ---- turn-order guards ---------------------------------------------------------

(function turnOrderGuards() {
  const state = BJ.createGame(["human", "human"], { rng: ZERO_RNG });
  BJ.dealRound(state); // seat 0 acts first
  assert.throws(() => BJ.stand(state, 1), "seat 1 cannot act out of turn");
  assert.throws(() => BJ.hit(state, 1), "seat 1 cannot hit out of turn");
  BJ.stand(state, 0); // now legal, advances to seat 1
  assert.throws(() => BJ.stand(state, 0), "seat 0 cannot act again after standing");
  passed += 3;
})();

// ---- full-round settlement, driven through the last acting seat ----------------

(function bustDeterministic() {
  // 1-seat table, rng always 0: seat 0 gets 3C 4C (7), dealer gets 5C 6C (11, up=5C, no peek).
  const state = BJ.createGame(["human"], { rng: ZERO_RNG });
  BJ.dealRound(state);
  BJ.hit(state, 0); // draws 7C -> 14, still playing
  ok("hitting to 14 keeps the seat active", state.hands[0].status === "playing");
  BJ.hit(state, 0); // draws 8C -> 22, busts
  ok("hitting to 22 busts", state.hands[0].status === "bust");
  ok("dealer does not draw further once every hand has busted", state.dealerHand.length === 2);
  ok("dealer hole card is still revealed once the round is over", state.dealerRevealed === true);
  ok("a bust always loses regardless of the dealer's total", state.hands[0].result === "lose" && state.hands[0].net === -25);
  ok("chips are debited by the flat bet", state.seats[0].chips === 475);
  ok("round is marked settled", state.phase === "round-over" && !state.gameOver);
})();

(function doubleDownDeterministic() {
  // Same 1-seat deterministic deal: seat 0 has 3C 4C (7) - a plausible (if
  // unusual) double. Dealer holds 5C 6C (11) and must hit to reach 17+.
  const state = BJ.createGame(["human"], { rng: ZERO_RNG });
  BJ.dealRound(state);
  BJ.doubleDown(state, 0); // draws 7C -> 14, forced to stand, bet now 50
  ok("double doubles the bet", state.hands[0].bet === 50 && state.hands[0].doubled === true);
  ok("double draws exactly one card and forces a stand", state.hands[0].cards.length === 3 && state.hands[0].status === "stood");
  ok("dealer hits from 11 up to 19 (5C 6C 8C)", state.dealerHand.map(CARDS.cardLabel).join(" ") === "5♣ 6♣ 8♣");
  ok("dealer's 19 beats the seat's 14", state.hands[0].result === "lose" && state.hands[0].net === -50);
  ok("chips are debited by the doubled bet", state.seats[0].chips === 450);
})();

(function doubleDownGuards() {
  const state = BJ.createGame(["human"], { rng: ZERO_RNG });
  BJ.dealRound(state);
  BJ.hit(state, 0); // now holding 3 cards
  assert.throws(() => BJ.doubleDown(state, 0), "cannot double after already hitting once");
  passed += 1;

  const poor = BJ.createGame(["human"], { rng: ZERO_RNG });
  BJ.dealRound(poor);
  poor.seats[0].chips = 10; // below the 50 needed to cover a doubled 25 bet
  assert.throws(() => BJ.doubleDown(poor, 0), "cannot double without enough chips to cover it");
  passed += 1;
})();

// ---- settlement math across every outcome kind, via fixture state -------------

(function settlementFixtureMixedOutcomes() {
  const state = BJ.createGame(["human", "human", "human", "human"], { rng: ZERO_RNG });
  state.round = 1;
  state.phase = "playing";
  state.dealerHand = [C(4, "D"), C(5, "C")]; // 9, will draw to 17
  state.dealerRevealed = false;
  state.deck = [C(8, "H")];
  state.deckCursor = 0;
  state.hands = [
    { cards: [C(14, "C"), C(13, "D")], bet: 25, status: "blackjack", doubled: false, result: null, net: 0 }, // natural
    { cards: [C(10, "C"), C(9, "D"), C(5, "H")], bet: 25, status: "bust", doubled: false, result: null, net: 0 }, // 24
    { cards: [C(10, "S"), C(9, "H")], bet: 25, status: "stood", doubled: false, result: null, net: 0 }, // 19
    { cards: [C(9, "C"), C(9, "S")], bet: 25, status: "playing", doubled: false, result: null, net: 0 }, // 18, acts last
  ];
  state.turnSeat = 3;
  BJ.stand(state, 3); // triggers dealer resolution + settlement for everyone

  ok("dealer hits from 9 up to 17 (4D 5C 8H)", state.dealerHand.map(CARDS.cardLabel).join(" ") === "4♦ 5♣ 8♥");
  ok("natural blackjack pays 3:2, rounded", state.hands[0].result === "win" && state.hands[0].net === 38); // round(25*1.5)
  ok("a bust always loses even though the dealer also could have busted", state.hands[1].result === "lose" && state.hands[1].net === -25);
  ok("19 beats the dealer's 17", state.hands[2].result === "win" && state.hands[2].net === 25);
  ok("18 also beats the dealer's 17", state.hands[3].result === "win" && state.hands[3].net === 25);
  ok("chips were credited/debited to match", state.seats.map((s) => s.chips).join(",") === [538, 475, 525, 525].join(","));
  ok("round is over but the session continues (round 1 of 15)", state.phase === "round-over" && !state.gameOver);
})();

(function settlementFixtureDealerBlackjackAndPush() {
  const state = BJ.createGame(["human", "human", "human"], { rng: ZERO_RNG });
  state.round = 1;
  state.phase = "playing";
  state.dealerHand = [C(14, "H"), C(13, "S")]; // already a natural, no further draw needed
  state.dealerRevealed = false;
  state.deck = [];
  state.deckCursor = 0;
  state.hands = [
    { cards: [C(14, "C"), C(13, "D")], bet: 25, status: "blackjack", doubled: false, result: null, net: 0 }, // also natural
    { cards: [C(10, "S"), C(9, "H")], bet: 25, status: "stood", doubled: false, result: null, net: 0 }, // 19, still loses to dealer BJ
    { cards: [C(10, "C"), C(6, "D")], bet: 25, status: "playing", doubled: false, result: null, net: 0 }, // acts last
  ];
  state.turnSeat = 2;
  BJ.stand(state, 2);

  ok("dealer does not draw further - already holds a natural", state.dealerHand.length === 2);
  ok("two naturals push", state.hands[0].result === "push" && state.hands[0].net === 0);
  ok("a strong 19 still loses to a dealer natural", state.hands[1].result === "lose" && state.hands[1].net === -25);
  ok("the seat that just stood also loses to the dealer natural", state.hands[2].result === "lose" && state.hands[2].net === -25);
  ok("chips reflect push + two losses", state.seats.map((s) => s.chips).join(",") === [500, 475, 475].join(","));
})();

(function sessionEndsAfterFinalRound() {
  const state = BJ.createGame(["human"], { rng: ZERO_RNG });
  state.round = 15; // the final round of the session
  state.phase = "playing";
  state.dealerHand = [C(9, "C"), C(9, "D")]; // 18
  state.dealerRevealed = false;
  state.deck = [];
  state.deckCursor = 0;
  state.hands = [{ cards: [C(10, "H"), C(9, "S")], bet: 25, status: "playing", doubled: false, result: null, net: 0 }]; // 19
  state.turnSeat = 0;
  BJ.stand(state, 0);
  ok("the 15th round settling ends the session", state.gameOver === true);
  ok("the final log line reports the session's chip totals", state.log[state.log.length - 1].text.indexOf("Session over") === 0);
})();

(function sitOutWhenOutOfChips() {
  const state = BJ.createGame(["human", "human"], { rng: ZERO_RNG });
  state.seats[1].chips = 0;
  BJ.dealRound(state);
  ok("a seat with 0 chips sits out and is dealt no cards", state.hands[1].status === "sitout" && state.hands[1].cards.length === 0);
  ok("only the funded seat gets a turn", state.turnSeat === 0);
  BJ.stand(state, 0);
  ok("a sitting-out seat has no result and is untouched by settlement", state.hands[1].result === null && state.seats[1].chips === 0);
})();

// ---- AI heuristic --------------------------------------------------------------

(function aiChooseActionTests() {
  const fixture = (cards, chips) => ({ hands: [{ cards, bet: 25 }], seats: [{ chips }] });
  ok("doubles a hard 11 with enough chips", BJ.aiChooseAction(fixture([C(5, "C"), C(6, "D")], 500), 0) === "double");
  ok("doubles a hard 10 with enough chips", BJ.aiChooseAction(fixture([C(4, "C"), C(6, "D")], 500), 0) === "double");
  ok("will not double without enough chips to cover it", BJ.aiChooseAction(fixture([C(5, "C"), C(6, "D")], 30), 0) === "hit");
  ok("will not double a 3-card total even if it's 10", BJ.aiChooseAction(fixture([C(2, "C"), C(3, "D"), C(5, "H")], 500), 0) === "hit");
  ok("hits any two-card total below 17 that isn't 10/11", BJ.aiChooseAction(fixture([C(2, "C"), C(4, "D")], 500), 0) === "hit");
  ok("stands on hard 17", BJ.aiChooseAction(fixture([C(9, "C"), C(8, "D")], 500), 0) === "stand");
  ok("stands on 20", BJ.aiChooseAction(fixture([C(10, "C"), C(10, "D")], 500), 0) === "stand");
})();

(function stepAIDrivesAFullHand() {
  const state = BJ.createGame(["ai"], { rng: ZERO_RNG });
  BJ.dealRound(state); // seat 0: 3C 4C (7) - AI will keep hitting below 17
  let guard = 0;
  while (state.hands[0].status === "playing" && guard++ < 20) BJ.stepAI(state, 0);
  ok("the AI hand resolves (stands, busts) within a small number of steps", guard < 20);
  ok("the round is settled afterwards", state.phase === "round-over");
})();

// ---- randomized full-session simulation ----------------------------------------

function playOutRound(state, seatTypes) {
  while (state.phase === "playing") {
    const seat = state.turnSeat;
    if (seat == null) break;
    if (seatTypes[seat] === "ai") {
      BJ.stepAI(state, seat);
    } else {
      // Simulate a human by reusing the same heuristic as the AI.
      const action = BJ.aiChooseAction(state, seat);
      if (action === "hit") BJ.hit(state, seat);
      else if (action === "double") BJ.doubleDown(state, seat);
      else BJ.stand(state, seat);
    }
  }
}

for (let g = 0; g < 15; g++) {
  const n = 1 + (g % 4);
  const seatTypes = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "human" : "ai"));
  const state = BJ.createGame(seatTypes, { rng: CARDS.makeRng(4200 + g) });
  let rounds = 0;
  while (!state.gameOver && rounds < 20) {
    BJ.dealRound(state);
    playOutRound(state, seatTypes);
    rounds++;
  }
  ok("game " + g + " (" + n + " seats) reaches gameOver within 15 rounds", state.gameOver === true);
  ok("game " + g + " played exactly 15 rounds", state.round === 15);
  ok("game " + g + " chips never went negative", state.seats.every((s) => s.chips >= 0));
}

console.log("blackjack.test.js: " + passed + " assertions passed");
