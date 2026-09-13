const assert = require("assert");
const CARDS = require("../core/cards.js");
const HEARTS = require("../games/hearts.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function autoSubmitAllPasses(state) {
  if (state.round.phase !== "passing") return;
  for (let i = 0; i < 4; i++) {
    if (!state.round.passSelections[i]) HEARTS.setPassSelection(state, i, HEARTS.aiChoosePass(state.round.hands[i]));
  }
}

function playOutRound(state, seedRng) {
  autoSubmitAllPasses(state);
  let guard = 0;
  while (state.round.phase === "playing") {
    if (++guard > 300) throw new Error("hearts round did not terminate");
    const seat = state.round.turnSeat;
    const legal = HEARTS.getLegalPlays(state, seat);
    ok("legal plays non-empty on seat's turn", legal.length > 0, { seat, hand: state.round.hands[seat] });
    // Cross-check every legal card is actually still in the seat's hand.
    legal.forEach((c) => ok("legal card is in hand", state.round.hands[seat].some((h) => h.id === c.id)));
    const card = HEARTS.aiChoosePlay(state, seat);
    ok("aiChoosePlay returns a legal card", legal.some((c) => c.id === card.id), { seat, card });
    HEARTS.playCard(state, seat, card);
  }
}

// ---- rule checks on a single controlled round -----------------------------

(function firstTrickMustLead2Clubs() {
  const state = HEARTS.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(1) });
  autoSubmitAllPasses(state);
  const leader = state.round.turnSeat;
  const legal = HEARTS.getLegalPlays(state, leader);
  ok("first play is forced to 2 of clubs", legal.length === 1 && legal[0].suit === "C" && legal[0].rank === 2);
})();

(function heartsCannotLeadUntilBroken() {
  const state = HEARTS.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(2) });
  autoSubmitAllPasses(state);
  // Force through the first trick, then inspect the second trick's leader.
  while (state.round.trickNumber === 1) {
    const seat = state.round.turnSeat;
    HEARTS.playCard(state, seat, HEARTS.aiChoosePlay(state, seat));
  }
  if (!state.round.heartsBroken) {
    const seat = state.round.turnSeat;
    const legal = HEARTS.getLegalPlays(state, seat);
    ok("no hearts offered when leading and unbroken (unless hand is all hearts)",
      legal.every((c) => c.suit !== "H") || state.round.hands[seat].every((c) => c.suit === "H"));
  } else {
    passed++; // heartsBroken already true from trick 1 (e.g. someone was void and dumped) - nothing to assert here
  }
})();

(function moonShotZerosTheShooter() {
  // Rig each seat to hold one full suit: seat 0 gets all clubs, so every seat
  // else is void on every club lead and seat 0 wins all 13 tricks outright.
  const state = HEARTS.createGame(["human", "human", "human", "human"], { rng: CARDS.makeRng(3) });
  state.round.passDirection = "hold";
  state.round.phase = "playing";
  const deck = CARDS.buildDeck();
  const suits = ["C", "D", "H", "S"];
  const bySuit = {}; suits.forEach((s) => { bySuit[s] = CARDS.sortByRank(deck.filter((c) => c.suit === s)); });
  state.round.hands = [bySuit.C, bySuit.D, bySuit.H, bySuit.S];
  const leader = state.round.hands.findIndex((h) => h.some((c) => c.suit === "C" && c.rank === 2));
  state.round.leaderSeat = leader; state.round.turnSeat = leader;
  let guard = 0;
  while (state.round.phase === "playing") {
    if (++guard > 60) throw new Error("did not terminate");
    const seat = state.round.turnSeat;
    const legal = HEARTS.getLegalPlays(state, seat);
    const card = seat === 0 ? legal.sort((a, b) => b.rank - a.rank)[0] : legal.sort((a, b) => a.rank - b.rank)[0];
    HEARTS.playCard(state, seat, card);
  }
  ok("seat 0 took every trick (26 points) in this rigged deal", state.scores[0] === 0);
  ok("everyone else charged 26 on a moon shot", state.scores[1] === 26 && state.scores[2] === 26 && state.scores[3] === 26);
})();

// ---- full randomized AI-vs-AI game simulations -----------------------------

for (let g = 0; g < 15; g++) {
  const state = HEARTS.createGame(["ai", "ai", "ai", "ai"], { rng: CARDS.makeRng(1000 + g) });
  let rounds = 0;
  while (!state.gameOver) {
    if (++rounds > 60) throw new Error("hearts game " + g + " did not terminate within 60 rounds");
    playOutRound(state);
    if (!state.gameOver) HEARTS.startRound(state);
  }
  ok("game " + g + " ends with someone at/above 100", state.scores.some((s) => s >= 100));
  const w = HEARTS.winners(state);
  ok("game " + g + " winner has the lowest score", w.every((i) => state.scores[i] === Math.min(...state.scores)));
}

console.log("hearts.test.js: " + passed + " assertions passed");
