const assert = require("assert");
const CARDS = require("../core/cards.js");
const SPADES = require("../games/spades.js");

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

function newPlayingState(seed) {
  const state = SPADES.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(seed) });
  for (let i = 0; i < 4; i++) SPADES.placeBid(state, state.round.turnSeat, 3);
  return state;
}

// ---- bidding ---------------------------------------------------------------

(function biddingRunsClockwiseFromLeaderThenPlays() {
  const state = SPADES.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(1) });
  ok("seat left of dealer bids first", state.round.turnSeat === (state.dealerSeat + 1) % 4);
  assert.throws(() => SPADES.placeBid(state, (state.round.turnSeat + 1) % 4, 2), /turn/);
  assert.throws(() => SPADES.placeBid(state, state.round.turnSeat, 14), /bid/);
  const leader = state.round.turnSeat;
  for (let i = 0; i < 4; i++) SPADES.placeBid(state, state.round.turnSeat, i);
  ok("phase moves to playing after 4 bids", state.round.phase === "playing");
  ok("leader plays first", state.round.turnSeat === leader);
  passed++;
})();

// ---- legality ----------------------------------------------------------------

(function spadesCannotBeLedUntilBroken() {
  const state = newPlayingState(2);
  const r = state.round;
  r.hands[r.turnSeat] = hand("2C 5S AS");
  let legal = SPADES.getLegalPlays(state, r.turnSeat);
  ok("unbroken: only non-spades may be led", legal.length === 1 && legal[0].suit === "C");
  r.hands[r.turnSeat] = hand("5S AS");
  legal = SPADES.getLegalPlays(state, r.turnSeat);
  ok("unbroken but spades-only hand: spades may be led", legal.length === 2);
})();

(function mustFollowSuit() {
  const state = newPlayingState(3);
  const r = state.round;
  const leader = r.turnSeat, next = (leader + 1) % 4;
  r.hands[leader] = hand("9H 2C");
  r.hands[next] = hand("KH 3S 4D");
  SPADES.playCard(state, leader, card("9H"));
  const legal = SPADES.getLegalPlays(state, next);
  ok("follower holding the led suit must follow", legal.length === 1 && legal[0].id === "13H");
  assert.throws(() => SPADES.playCard(state, next, card("3S")), /illegal/);
  passed++;
})();

(function spadeTrumpsAndBreaksSpades() {
  const trick = [
    { seat: 0, card: card("AH") },
    { seat: 1, card: card("2S") },
    { seat: 2, card: card("KH") },
    { seat: 3, card: card("3C") },
  ];
  ok("lowest spade beats the led ace", SPADES.trickWinner(trick).seat === 1);
  ok("off-suit non-spade never wins", SPADES.trickWinner([{ seat: 0, card: card("2H") }, { seat: 1, card: card("AC") }]).seat === 0);

  const state = newPlayingState(4);
  const r = state.round;
  const s = [0, 1, 2, 3].map((i) => (r.turnSeat + i) % 4);
  r.hands[s[0]] = hand("AH 2D"); r.hands[s[1]] = hand("2S 3D"); r.hands[s[2]] = hand("KH 4D"); r.hands[s[3]] = hand("3C 5D");
  ["AH", "2S", "KH", "3C"].forEach((id, i) => SPADES.playCard(state, s[i], card(id)));
  ok("trump wins the trick and leads next", r.turnSeat === s[1] && r.tricksWon[s[1]] === 1);
  ok("playing a spade breaks spades", r.spadesBroken === true);
  ok("completed trick is kept for display", r.lastTrick && r.lastTrick.winner === s[1] && r.lastTrick.plays.length === 4);
})();

// ---- scoring -----------------------------------------------------------------

(function contractScoring() {
  const base = { bids: [4, 3, 2, 0], tricksWon: [5, 4, 3, 1] };
  const t0 = SPADES.scoreTeam(base, 0); // seats 0+2: bid 6, took 8
  ok("made contract: 10/bid + 1/bag", t0.made && t0.bags === 2 && t0.delta === 62, t0);
  const t1 = SPADES.scoreTeam(base, 1); // seat 1 bid 3 took 4; seat 3 nil took 1 (failed, counts toward contract)
  ok("failed nil -100, partner still makes 3 with nil's trick as a bag", t1.delta === -100 + 30 + 2 && t1.bags === 2, t1);
  const set = SPADES.scoreTeam({ bids: [5, 1, 4, 1], tricksWon: [3, 5, 2, 3] }, 0);
  ok("set contract loses 10/bid", !set.made && set.delta === -90, set);
  const nil = SPADES.scoreTeam({ bids: [0, 1, 5, 1], tricksWon: [0, 5, 5, 3] }, 0);
  ok("successful nil +100 on top of partner's contract", nil.delta === 100 + 50, nil);
})();

(function tenBagsCostOneHundred() {
  const state = newPlayingState(5);
  state.teamBags = [8, 0];
  state.teamScores = [200, 200];
  const r = state.round;
  r.bids = [1, 6, 1, 6];
  r.tricksWon = [3, 2, 2, 5]; // 12 tricks so far; seat 0 takes the 13th with the ace below
  const s = r.turnSeat;
  [0, 1, 2, 3].forEach((i) => { const seat = (s + i) % 4; r.hands[seat] = [card(seat === 0 ? "AD" : (i + 2) + "D")]; });
  [0, 1, 2, 3].forEach((i) => { const seat = (s + i) % 4; SPADES.playCard(state, seat, r.hands[seat][0]); });
  const [t0, t1] = r.summary;
  ok("team 0: bid 2, took 6 -> +24 with 4 bags", t0.made && t0.bags === 4 && t0.delta === 24, t0);
  ok("bags crossing 10 cost 100 and wrap", t0.bagPenalty && state.teamBags[0] === 2 && state.teamScores[0] === 124, state);
  ok("team 1: bid 12, took 7 -> set for -120", !t1.made && state.teamScores[1] === 80, t1);
})();

// ---- AI --------------------------------------------------------------------

(function aiBidsAreSane() {
  ok("monster hand bids high", SPADES.aiChooseBid(hand("AS KS QS JS 10S 9S AH KH AD KD AC KC 2C")) >= 10);
  ok("hopeless hand bids nil", SPADES.aiChooseBid(hand("2S 3S 2H 3H 4H 5H 2D 3D 4D 6D 2C 3C 4C")) === 0);
  const mid = SPADES.aiChooseBid(hand("AS 5S 3S KH 9H 4H QD 8D 2D JC 7C 5C 2C"));
  ok("middling hand bids 1-4", mid >= 1 && mid <= 4, mid);
})();

for (let g = 0; g < 20; g++) {
  const state = SPADES.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(500 + g) });
  let rounds = 0;
  while (!state.gameOver) {
    if (++rounds > 80) throw new Error("spades game " + g + " did not finish in 80 rounds");
    const r = state.round;
    while (r.phase === "bidding") SPADES.placeBid(state, r.turnSeat, SPADES.aiChooseBid(r.hands[r.turnSeat]));
    let guard = 0;
    while (r.phase === "playing") {
      if (++guard > 60) throw new Error("spades round did not terminate");
      const seat = r.turnSeat;
      const legal = SPADES.getLegalPlays(state, seat);
      const choice = SPADES.aiChoosePlay(state, seat);
      if (!legal.some((c) => c.id === choice.id)) ok("AI play is legal", false, { seat, choice });
      SPADES.playCard(state, seat, choice);
    }
    ok("13 tricks per round", r.tricksWon.reduce((a, b) => a + b, 0) === 13);
    if (!state.gameOver) SPADES.startRound(state);
  }
  const [a, b] = state.teamScores;
  const w = state.winningTeam;
  ok("game " + g + " ended on 500 or -200", Math.max(a, b) >= 500 || Math.min(a, b) <= -200, state.teamScores);
  ok("game " + g + " winner is the stronger team", state.teamScores[w] > state.teamScores[1 - w] || state.teamScores[1 - w] <= -200);
}

console.log("spades.test.js: " + passed + " assertions passed");
