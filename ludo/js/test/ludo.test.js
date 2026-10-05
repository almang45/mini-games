const assert = require("assert");
const L = require("../ludo.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// mulberry32, as the other games' tests use, so random games are repeatable.
function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function game(n, tokens) {
  const state = L.createGame(Array(n).fill("human"), { rng: makeRng(1) });
  (tokens || []).forEach((t, i) => { if (t) state.seats[i].tokens = t.slice(); });
  return state;
}

// ---- board geometry ----------------------------------------------------------

(function geometryTests() {
  ok("red starts on loop square 0", L.loopSquare("red", 0) === 0);
  ok("green's start is 13 squares on", L.loopSquare("green", 0) === 13);
  ok("blue wraps past the end of the loop", L.loopSquare("blue", 20) === 7);
  ok("the yard, home column and home are off the loop", [-1, 51, 55, 56].every((p) => L.loopSquare("red", p) === null));
  ok("eight safe squares", L.SAFE.size === 8);
  ok("seat colours sit opposite for two", L.SEAT_COLORS[2].join() === "red,yellow");
  assert.throws(() => L.createGame(["ai"]), /2-4/);
  assert.throws(() => L.createGame(Array(5).fill("ai")), /2-4/);
})();

// ---- rolling and moving ---------------------------------------------------------

(function yardTests() {
  const state = game(2);
  L.roll(state, 3);
  ok("all in the yard and no 6: no move", state.turn === 1 && state.phase === "roll");
  L.roll(state, 6);
  ok("a 6 brings a token out", state.phase === "move" && state.legal.join() === "0,1,2,3");
  L.move(state, 2);
  ok("onto the start square", state.seats[1].tokens[2] === 0);
  ok("and a 6 rolls again", state.turn === 1 && state.phase === "roll");
  assert.throws(() => L.move(state, 2), /not time/);
  L.roll(state, 4);
  assert.throws(() => L.move(state, 0), /can't move/);
  L.move(state, 2);
  ok("moves by the die", state.seats[1].tokens[2] === 4 && state.turn === 0);
})();

(function threeSixesTests() {
  const state = game(2, [[10, -1, -1, -1]]);
  L.roll(state, 6); L.move(state, 0);
  L.roll(state, 6); L.move(state, 0);
  L.roll(state, 6);
  ok("a third 6 forfeits the turn", state.turn === 1 && state.seats[0].tokens[0] === 22);
  L.roll(state, 6);
  ok("the count starts over for the next player", state.sixes === 1);
})();

(function exactHomeTests() {
  const state = game(2, [[53, 56, 56, -1]]);
  L.roll(state, 4);
  ok("can't overshoot home", state.turn === 1);
  state.turn = 0;
  L.roll(state, 3);
  L.move(state, 0);
  ok("an exact roll gets home", state.seats[0].tokens[0] === 56);
  ok("and earns another roll", state.turn === 0 && state.phase === "roll");
  ok("a token at home can't move", L.target(56, 1) === null);
})();

(function captureTests() {
  // Red at 3; yellow at progress 31 sits on loop square (26 + 31) % 52 = 5.
  const state = game(2, [[3, -1, -1, -1], [31, -1, -1, -1]]);
  L.roll(state, 2);
  L.move(state, 0);
  ok("landing on an opponent sends it to the yard", state.seats[1].tokens[0] === -1);
  ok("the move records the capture", state.lastMove.captured.length === 1 && state.lastMove.captured[0].from === 31);
  ok("a capture earns another roll", state.turn === 0 && state.phase === "roll");

  // Yellow at progress 34 is on loop square 8, a star.
  const safe = game(2, [[3, -1, -1, -1], [34, -1, -1, -1]]);
  L.roll(safe, 5);
  L.move(safe, 0);
  ok("no capture on a safe square", safe.seats[1].tokens[0] === 34 && safe.turn === 1);

  const own = game(2, [[3, 5, -1, -1]]);
  L.roll(own, 2);
  L.move(own, 0);
  ok("your own tokens share a square", own.seats[0].tokens.join() === "5,5,-1,-1");

  // Yellow in its home column (progress 52) is never on the loop.
  const column = game(2, [[3, -1, -1, -1], [52, -1, -1, -1]]);
  L.roll(column, 2);
  L.move(column, 0);
  ok("home columns are out of reach", column.seats[1].tokens[0] === 52);

  const pair = game(4, [[3, -1, -1, -1], null, [31, 31, -1, -1]]);
  L.roll(pair, 2);
  L.move(pair, 0);
  ok("every opponent token on the square goes", pair.seats[2].tokens.join() === "-1,-1,-1,-1");
})();

(function winTests() {
  const state = game(2, [[55, 56, 56, 56]]);
  L.roll(state, 1);
  L.move(state, 0);
  ok("four home wins", state.gameOver && state.winner === 0);
  assert.throws(() => L.roll(state, 1), /not time/);
})();

// ---- AI --------------------------------------------------------------------------

(function aiTests() {
  // Red at 3 and 20; yellow at progress 31 = loop square 5.
  const capture = game(2, [[3, 20, -1, -1], [31, -1, -1, -1]]);
  L.roll(capture, 2);
  ok("takes a capture", L.chooseMove(capture) === 0);

  const out = game(2, [[20, -1, -1, -1]]);
  L.roll(out, 6);
  ok("brings a token out on a 6", out.seats[0].tokens[L.chooseMove(out)] === -1);

  const home = game(2, [[54, 10, -1, -1]]);
  L.roll(home, 2);
  ok("finishes a token when it can", L.chooseMove(home) === 0);

  // Red at 10 (square 10). Yellow at progress 34 sits on square 8, two behind.
  const escape = game(2, [[10, 30, -1, -1], [34, -1, -1, -1]]);
  L.roll(escape, 5);
  ok("sees the threat", L.threats(escape, 0, 10) === 1);
  ok("runs from it", L.chooseMove(escape) === 0);

  const safe = game(2, [[3, 30, -1, -1], [34, -1, -1, -1]]);
  ok("a star is never threatened", L.threats(safe, 0, 8) === 0);
})();

// ---- full games --------------------------------------------------------------------

function playOut(n, levels, seed) {
  const state = L.createGame(Array(n).fill("ai"), { rng: makeRng(seed) });
  let steps = 0;
  let inRange = true;
  while (!state.gameOver) {
    if (++steps > 20000) throw new Error("game did not finish");
    if (state.phase === "roll") L.roll(state);
    else L.move(state, L.chooseMove(state, levels[state.turn]));
    inRange = inRange && state.seats.every((s) => s.tokens.every((p) => p >= -1 && p <= L.HOME));
  }
  ok("positions stayed in range all game", inRange);
  return state;
}

for (const n of [2, 3, 4]) {
  for (let g = 0; g < 20; g++) {
    const state = playOut(n, Array(n).fill("normal"), 50 * n + g);
    ok(n + " players game " + g + ": the winner has every token home", state.seats[state.winner].tokens.every((p) => p === L.HOME));
  }
}

(function strengthTest() {
  let wins = 0;
  const games = 200;
  for (let g = 0; g < games; g++) {
    const state = playOut(2, g % 2 ? ["easy", "normal"] : ["normal", "easy"], g + 1);
    if (state.winner === (g % 2 ? 1 : 0)) wins++;
  }
  ok("normal beats easy most of the time (" + wins + "/" + games + ")", wins > games * 0.75);
})();

console.log("ludo.test.js: " + passed + " assertions passed");
