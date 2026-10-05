const assert = require("assert");
const CARDS = require("../core/cards.js");
const C = require("../games/color-clash.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const num = (color, v) => C.card("number", color, v);
const act = (kind, color) => C.card(kind, color);

// Deals a real hand, then puts the table in a hand-built position. Hands
// may be short; `drawPile` is drawn from the end.
function table(seatCount, { hands, top, color, drawPile, turn, direction }) {
  const state = C.createGame(Array(seatCount).fill("human"), { rng: CARDS.makeRng(1) });
  C.dealHand(state);
  state.hands = hands.map((h) => h.slice());
  state.discard = [top];
  state.color = color || top.color;
  state.drawPile = drawPile || [];
  state.turnSeat = turn || 0;
  state.direction = direction || 1;
  state.phase = "play";
  state.pending = null;
  return state;
}

// ---- deck ---------------------------------------------------------------------

(function deckTests() {
  const deck = C.buildDeck();
  ok("108 cards", deck.length === 108);
  for (const color of C.COLORS) {
    const mine = deck.filter((c) => c.color === color);
    ok(color + ": 25 cards", mine.length === 25);
    ok(color + ": one 0", mine.filter((c) => c.kind === "number" && c.value === 0).length === 1);
    ok(color + ": two 7s", mine.filter((c) => c.kind === "number" && c.value === 7).length === 2);
    for (const kind of ["skip", "reverse", "draw2"]) ok(color + ": two " + kind, mine.filter((c) => c.kind === kind).length === 2);
  }
  ok("four wilds, four wild draw fours", deck.filter((c) => c.kind === "wild").length === 4 && deck.filter((c) => c.kind === "wild4").length === 4);
  ok("ids unique", new Set(deck.map((c) => c.id)).size === 108);
  ok("points: number face value", C.cardPoints(num("R", 7)) === 7);
  ok("points: action 20, wild 50", C.cardPoints(act("skip", "G")) === 20 && C.cardPoints(act("wild4")) === 50);
})();

(function createTests() {
  assert.throws(() => C.createGame(["human"]), /2-4/);
  assert.throws(() => C.createGame(Array(5).fill("ai")), /2-4/);
  // Seeded: an unseeded deal sometimes starts on a Draw Two, which hands the
  // first player 9 cards. Every starter is covered in starterTests.
  const state = C.createGame(["human", "ai", "ai"], { rng: CARDS.makeRng(1) });
  C.dealHand(state);
  ok("seeded starter is a number card", C.topCard(state).kind === "number");
  ok("seven cards each", state.hands.every((h) => h.length === 7));
  ok("one card starts the discard", state.discard.length === 1 && state.drawPile.length === 108 - 21 - 1);
  ok("colour follows the starter", state.color === state.discard[0].color || state.phase === "color");
  assert.throws(() => C.dealHand(state), /not finished/);
})();

// ---- the starter ----------------------------------------------------------------

// Deck order: drawn from the end, so the dealt cards go last and the
// starter candidates just before them.
function startWith(seatCount, starters) {
  const state = C.createGame(Array(seatCount).fill("human"), { rng: CARDS.makeRng(1) });
  const dealt = Array.from({ length: 7 * seatCount }, (_, i) => num("B", (i % 9) + 1));
  const filler = Array.from({ length: 10 }, () => num("Y", 3));
  C.dealHand(state, { deck: filler.concat(starters.slice().reverse(), dealt) });
  return state;
}

(function starterTests() {
  const w4 = startWith(3, [act("wild4"), num("R", 5)]);
  ok("a Wild Draw Four can't start: the next card does", C.topCard(w4).kind === "number" && w4.color === "R");
  ok("and it goes back under the pile", w4.drawPile[0].kind === "wild4");
  ok("seat 2 plays first", C.actingSeat(w4) === 1);

  const skip = startWith(3, [act("skip", "G")]);
  ok("a starting Skip skips the first player", C.actingSeat(skip) === 2);

  const rev = startWith(3, [act("reverse", "G")]);
  ok("a starting Reverse: the dealer plays first, the other way", C.actingSeat(rev) === 0 && rev.direction === -1);

  const d2 = startWith(3, [act("draw2", "G")]);
  ok("a starting Draw Two: the first player draws 2 and is skipped", d2.hands[1].length === 9 && C.actingSeat(d2) === 2);

  const wild = startWith(3, [act("wild")]);
  ok("a starting Wild: the first player names the colour", wild.phase === "color" && C.actingSeat(wild) === 1);
  C.chooseColor(wild, 1, "Y");
  ok("then plays", wild.phase === "play" && C.actingSeat(wild) === 1 && wild.color === "Y");
})();

// ---- playing --------------------------------------------------------------------

(function matchTests() {
  const state = table(2, { hands: [[], []], top: num("R", 5) });
  ok("same colour", C.isPlayable(state, num("R", 9)));
  ok("same number", C.isPlayable(state, num("B", 5)));
  ok("different both", !C.isPlayable(state, num("B", 4)));
  ok("wilds always", C.isPlayable(state, act("wild")) && C.isPlayable(state, act("wild4")));
  state.discard = [act("skip", "G")];
  state.color = "G";
  ok("same symbol", C.isPlayable(state, act("skip", "Y")));
  ok("a number doesn't match a symbol", !C.isPlayable(state, num("Y", 0)));
  state.discard = [act("wild")];
  state.color = "B";
  ok("a wild's chosen colour", C.isPlayable(state, num("B", 1)) && !C.isPlayable(state, num("R", 1)));
})();

(function playErrorTests() {
  const a = num("R", 2), b = num("B", 4);
  const state = table(2, { hands: [[a, b, num("R", 3)], [num("R", 1)]], top: num("R", 5) });
  assert.throws(() => C.playCard(state, 1, state.hands[1][0].id), /seat/);
  assert.throws(() => C.playCard(state, 0, b.id), /match/);
  assert.throws(() => C.playCard(state, 0, "nope"), /not in hand/);
  C.playCard(state, 0, a.id);
  ok("a play passes the turn", C.actingSeat(state) === 1 && state.color === "R");
})();

(function actionTests() {
  const hands = () => [[act("skip", "R"), act("reverse", "R"), act("draw2", "R"), num("R", 1)], [num("G", 1)], [num("G", 2)], [num("G", 3)]];
  const skip = table(4, { hands: hands(), top: num("R", 5) });
  C.playCard(skip, 0, skip.hands[0][0].id);
  ok("Skip jumps a seat", C.actingSeat(skip) === 2);

  const rev = table(4, { hands: hands(), top: num("R", 5) });
  C.playCard(rev, 0, rev.hands[0][1].id);
  ok("Reverse turns play the other way", C.actingSeat(rev) === 3 && rev.direction === -1);

  const twoRev = table(2, { hands: [[act("reverse", "R"), num("R", 1)], [num("G", 1)]], top: num("R", 5) });
  C.playCard(twoRev, 0, twoRev.hands[0][0].id);
  ok("with two seats Reverse is a Skip", C.actingSeat(twoRev) === 0);

  const d2 = table(4, { hands: hands(), top: num("R", 5), drawPile: [num("B", 1), num("B", 2)] });
  C.playCard(d2, 0, d2.hands[0][2].id);
  ok("Draw Two: next seat draws 2", d2.hands[1].length === 3);
  ok("and is skipped", C.actingSeat(d2) === 2);
})();

(function wildTests() {
  const state = table(3, { hands: [[act("wild"), num("B", 1)], [num("G", 1)], [num("G", 2)]], top: num("R", 5) });
  C.playCard(state, 0, state.hands[0][0].id);
  ok("a Wild asks its player for a colour", state.phase === "color" && C.actingSeat(state) === 0);
  assert.throws(() => C.chooseColor(state, 0, "X"), /unknown/);
  assert.throws(() => C.chooseColor(state, 1, "G"), /seat/);
  C.chooseColor(state, 0, "B");
  ok("colour set and turn passes", state.color === "B" && C.actingSeat(state) === 1);
})();

(function wild4Tests() {
  const draws = () => Array.from({ length: 8 }, (_, i) => num("Y", i + 1));
  const honest = table(3, { hands: [[act("wild4"), num("B", 1)], [num("G", 1)], [num("G", 2)]], top: num("R", 5), drawPile: draws() });
  C.playCard(honest, 0, honest.hands[0][0].id);
  C.chooseColor(honest, 0, "B");
  ok("the next seat decides on the challenge", honest.phase === "challenge" && C.actingSeat(honest) === 1);
  C.respondToWild4(honest, 1, true);
  ok("an honest play: the challenger draws 6", honest.hands[1].length === 7);
  ok("and is skipped", C.actingSeat(honest) === 2);

  const bluff = table(3, { hands: [[act("wild4"), num("R", 1)], [num("G", 1)], [num("G", 2)]], top: num("R", 5), drawPile: draws() });
  C.playCard(bluff, 0, bluff.hands[0][0].id);
  C.chooseColor(bluff, 0, "G");
  C.respondToWild4(bluff, 1, true);
  ok("a bluff caught: the player draws 4", bluff.hands[0].length === 5 && bluff.hands[1].length === 1);
  ok("the challenger plays next, in the new colour", C.actingSeat(bluff) === 1 && bluff.color === "G");

  const take = table(3, { hands: [[act("wild4"), num("R", 1)], [num("G", 1)], [num("G", 2)]], top: num("R", 5), drawPile: draws() });
  C.playCard(take, 0, take.hands[0][0].id);
  C.chooseColor(take, 0, "G");
  C.respondToWild4(take, 1, false);
  ok("taking it: draw 4, skipped", take.hands[1].length === 5 && C.actingSeat(take) === 2);
})();

(function drawTests() {
  const playable = num("R", 8);
  const state = table(2, { hands: [[num("B", 1)], [num("G", 1)]], top: num("R", 5), drawPile: [playable] });
  C.draw(state, 0);
  ok("a playable draw can be played", state.phase === "drawn" && C.legalPlays(state, 0).map((c) => c.id).join() === playable.id);
  assert.throws(() => C.playCard(state, 0, state.hands[0][0].id), /drawn card|match/);
  C.playCard(state, 0, playable.id);
  ok("and was", C.topCard(state) === playable && C.actingSeat(state) === 1);

  const keep = table(2, { hands: [[num("B", 1)], [num("G", 1)]], top: num("R", 5), drawPile: [num("R", 8)] });
  C.draw(keep, 0);
  C.keepDrawn(keep, 0);
  ok("or kept", keep.hands[0].length === 2 && C.actingSeat(keep) === 1);

  const miss = table(2, { hands: [[num("B", 1)], [num("G", 1)]], top: num("R", 5), drawPile: [num("Y", 8)] });
  C.draw(miss, 0);
  ok("an unplayable draw ends the turn", miss.phase === "play" && C.actingSeat(miss) === 1);

  const any = table(2, { hands: [[num("R", 1)], [num("G", 1)]], top: num("R", 5), drawPile: [num("Y", 8)] });
  C.draw(any, 0);
  ok("drawing is allowed even holding a match", any.hands[0].length === 2);
})();

(function reshuffleTests() {
  const state = table(2, { hands: [[num("B", 1)], [num("G", 1)]], top: num("R", 5) });
  state.discard = [num("Y", 2), num("Y", 3), num("R", 5)];
  C.draw(state, 0);
  ok("the discards under the top card refill the pile", state.discard.length === 1 && C.topCard(state).value === 5 && state.hands[0].length === 2);

  const dry = table(2, { hands: [[num("B", 1)], [num("G", 1)]], top: num("R", 5) });
  C.draw(dry, 0);
  ok("nothing at all to draw: the turn passes", dry.hands[0].length === 1 && C.actingSeat(dry) === 1);
})();

(function scoringTests() {
  const state = table(3, {
    hands: [[act("draw2", "R")], [num("G", 9), act("wild")], [act("skip", "B")]],
    top: num("R", 5),
    drawPile: [num("Y", 4), num("Y", 6)],
  });
  C.playCard(state, 0, state.hands[0][0].id);
  ok("going out ends the hand", state.phase === "hand-over" && state.handWinner === 0);
  ok("a last Draw Two still lands", state.hands[1].length === 4);
  ok("scores every card left", state.seats[0].score === 9 + 50 + 4 + 6 + 20);
  ok("not over below 500", !state.gameOver);

  const win = table(2, { hands: [[num("R", 1)], [act("wild4")]], top: num("R", 5) });
  win.seats[0].score = 460;
  C.playCard(win, 0, win.hands[0][0].id);
  ok("500 wins the game", win.gameOver && win.winner === 0 && win.seats[0].score === 510);
  assert.throws(() => C.dealHand(win), /over/);
})();

// ---- AI --------------------------------------------------------------------------

(function aiTests() {
  const state = table(2, {
    hands: [[act("wild"), num("R", 2), num("B", 9), num("B", 3), act("wild4")], [num("G", 1), num("G", 2), num("G", 3)]],
    top: num("R", 5),
  });
  ok("holds wilds when a colour match exists", C.aiChoosePlay(state, 0).kind === "number");
  ok("names the colour it holds most", C.aiChooseColor(state, 0) === "B");

  state.hands[0] = [act("draw2", "R"), num("R", 9), num("R", 8)];
  state.hands[1] = [num("G", 1), num("G", 2)];
  ok("hits a seat about to go out with Draw Two", C.aiChoosePlay(state, 0).kind === "draw2");

  state.hands[0] = [act("wild4"), num("R", 2)];
  state.hands[1] = [num("G", 1), num("G", 2), num("G", 3), num("G", 4)];
  ok("won't bluff a Wild Draw Four without cause", C.aiChoosePlay(state, 0).kind === "number");
  state.hands[0] = [act("wild4"), num("B", 2)];
  ok("plays an honest one when nothing else fits", C.aiChoosePlay(state, 0).kind === "wild4");
})();

(function challengeTests() {
  const state = table(2, { hands: [[], []], top: act("wild4"), color: "G" });
  state.pending = { type: "challenge", offender: 0, victim: 1, honest: true, prevColor: "R" };
  state.phase = "challenge";
  state.hands[0] = [num("B", 1)];
  ok("one card left: a bluff is unlikely", C.bluffChance(state, 1) < 0.3 && !C.aiShouldChallenge(state, 1));
  state.hands[0] = Array.from({ length: 10 }, () => num("B", 1));
  ok("ten cards: a bluff is likely", C.bluffChance(state, 1) > 0.9 && C.aiShouldChallenge(state, 1));
  state.hands[1] = Array.from({ length: 20 }, (_, i) => num("R", i % 10));
  const fewerRedsLeft = C.bluffChance(state, 1);
  ok("reds this seat holds can't be in the other hand", fewerRedsLeft < 0.9);
})();

// ---- full AI games ---------------------------------------------------------------

function playOut(state, policyFor) {
  let steps = 0;
  while (!state.gameOver) {
    C.dealHand(state);
    while (state.phase !== "hand-over") {
      if (++steps > 50000) throw new Error("game did not finish");
      const seat = C.actingSeat(state);
      (policyFor(seat) || C.stepAI)(state, seat);
    }
    const total = state.drawPile.length + state.discard.length + state.hands.reduce((a, h) => a + h.length, 0);
    ok("all 108 cards accounted for after a hand", total === 108, { total });
  }
  return state;
}

for (const seats of [2, 3, 4]) {
  for (let g = 0; g < 25; g++) {
    const state = playOut(C.createGame(Array(seats).fill("ai"), { rng: CARDS.makeRng(100 * seats + g) }), () => null);
    ok(seats + " seats game " + g + ": winner at 500+", state.seats[state.winner].score >= C.TARGET);
  }
}

// First legal card, always Red, never challenges.
function naive(state, seat) {
  if (state.phase === "color") return C.chooseColor(state, seat, "R");
  if (state.phase === "challenge") return C.respondToWild4(state, seat, false);
  if (state.phase === "drawn") return C.playCard(state, seat, state.drawn.id);
  const legal = C.legalPlays(state, seat);
  return legal.length ? C.playCard(state, seat, legal[0].id) : C.draw(state, seat);
}

(function aiStrengthTest() {
  let aiWins = 0;
  const games = 100;
  for (let g = 0; g < games; g++) {
    const base = g % 2;
    const state = playOut(C.createGame(["ai", "ai"], { rng: CARDS.makeRng(g + 3) }), (seat) => (seat === base ? naive : null));
    if (state.winner !== base) aiWins++;
  }
  ok("AI beats a first-legal-card player (" + aiWins + "/" + games + ")", aiWins > games * 0.75);
})();

console.log("color-clash.test.js: " + passed + " assertions passed");
