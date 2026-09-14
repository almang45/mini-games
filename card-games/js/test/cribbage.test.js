const assert = require("assert");
const CARDS = require("../core/cards.js");
const CRIBBAGE = require("../games/cribbage.js");

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
const hand = (ids, starter, crib) => CRIBBAGE.scoreHand(cards(ids), card(starter), !!crib).points;
const peg = (ids) => {
  const run = cards(ids).map((c) => ({ card: c }));
  return CRIBBAGE.pegPoints(run, run.reduce((a, p) => a + CRIBBAGE.pip(p.card), 0)).reduce((a, x) => a + x.points, 0);
};

// ---- the show -----------------------------------------------------------------

ok("29 hand", hand("5C 5D 5H JS", "5S") === 29);
ok("double run with a pair: 2 fifteens, pair, 2 runs of 3", hand("7C 8D 8H 9S", "KC") === 12);
ok("double double run", hand("3C 3D 4C 4D", "5H") === 20);
ok("4-card flush counts in hand", hand("2H 4H 6H 8H", "KS") === 4);
ok("but not in the crib", hand("2H 4H 6H 8H", "KS", true) === 0);
ok("5-card flush counts in both", hand("2H 4H 6H 8H", "KH") === 5 && hand("2H 4H 6H 8H", "KH", true) === 5);
ok("nobs: jack of the starter's suit", hand("JD 2C 7S 9H", "4D") === 3);
ok("aces are low: A-2-3 runs, Q-K-A doesn't", hand("AC 2D 3H KS", "QC") === 3 + 4 && hand("QC KD AH 2S", "9C") === 0);

// ---- pegging ------------------------------------------------------------------

ok("fifteen", peg("5C KD") === 2);
ok("pair, pair royal, double pair royal", peg("7C 7D") === 2 && peg("7C 7D 7H") === 6 && peg("4C 4D 4H 4S") === 12);
ok("a run in any order", peg("4C 6D 5H") === 5 && peg("2C 4D 3H 5S") === 4);
ok("a pair breaks the run", peg("4C 6D 5H 5S") === 2);
ok("31 and a run together", peg("KC 7D 6H 8S") === 5);
ok("K-Q-A is not a run", peg("KC QD AH") === 0);

// Rigs a pegging round with known hands; the starter and crib are fixed so
// the show that follows the last card is predictable.
function peggingState(dealerIds, poneIds) {
  const state = CRIBBAGE.createGame(["human", "human"], { rng: CARDS.makeRng(11) });
  const h = state.hand;
  const pone = 1 - state.dealerSeat;
  CRIBBAGE.discard(state, pone, h.hands[pone].slice(0, 2));
  CRIBBAGE.discard(state, state.dealerSeat, h.hands[state.dealerSeat].slice(0, 2));
  state.scores = [0, 0];
  h.phase = "pegging";
  h.hands[state.dealerSeat] = cards(dealerIds);
  h.hands[pone] = cards(poneIds);
  h.pegHands = h.hands.map((x) => x.slice());
  h.starter = card("2D");
  h.crib = cards("AC AD 7C TS");
  h.turnSeat = pone;
  return { state, dealer: state.dealerSeat, pone };
}

(function thirtyOneAndLastCard() {
  const { state, dealer, pone } = peggingState("5C 6D 9H 8S", "KC QD 4H 3S");
  const h = state.hand;
  const play = (seat, id) => CRIBBAGE.peg(state, seat, card(id));
  play(pone, "KC");
  assert.throws(() => play(pone, "QD"), /turn/); passed++;
  play(dealer, "5C");
  ok("dealer pegs 2 for fifteen", state.scores[dealer] === 2);
  play(pone, "QD");
  assert.throws(() => play(dealer, "9H"), /past 31/); passed++;
  play(dealer, "6D");
  ok("31 pegs 2 and resets the count", state.scores[dealer] === 4 && h.count === 0 && h.turnSeat === pone);
  play(pone, "4H");
  play(dealer, "9H");
  play(pone, "3S");
  const before = state.scores.slice();
  play(dealer, "8S");
  const shown = (ids, crib) => CRIBBAGE.scoreHand(cards(ids), card("2D"), crib).points;
  ok("last card pegs 1, then all three hands are counted", h.phase === "hand-end" &&
    state.scores[dealer] === before[dealer] + 1 + shown("5C 6D 9H 8S") + shown("AC AD 7C TS", true) &&
    state.scores[pone] === shown("KC QD 4H 3S"), { before, scores: state.scores });
  ok("show order: non-dealer hand, dealer hand, crib", h.show.map((e) => e.seat + e.label).join() === [pone + "hand", dealer + "hand", dealer + "crib"].join());
})();

(function goIsAutomatic() {
  const { state, dealer, pone } = peggingState("9D 8C 7H 6S", "KC QD AH 2S");
  const h = state.hand;
  const play = (seat, id) => CRIBBAGE.peg(state, seat, card(id));
  play(pone, "KC");
  play(dealer, "9D");
  play(pone, "QD");
  ok("at 29 the dealer can't play, so the non-dealer goes again", h.turnSeat === pone && CRIBBAGE.legalPegs(state, dealer).length === 0);
  play(pone, "AH");
  ok("nobody can play at 30: 1 for the go, dealer starts the next count", state.scores[pone] === 1 && h.count === 0 && h.turnSeat === dealer);
  play(dealer, "8C");
  play(pone, "2S");
  play(dealer, "7H");
  ok("out of cards: the dealer keeps playing", h.turnSeat === dealer);
  play(dealer, "6S");
  ok("the show follows the last card", h.phase === "hand-end");
})();

(function winningStopsTheCount() {
  const { state, dealer, pone } = peggingState("5C 6D 9H 8S", "KC QD 4H 3S");
  state.scores[dealer] = 119;
  CRIBBAGE.peg(state, pone, card("KC"));
  CRIBBAGE.peg(state, dealer, card("5C"));
  ok("reaching 121 while pegging ends the game at once", state.gameOver && state.winner === dealer && state.hand.phase === "game-end");
  assert.throws(() => CRIBBAGE.peg(state, pone, card("QD")), /game-end/); passed++;

  const second = peggingState("5C 6D 9H 8S", "KC QD 4H 3S");
  second.state.scores[second.pone] = 120;
  [["pone", "KC"], ["dealer", "5C"], ["pone", "QD"], ["dealer", "6D"], ["pone", "4H"], ["dealer", "9H"], ["pone", "3S"], ["dealer", "8S"]]
    .forEach(([who, id]) => CRIBBAGE.peg(second.state, second[who], card(id)));
  const show = second.state.hand.show;
  ok("the non-dealer counts first and can win before the dealer's hand and crib", second.state.winner === second.pone &&
    show[0].counted && !show[1].counted && !show[2].counted && second.state.scores[second.dealer] === 5, second.state.scores);
})();

// ---- deal and discard ---------------------------------------------------------------

(function dealAndDiscard() {
  const state = CRIBBAGE.createGame(["human", "human"], { rng: CARDS.makeRng(3) });
  const h = state.hand;
  ok("Seat 1 deals first; six cards each", state.dealerSeat === 0 && h.hands.every((x) => x.length === 6));
  ok("the non-dealer lays away first", h.turnSeat === 1);
  assert.throws(() => CRIBBAGE.discard(state, 0, h.hands[0].slice(0, 2)), /turn/); passed++;
  assert.throws(() => CRIBBAGE.discard(state, 1, h.hands[1].slice(0, 1)), /exactly 2/); passed++;
  CRIBBAGE.discard(state, 1, h.hands[1].slice(0, 2));
  const jack = h.deck.findIndex((c) => c.rank === 11);
  [h.deck[jack], h.deck[h.deck.length - 1]] = [h.deck[h.deck.length - 1], h.deck[jack]];
  CRIBBAGE.discard(state, 0, h.hands[0].slice(0, 2));
  ok("a jack starter gives the dealer 2 for his heels", h.starter.rank === 11 && state.scores[0] === 2);
  ok("pegging starts with the non-dealer", h.phase === "pegging" && h.turnSeat === 1);
  const ids = h.hands.flat().concat(h.crib, [h.starter]).map((c) => c.id);
  ok("4 + 4 + crib of 4 + starter, all different", ids.length === 13 && new Set(ids).size === 13);
  CRIBBAGE.startHand(state);
  ok("the deal alternates", state.dealerSeat === 1 && state.hand.turnSeat === 0);
})();

// ---- AI --------------------------------------------------------------------------------

(function aiChoices() {
  const state = CRIBBAGE.createGame(["ai", "ai"], { rng: CARDS.makeRng(5) });
  const h = state.hand;
  h.hands[state.dealerSeat] = cards("5C 5D 5H JS KC QD");
  ok("AI keeps 5-5-5-J", CRIBBAGE.aiChooseDiscard(state, state.dealerSeat).map((c) => c.id).sort().join() === "12D,13C");

  const { state: pegState, dealer, pone } = peggingState("5C 2D 9H 8S", "KC QD 4H 3S");
  CRIBBAGE.peg(pegState, pone, card("KC"));
  ok("AI takes the fifteen", CRIBBAGE.aiChoosePeg(pegState, dealer).id === "5C");
  const avoid = peggingState("5C 4H", "9C 7D");
  const ah = avoid.state.hand;
  ah.run = [{ seat: avoid.pone, card: card("9C") }, { seat: avoid.dealer, card: card("7D") }];
  ah.count = 16;
  ah.turnSeat = avoid.dealer;
  ok("AI avoids leaving the count on 21 for a ten-card reply", CRIBBAGE.aiChoosePeg(avoid.state, avoid.dealer).id === "4H");
})();

(function aiDiscardBeatsRandom() {
  const rng = CARDS.makeRng(21);
  let ai = 0, random = 0;
  const deals = 200;
  for (let i = 0; i < deals; i++) {
    const state = CRIBBAGE.createGame(["ai", "ai"], { rng });
    const pone = 1 - state.dealerSeat;
    const six = state.hand.hands[pone].slice();
    const toss = CRIBBAGE.aiChooseDiscard(state, pone).map((c) => c.id);
    const starter = state.hand.deck[0];
    ai += CRIBBAGE.scoreHand(six.filter((c) => !toss.includes(c.id)), starter, false).points;
    random += CRIBBAGE.scoreHand(six.slice(2), starter, false).points;
  }
  ok("AI keeps score about 2+ points a hand better than a blind discard", ai / deals > random / deals + 2, { ai: ai / deals, random: random / deals });
})();

(function aiGames() {
  for (let game = 0; game < 20; game++) {
    const state = CRIBBAGE.createGame(["ai", "ai"], { rng: CARDS.makeRng(700 + game) });
    let steps = 0, badDeal = 0;
    while (!state.gameOver) {
      const h = state.hand;
      if (h.phase === "hand-end") {
        const ids = h.hands.flat().concat(h.crib, [h.starter]).map((c) => c.id);
        if (new Set(ids).size !== 13 || h.pegHands.some((x) => x.length)) badDeal++;
        CRIBBAGE.startHand(state);
      } else if (h.phase === "discard") {
        CRIBBAGE.discard(state, h.turnSeat, CRIBBAGE.aiChooseDiscard(state, h.turnSeat));
      } else {
        CRIBBAGE.peg(state, h.turnSeat, CRIBBAGE.aiChoosePeg(state, h.turnSeat));
      }
      if (++steps > 3000) throw new Error("game " + game + " did not finish");
    }
    const loser = 1 - state.winner;
    ok("game " + game + ": clean deals, one winner at 121", badDeal === 0 && state.scores[state.winner] >= 121 && state.scores[loser] < 121 && state.handNumber < 30,
      { badDeal, scores: state.scores, hands: state.handNumber });
  }
})();

console.log("cribbage.test.js: " + passed + " assertions passed");
