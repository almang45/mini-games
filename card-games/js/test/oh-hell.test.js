const assert = require("assert");
const CARDS = require("../core/cards.js");
const OH_HELL = require("../games/oh-hell.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const card = (id) => {
  const suit = id.slice(-1);
  const rank = { J: 11, Q: 12, K: 13, A: 14 }[id.slice(0, -1)] || Number(id.slice(0, -1));
  return { suit, rank, id: rank + suit };
};
const hand = (ids) => ids.split(" ").map(card);
const humans = (n) => new Array(n).fill("human");

function bidAll(state, bid) {
  while (state.round.phase === "bidding") {
    const seat = state.round.turnSeat;
    const legal = OH_HELL.legalBids(state, seat);
    OH_HELL.placeBid(state, seat, legal.includes(bid) ? bid : legal[0]);
  }
}

// ---- deal and bidding ------------------------------------------------------

(function dealAndTrump() {
  for (const n of [3, 4]) {
    const state = OH_HELL.createGame(humans(n), { rng: CARDS.makeRng(n) });
    const r = state.round;
    ok(n + " seats: 7 cards each in round 1", r.hands.every((h) => h.length === 7));
    const ids = new Set(r.hands.flat().map((c) => c.id));
    ok(n + " seats: dealt cards are distinct and the trump card isn't in a hand", ids.size === 7 * n && !ids.has(r.trumpCard.id));
    ok(n + " seats: trump comes from the turned card", r.trump === r.trumpCard.suit);
    ok(n + " seats: seat left of the dealer bids first", r.turnSeat === (state.dealerSeat + 1) % n);
  }
  ok("13 rounds going 7 down to 1 and back", OH_HELL.HAND_SIZES.join() === "7,6,5,4,3,2,1,2,3,4,5,6,7");
  assert.throws(() => OH_HELL.createGame(humans(2)), /3 or 4/);
  passed++;
})();

(function dealerCannotMakeBidsAddUp() {
  const state = OH_HELL.createGame(humans(4), { rng: CARDS.makeRng(9) });
  const r = state.round;
  assert.throws(() => OH_HELL.placeBid(state, (r.turnSeat + 1) % 4, 1), /turn/);
  assert.throws(() => OH_HELL.placeBid(state, r.turnSeat, 8), /illegal/);
  [2, 1, 3].forEach((b) => OH_HELL.placeBid(state, r.turnSeat, b));
  ok("dealer is last to bid", r.turnSeat === state.dealerSeat);
  const legal = OH_HELL.legalBids(state, state.dealerSeat);
  ok("dealer may not bid the 1 that makes 7", !legal.includes(1) && legal.length === 7, legal);
  assert.throws(() => OH_HELL.placeBid(state, state.dealerSeat, 1), /illegal/);
  OH_HELL.placeBid(state, state.dealerSeat, 0);
  ok("play starts with the first bidder", r.phase === "playing" && r.turnSeat === (state.dealerSeat + 1) % 4);
  passed += 2;

  const over = OH_HELL.createGame(humans(3), { rng: CARDS.makeRng(10) });
  [5, 4].forEach((b) => OH_HELL.placeBid(over, over.round.turnSeat, b));
  ok("already overbid: the dealer may bid anything", OH_HELL.legalBids(over, over.dealerSeat).length === 8);
})();

// ---- play --------------------------------------------------------------------

(function trumpAndFollowSuit() {
  ok("trump beats the led ace", OH_HELL.trickWinner([{ seat: 0, card: card("AH") }, { seat: 1, card: card("2C") }, { seat: 2, card: card("KH") }], "C").seat === 1);
  ok("off-suit non-trump never wins", OH_HELL.trickWinner([{ seat: 0, card: card("3H") }, { seat: 1, card: card("AS") }], "C").seat === 0);
  ok("higher trump beats lower trump", OH_HELL.trickWinner([{ seat: 0, card: card("3H") }, { seat: 1, card: card("2C") }, { seat: 2, card: card("9C") }], "C").seat === 2);

  const state = OH_HELL.createGame(humans(3), { rng: CARDS.makeRng(11) });
  bidAll(state, 1);
  const r = state.round;
  const [a, b, c] = [0, 1, 2].map((i) => (r.turnSeat + i) % 3);
  r.trump = "S";
  r.hands[a] = hand("9H 2D"); r.hands[b] = hand("KH 3S"); r.hands[c] = hand("4D 5S");
  ok("any card may be led, trump included", OH_HELL.getLegalPlays(state, c).length === 2);
  OH_HELL.playCard(state, a, card("9H"));
  assert.throws(() => OH_HELL.playCard(state, b, card("3S")), /illegal/);
  OH_HELL.playCard(state, b, card("KH"));
  ok("a void player may trump", OH_HELL.getLegalPlays(state, c).length === 2);
  OH_HELL.playCard(state, c, card("5S"));
  ok("trump takes the trick and leads next", r.tricksWon[c] === 1 && r.turnSeat === c && r.lastTrick.winner === c);
  passed++;
})();

(function onlyExactBidsScore() {
  ok("exact bid scores 10 + bid", OH_HELL.roundPoints(3, 3) === 13);
  ok("exact zero scores 10", OH_HELL.roundPoints(0, 0) === 10);
  ok("over or under scores nothing", OH_HELL.roundPoints(2, 3) === 0 && OH_HELL.roundPoints(2, 1) === 0);

  const state = OH_HELL.createGame(humans(3), { rng: CARDS.makeRng(12) });
  for (let i = 0; i < 6; i++) {
    bidAll(state, 0);
    const r = state.round;
    while (r.phase === "playing") OH_HELL.playCard(state, r.turnSeat, OH_HELL.getLegalPlays(state, r.turnSeat)[0]);
    OH_HELL.startRound(state);
  }
  ok("round 7 deals one card each", state.round.handSize === 1);
  state.scores = [0, 0, 0];
  const r = state.round;
  const order = [0, 1, 2].map((i) => (r.turnSeat + i) % 3);
  r.trump = "S";
  r.hands[order[0]] = hand("AH"); r.hands[order[1]] = hand("2H"); r.hands[order[2]] = hand("3D");
  [1, 0, 1].forEach((b) => OH_HELL.placeBid(state, r.turnSeat, b)); // dealer's 1 is fine: total 2 != 1
  order.forEach((seat) => OH_HELL.playCard(state, seat, r.hands[seat][0]));
  ok("round summary: winner of the bid-1 trick and the bid-0 seat score, the other misses",
    state.scores[order[0]] === 11 && state.scores[order[1]] === 10 && state.scores[order[2]] === 0, state.scores);
  ok("dealer rotates each round", state.dealerSeat === (2 + 6) % 3);
})();

// ---- AI --------------------------------------------------------------------

(function aiBidsAreSane() {
  const state = OH_HELL.createGame(humans(4), { rng: CARDS.makeRng(13) });
  const r = state.round;
  r.trump = "S";
  r.hands[r.turnSeat] = hand("AS KS QS JS AH AD AC");
  ok("monster hand bids at least 5", OH_HELL.aiChooseBid(state, r.turnSeat) >= 5);
  r.hands[r.turnSeat] = hand("2H 3H 4D 5D 2C 3C 6C");
  ok("hopeless hand bids 0", OH_HELL.aiChooseBid(state, r.turnSeat) === 0);
})();

(function aiDucksOnceItsBidIsMade() {
  const state = OH_HELL.createGame(humans(3), { rng: CARDS.makeRng(14) });
  bidAll(state, 0);
  const r = state.round;
  const [a, b] = [r.turnSeat, (r.turnSeat + 1) % 3];
  r.trump = "S";
  r.hands[a] = hand("9H 2D");
  r.hands[b] = hand("KH 8H 3S");
  OH_HELL.playCard(state, a, card("9H"));
  ok("bid 0: plays the highest card that still loses", OH_HELL.aiChoosePlay(state, b).id === "8H");
  r.bids[b] = 1;
  ok("bid 1: wins with the cheapest winner", OH_HELL.aiChoosePlay(state, b).id === "13H");
})();

let exact = 0, seatRounds = 0;
for (let g = 0; g < 30; g++) {
  const n = 3 + (g % 2);
  const state = OH_HELL.createGame(new Array(n).fill("ai"), { rng: CARDS.makeRng(700 + g) });
  while (!state.gameOver) {
    const r = state.round;
    while (r.phase === "bidding") {
      const seat = r.turnSeat;
      const bid = OH_HELL.aiChooseBid(state, seat);
      if (!OH_HELL.legalBids(state, seat).includes(bid)) ok("AI bid is legal", false, { seat, bid });
      OH_HELL.placeBid(state, seat, bid);
    }
    ok("bids never add up to the hand size", r.bids.reduce((x, y) => x + y, 0) !== r.handSize);
    let guard = 0;
    while (r.phase === "playing") {
      if (++guard > 40) throw new Error("oh hell round did not terminate");
      const seat = r.turnSeat;
      const choice = OH_HELL.aiChoosePlay(state, seat);
      if (!OH_HELL.getLegalPlays(state, seat).some((c) => c.id === choice.id)) ok("AI play is legal", false, { seat, choice });
      OH_HELL.playCard(state, seat, choice);
    }
    ok("every trick is won once", r.tricksWon.reduce((x, y) => x + y, 0) === r.handSize && r.played.length === r.handSize * n);
    r.summary.forEach((s) => { seatRounds++; if (s.points) exact++; });
    if (!state.gameOver) OH_HELL.startRound(state);
  }
  ok("game " + g + " ran all 13 rounds", state.roundIndex === 12);
  ok("game " + g + " winners hold the top score", state.winners.every((s) => state.scores[s] === Math.max(...state.scores)));
}
// On these deals random legal bids make 28% and "hand size / seats" makes 46%.
ok("AI makes more bids than naive bidding", exact / seatRounds > 0.48, { exact, seatRounds });

console.log("oh-hell.test.js: " + passed + " assertions passed");
