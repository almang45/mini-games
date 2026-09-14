const assert = require("assert");
const CARDS = require("../core/cards.js");
const GIN = require("../games/gin-rummy.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}
function throws(label, fn, pattern) {
  assert.throws(fn, pattern, label);
  passed++;
}

const card = (id) => {
  const suit = id.slice(-1);
  const rank = { J: 11, Q: 12, K: 13, A: 14 }[id.slice(0, -1)] || Number(id.slice(0, -1));
  return { suit, rank, id: rank + suit };
};
const cards = (ids) => ids.split(" ").map(card);
const ids = (list) => list.map((c) => c.id).sort().join(" ");

// ---- meld arrangement --------------------------------------------------------

(function bestMeldsResolvesOverlaps() {
  let r = GIN.bestMelds(cards("AS 2S 3S 4S 4H 4D"));
  ok("A-2-3 run + three 4s beats A-2-3-4 run with two loose 4s", r.points === 0 && r.melds.length === 2, r);
  r = GIN.bestMelds(cards("5C 5D 5H 5S 6S 7S"));
  ok("four-of-a-kind gives up a card to complete a run", r.points === 0, r);
  r = GIN.bestMelds(cards("QS KS AS"));
  ok("Q-K-A is not a run (aces are low)", r.points === 21 && r.melds.length === 0, r);
  r = GIN.bestMelds(cards("AH 2H 3H 9C 9D 9S KD QC JC 10C"));
  ok("9C goes to the set, 10-J-Q clubs runs, KD is the only deadwood", r.points === 10 && ids(r.deadwood) === "13D", r);
  ok("face cards count 10, aces 1", GIN.cardPoints(card("KD")) === 10 && GIN.cardPoints(card("AC")) === 1 && GIN.cardPoints(card("7H")) === 7);
})();

(function layOffChainsAlongRuns() {
  const res = GIN.layOff([cards("4H 5H 6H"), cards("9C 9D 9S")], cards("7H 8H 9H 3C"));
  ok("7H, 8H, then 9H extend the run one after another", ids(res.laidOff) === "7H 8H 9H", res);
  ok("unplayable card stays deadwood", ids(res.deadwood) === "3C");
  ok("fourth card lays off onto a set", GIN.layOff([cards("9C 9D 9S")], cards("9H")).laidOff.length === 1);
  ok("nothing lays off onto a full 4-set", GIN.layOff([cards("9C 9D 9S 9H")], cards("8H")).laidOff.length === 0);
})();

// ---- turn flow -----------------------------------------------------------------

// Seat 0 to draw. stock.pop() takes the LAST id listed.
function rigged(hands, discardId, stockIds) {
  const state = GIN.createGame(["human", "human"], { rng: CARDS.makeRng(7) });
  state.hand.hands = hands.map((h) => GIN.sortHand(cards(h)));
  state.hand.discardPile = [card(discardId)];
  state.hand.stock = cards(stockIds);
  state.hand.turnSeat = 0;
  state.hand.phase = "draw";
  return state;
}

(function drawAndDiscardRules() {
  const state = rigged(["AS 2S 3S 7H 7D 9C JC QC KD 5D", "2C 3C 4C 8H 8D 8S 10H JH QH 6S"], "7S", "4D 5C 6C 9D");
  throws("no discarding before drawing", () => GIN.discard(state, 0, card("7H"), false), /cannot discard/);
  GIN.takeDiscard(state, 0);
  ok("the card just taken can't go straight back", !GIN.canDiscard(state, 0, card("7S")));
  throws("discarding the taken card throws", () => GIN.discard(state, 0, card("7S"), false), /cannot discard/);
  throws("only one draw per turn", () => GIN.drawStock(state, 0), /draw phase/);
  // 7S completes 7-7-7; dropping KD still leaves 9C + JC + QC + 5D = 34 deadwood.
  throws("knocking above 10 deadwood throws", () => GIN.discard(state, 0, card("KD"), true), /cannot knock/);
  GIN.discard(state, 0, card("KD"), false);
  ok("turn passes after a plain discard", state.hand.turnSeat === 1 && state.hand.phase === "draw");
})();

(function knockWithLayoffs() {
  // Knocker: A-2-3S, 7-7-7, J-Q-K clubs + 4D deadwood. Defender melds nothing,
  // but lays 4S then 5S onto the spade run and 10C onto the club run.
  const state = rigged(["AS 2S 3S 7H 7D 7C JC QC KC 4D", "4S 5S 10C 9H 9D KH QH 2D 3D 8C"], "KD", "4C 5C 6C");
  GIN.drawStock(state, 0); // 6C, useless
  GIN.discard(state, 0, card("6C"), true); // knock wins over the stock-floor void check
  const res = state.hand.result;
  ok("layoffs chain 4S -> 5S and add 10C", ids(res.laidOff) === "10C 4S 5S", res.laidOff);
  ok("defender deadwood after layoffs: 70 - 19 = 51", res.arrangements[1].points === 51, res.arrangements[1]);
  ok("knock scores the difference: 51 - 4", res.type === "knock" && res.winner === 0 && res.points === 47 && state.scores[0] === 47, res);
})();

(function undercut() {
  const state = rigged(["AS 2S 3S 7H 7D 7C JC QC KC 9D", "4H 5H 6H 8S 8D 8C 10H JH QH 2C"], "KD", "4C 5C 6C");
  GIN.drawStock(state, 0);
  GIN.discard(state, 0, card("6C"), true);
  const res = state.hand.result;
  ok("defender (2) undercuts a 9-point knock: 25 + 7", res.type === "undercut" && res.winner === 1 && res.points === 32, res);
})();

(function ginGetsBonusAndBlocksLayoffs() {
  const state = rigged(["AS 2S 3S 7H 7D 7C JC QC KC 5D", "5S 5H 6H 8S 8D 9C 10H JH QH 2C"], "KD", "6C 8C 4S");
  GIN.drawStock(state, 0); // 4S extends the spade run
  ok("gin available after drawing 4S", GIN.deadwoodAfterDiscard(state, 0, card("5D")) === 0);
  GIN.discard(state, 0, card("5D"), true);
  const res = state.hand.result;
  // Defender: 10-J-Q hearts melds; 5S 5H 6H 8S 8D 9C 2C = 43, and 5S may NOT lay off on the spade run.
  ok("gin: 25 + 43 with no layoffs", res.type === "gin" && res.laidOff.length === 0 && res.points === 68, res);
})();

(function stockFloorVoidsTheHand() {
  const state = rigged(["AS 2S 3S 7H 7D 9C JC QC KD 5D", "2C 3C 4C 8H 8D 8S 10H JH QH 6S"], "KH", "4D 5C 6C");
  GIN.drawStock(state, 0); // stock is now 2
  GIN.discard(state, 0, card("KD"), false);
  ok("plain discard at 2 stock cards voids the hand", state.hand.phase === "hand-end" && state.hand.result.type === "void");
  ok("void scores nothing", state.scores[0] === 0 && state.scores[1] === 0);
  GIN.nextHand(state);
  ok("next hand deals fresh with the dealer swapped",
    state.hand.hands[0].length === 10 && state.hand.stock.length === 31 && state.dealerSeat === 0 && state.hand.turnSeat === 1);
})();

// ---- AI-vs-AI ------------------------------------------------------------------

for (let g = 0; g < 25; g++) {
  const state = GIN.createGame(["ai", "ai"], { rng: CARDS.makeRng(900 + g) });
  let steps = 0;
  while (!state.gameOver) {
    if (++steps > 20000) throw new Error("gin game " + g + " did not finish");
    const h = state.hand;
    if (h.phase === "hand-end") { GIN.nextHand(state); continue; }
    const total = h.hands[0].length + h.hands[1].length + h.stock.length + h.discardPile.length;
    if (total !== 52) ok("52 cards accounted for", false, { total });
    GIN.aiStep(state, h.turnSeat);
  }
  ok("game " + g + ": winner reached 100, loser didn't", state.scores[state.winner] >= GIN.TARGET_SCORE &&
    state.scores[1 - state.winner] < GIN.TARGET_SCORE, state.scores);
}

console.log("gin-rummy.test.js: " + passed + " assertions passed");
