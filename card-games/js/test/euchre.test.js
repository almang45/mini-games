const assert = require("assert");
const CARDS = require("../core/cards.js");
const EUCHRE = require("../games/euchre.js");

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
const HUMANS = ["human", "human", "human", "human"];
const allCards = (h) => h.hands.flat().concat(h.kitty, h.played);

function playingState(seed, trump) {
  const state = EUCHRE.createGame(HUMANS, { rng: CARDS.makeRng(seed) });
  const h = state.hand;
  for (let i = 0; i < 4; i++) EUCHRE.pass(state, h.turnSeat);
  const suit = trump !== h.upcard.suit ? trump : CARDS.SUITS.find((s) => s !== h.upcard.suit);
  EUCHRE.nameTrump(state, h.turnSeat, suit);
  return state;
}

// ---- deck and deal ------------------------------------------------------------

(function deckAndDeal() {
  ok("24 cards, 9 through Ace", EUCHRE.DECK.length === 24 && EUCHRE.DECK.every((c) => c.rank >= 9));
  const state = EUCHRE.createGame(HUMANS, { rng: CARDS.makeRng(1) });
  const h = state.hand;
  ok("5 cards each, 3 in the kitty, 1 upcard", h.hands.every((x) => x.length === 5) && h.kitty.length === 3 && h.upcard);
  ok("every card dealt once", new Set(allCards(h).concat([h.upcard]).map((c) => c.id)).size === 24);
  ok("seat left of the dealer speaks first", h.phase === "order" && h.turnSeat === (state.dealerSeat + 1) % 4);
  assert.throws(() => EUCHRE.createGame(["human", "ai", "ai"]), /4 seats/);
  passed++;
})();

// ---- bowers ----------------------------------------------------------------

(function bowersRankAndBelongToTrump() {
  ok("left bower plays as trump", EUCHRE.effectiveSuit(card("JD"), "H") === "H" && EUCHRE.effectiveSuit(card("JC"), "H") === "C");
  const trick = [{ seat: 0, card: card("AH") }, { seat: 1, card: card("JD") }, { seat: 2, card: card("JH") }, { seat: 3, card: card("KH") }];
  ok("right bower beats left bower beats the ace", EUCHRE.trickWinner(trick, "H").seat === 2);
  ok("left bower beats the ace of trump", EUCHRE.trickWinner(trick.slice(0, 2), "H").seat === 1);
  ok("left bower trumps a led diamond", EUCHRE.trickWinner([{ seat: 0, card: card("AD") }, { seat: 1, card: card("JD") }], "H").seat === 1);
  ok("off-suit cards never win", EUCHRE.trickWinner([{ seat: 0, card: card("9C") }, { seat: 1, card: card("AS") }], "H").seat === 0);

  const state = playingState(2, "H");
  const h = state.hand;
  h.trump = "H";
  const [a, b] = [h.turnSeat, (h.turnSeat + 1) % 4];
  h.hands[a] = hand("AH 9S");
  h.hands[b] = hand("JD AD 9C");
  EUCHRE.playCard(state, a, card("AH"));
  const legal = EUCHRE.getLegalPlays(state, b).map((c) => c.id);
  ok("trump led: the left bower is the only card that follows", legal.join() === "11D", legal);
  assert.throws(() => EUCHRE.playCard(state, b, card("AD")), /illegal/);
  passed++;

  const d = playingState(3, "H");
  const dh = d.hand;
  dh.trump = "H";
  const [c, e] = [dh.turnSeat, (dh.turnSeat + 1) % 4];
  dh.hands[c] = hand("KD 9S");
  dh.hands[e] = hand("JD 9C");
  EUCHRE.playCard(d, c, card("KD"));
  ok("diamonds led: the left bower isn't a diamond, so anything goes", EUCHRE.getLegalPlays(d, e).length === 2);
})();

// ---- calling trump -----------------------------------------------------------

(function orderUpThenDealerDiscards() {
  const state = EUCHRE.createGame(HUMANS, { rng: CARDS.makeRng(4) });
  const h = state.hand;
  const dealer = state.dealerSeat;
  const up = h.upcard;
  EUCHRE.pass(state, h.turnSeat);
  const caller = h.turnSeat;
  assert.throws(() => EUCHRE.nameTrump(state, caller, "S"), /phase/);
  EUCHRE.orderUp(state, caller);
  ok("ordering up sets trump and the maker", h.trump === up.suit && h.maker === caller);
  ok("the dealer picks up the upcard and must discard", h.phase === "discard" && h.turnSeat === dealer && h.hands[dealer].length === 6);
  assert.throws(() => EUCHRE.discard(state, caller, h.hands[caller][0]), /turn/);
  EUCHRE.discard(state, dealer, h.hands[dealer][0]);
  ok("after the discard the first seat leads", h.phase === "playing" && h.turnSeat === (dealer + 1) % 4);
  ok("all 24 cards accounted for", h.hands.every((x) => x.length === 5) && new Set(allCards(h).map((c) => c.id)).size === 24);
  passed += 2;
})();

(function stickTheDealer() {
  const state = EUCHRE.createGame(HUMANS, { rng: CARDS.makeRng(5) });
  const h = state.hand;
  for (let i = 0; i < 4; i++) EUCHRE.pass(state, h.turnSeat);
  ok("four passes turn the upcard down", h.phase === "name" && h.kitty.length === 4 && h.turnSeat === (state.dealerSeat + 1) % 4);
  assert.throws(() => EUCHRE.nameTrump(state, h.turnSeat, h.upcard.suit), /turned-down/);
  for (let i = 0; i < 3; i++) EUCHRE.pass(state, h.turnSeat);
  ok("back to the dealer", h.turnSeat === state.dealerSeat);
  assert.throws(() => EUCHRE.pass(state, state.dealerSeat), /must name/);
  const suit = CARDS.SUITS.find((s) => s !== h.upcard.suit);
  EUCHRE.nameTrump(state, state.dealerSeat, suit);
  ok("the dealer names trump and play starts", h.trump === suit && h.maker === state.dealerSeat && h.phase === "playing");
  ok("hands are re-sorted with the left bower among the trumps", h.hands.every((x) => {
    const firstTrump = x.findIndex((c) => EUCHRE.effectiveSuit(c, suit) === suit);
    return firstTrump === -1 || x.slice(firstTrump).every((c) => EUCHRE.effectiveSuit(c, suit) === suit);
  }));
  passed += 3;
})();

// ---- scoring ----------------------------------------------------------------

(function scoring() {
  const r = (maker, tricksWon) => EUCHRE.handResult(maker, tricksWon);
  ok("makers take 3: 1 point", JSON.stringify(r(0, [2, 1, 1, 1])) === JSON.stringify({ team: 0, points: 1, kind: "made", tricks: 3 }));
  ok("makers take 4: 1 point", r(2, [3, 0, 1, 1]).points === 1);
  ok("march: 2 points", r(1, [0, 3, 0, 2]).kind === "march" && r(1, [0, 3, 0, 2]).points === 2);
  ok("euchred: defenders score 2", JSON.stringify(r(3, [2, 1, 1, 1])) === JSON.stringify({ team: 0, points: 2, kind: "euchred", tricks: 2 }));

  const state = playingState(6, "S");
  const h = state.hand;
  h.trump = "S";
  const lead = h.turnSeat;
  const makers = EUCHRE.teamOf(lead);
  h.maker = lead;
  state.teamScores = makers === 0 ? [9, 4] : [4, 9];
  ["JS", "9H", "10H", "QH"].forEach((id, i) => { h.hands[(lead + i) % 4] = [card(id)]; });
  h.trickNumber = 5;
  h.tricksWon = [0, 0, 0, 0];
  h.tricksWon[lead] = 2;
  h.tricksWon[(lead + 1) % 4] = 2;
  for (let i = 0; i < 4; i++) EUCHRE.playCard(state, h.turnSeat, h.hands[h.turnSeat][0]);
  ok("the makers' third trick on the last lead scores 1", h.summary.kind === "made" && h.summary.team === makers && state.teamScores[makers] === 10, h.summary);
  ok("reaching 10 ends the game", state.gameOver && state.winningTeam === makers && h.phase === "game-end");
})();

// ---- AI --------------------------------------------------------------------

(function aiDecisions() {
  ok("both bowers and the ace are a strong hand", EUCHRE.handStrength(hand("JH JD AH 9C 10S"), "H") > 2.5);
  ok("no trump and no aces is weak", EUCHRE.handStrength(hand("9C 10C QS KD 9D"), "H") < 1);
  ok("dealer discards a lone low side card, never trump", EUCHRE.aiChooseDiscard(hand("JH 9H AS 10C KS QS"), "H").id === "10C");
  ok("a lone ace is kept over a lower card", EUCHRE.aiChooseDiscard(hand("JH 9H AC 10S KS QS"), "H").id === "10S");

  const state = playingState(7, "H");
  const h = state.hand;
  h.trump = "H";
  const [a, b, c] = [h.turnSeat, (h.turnSeat + 1) % 4, (h.turnSeat + 2) % 4];
  h.hands[a] = hand("AS 9D");
  h.hands[b] = hand("10S KS");
  h.hands[c] = hand("QS JH");
  EUCHRE.playCard(state, a, card("AS"));
  EUCHRE.playCard(state, b, card("10S"));
  ok("partner's ace is boss: third seat follows low", EUCHRE.aiChoosePlay(state, c).id === "12S");
})();

let hands = 0, made = 0;
for (let g = 0; g < 30; g++) {
  const state = EUCHRE.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(900 + g) });
  let guard = 0;
  while (!state.gameOver) {
    if (++guard > 60) throw new Error("euchre game " + g + " did not finish in 60 hands");
    const h = state.hand;
    let steps = 0;
    while (h.phase !== "hand-end" && h.phase !== "game-end") {
      if (++steps > 40) throw new Error("euchre hand did not terminate");
      if (h.phase === "playing") {
        const choice = EUCHRE.aiChoosePlay(state, h.turnSeat);
        if (!EUCHRE.getLegalPlays(state, h.turnSeat).some((c) => c.id === choice.id)) ok("AI play is legal", false, { choice });
      }
      EUCHRE.aiStep(state, h.turnSeat);
      if (h.phase === "playing" && h.played.length === 0) ok("24 cards accounted for at the first lead", new Set(allCards(h).map((c) => c.id)).size === 24);
    }
    ok("5 tricks per hand", h.tricksWon.reduce((x, y) => x + y, 0) === 5 && h.played.length === 20);
    hands++;
    if (h.summary.kind !== "euchred") made++;
    if (!state.gameOver) EUCHRE.startHand(state);
  }
  const [x, y] = state.teamScores;
  ok("game " + g + " ends at 10 with the higher team winning", Math.max(x, y) >= 10 && state.teamScores[state.winningTeam] === Math.max(x, y));
}
ok("AI makers usually make it", made / hands > 0.7, { made, hands });

console.log("euchre.test.js: " + passed + " assertions passed");
