const assert = require("assert");
const M = require("../memory.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

(function dealsPairs() {
  for (const size of M.SIZES) {
    for (let seed = 1; seed <= 30; seed++) {
      const game = M.createGame(FACES, size, seeded(seed));
      ok(size + " cards dealt", game.cards.length === size);
      const counts = {};
      for (const card of game.cards) counts[card.face + card.side] = (counts[card.face + card.side] || 0) + 1;
      const faces = new Set(game.cards.map((c) => c.face));
      ok(size + ": " + size / 2 + " different faces", faces.size === size / 2);
      ok(size + ": each face has one side-0 and one side-1 card", [...faces].every((f) => counts[f + 0] === 1 && counts[f + 1] === 1));
      ok(size + ": starts face down with nothing found", game.open.length === 0 && game.found === 0 && game.moves === 0);
    }
  }
  const orders = new Set();
  for (let seed = 1; seed <= 20; seed++) orders.add(M.createGame(FACES, 8, seeded(seed)).cards.map((c) => c.face).join(""));
  ok("deals are shuffled", orders.size > 15);
  assert.throws(() => M.createGame(FACES, 5), /no board of 5/);
  assert.throws(() => M.createGame(["a", "b"], 6), /need more than 2/);
  passed += 2;
})();

(function flippingTwoAtATime() {
  let game = M.createGame(FACES, 4, seeded(3));
  const firstFace = game.cards[0].face;
  const partner = game.cards.findIndex((c, i) => i > 0 && c.face === firstFace);
  const stranger = game.cards.findIndex((c) => c.face !== firstFace);

  let step = M.flip(game, 0);
  ok("first card turns up", step.result === "first" && M.isFaceUp(step.game, 0));
  ok("the old game is untouched", game.open.length === 0);
  ok("the same card again is ignored", M.flip(step.game, 0).result === "ignored");

  step = M.flip(step.game, stranger);
  ok("a different card is a miss", step.result === "miss");
  ok("a miss leaves both cards up", M.isFaceUp(step.game, 0) && M.isFaceUp(step.game, stranger));
  ok("a miss counts a move", step.game.moves === 1);
  ok("a third card waits for hide()", M.flip(step.game, partner).result === "ignored");

  game = M.hide(step.game);
  ok("hide turns them back down", !M.isFaceUp(game, 0) && !M.isFaceUp(game, stranger));
  ok("hide with nothing up is a no-op", M.hide(game) === game);

  step = M.flip(M.flip(game, 0).game, partner);
  ok("the partner is a match", step.result === "match");
  ok("matched cards stay up", M.isFaceUp(step.game, 0) && M.isFaceUp(step.game, partner) && step.game.open.length === 0);
  ok("a match counts a move and a pair", step.game.moves === 2 && step.game.found === 1);
  ok("a matched card can't be flipped", M.flip(step.game, 0).result === "ignored");
  ok("out-of-range index is ignored", M.flip(step.game, 99).result === "ignored");
})();

(function playsToTheEnd() {
  for (const size of M.SIZES) {
    let game = M.createGame(FACES, size, seeded(size));
    ok(size + ": not won at the start", !M.isWon(game));
    const seen = {};
    game.cards.forEach((card, i) => { (seen[card.face] = seen[card.face] || []).push(i); });
    for (const [a, b] of Object.values(seen)) {
      game = M.flip(M.flip(game, a).game, b).game;
    }
    ok(size + ": won after every pair", M.isWon(game) && game.moves === size / 2);
  }
})();

(function gridFitsTheBox() {
  for (const size of M.SIZES) {
    for (const [w, h] of [[358, 560], [800, 260], [992, 600], [328, 380], [700, 820]]) {
      const g = M.bestGrid(size, w, h, 0.75, 10);
      const label = size + " cards in " + w + "×" + h;
      ok(label + ": room for every card", g.cols * g.rows >= size && (g.rows - 1) * g.cols < size);
      ok(label + ": fits the width", g.cols * g.cardW + (g.cols - 1) * 10 <= w);
      ok(label + ": fits the height", g.rows * g.cardH + (g.rows - 1) * 10 <= h);
      ok(label + ": cards are a usable size", g.cardW >= 40, g);
    }
  }
  const tall = M.bestGrid(16, 358, 560, 0.75, 10);
  ok("16 cards on a portrait phone are 4 across", tall.cols === 4, tall);
  const wide = M.bestGrid(16, 800, 260, 0.75, 10);
  ok("16 cards on a landscape phone are 8 across", wide.cols === 8, wide);
  ok("a box too small for anything gives zero-size cards", M.bestGrid(4, 5, 5, 0.75, 10).cardW === 0);
})();

console.log("memory.test.js: " + passed + " assertions passed");
