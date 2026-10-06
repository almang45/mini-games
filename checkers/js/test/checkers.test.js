const assert = require("assert");
const K = require("../checkers.js");

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

const sq = (r, c) => r * K.SIZE + c;
const CODE = { ".": K.EMPTY, b: K.BLACK, B: K.BLACK * K.KING, w: K.WHITE, W: K.WHITE * K.KING };

// A position from eight rows of text (row 0 at the top), side to move.
function position(rows, turn) {
  const s = K.createGame();
  s.board = rows.join("").split("").map((ch) => CODE[ch]);
  s.turn = turn || K.BLACK;
  return s;
}
const dests = (moves) => moves.map((m) => m.path[m.path.length - 1]).sort((a, b) => a - b);

// ---- setup and simple moves ---------------------------------------------------

(function setupTests() {
  const s = K.createGame();
  ok("12 pieces each", K.count(s.board, K.BLACK) === 12 && K.count(s.board, K.WHITE) === 12);
  ok("all on dark squares", s.board.every((v, i) => !v || K.playable(Math.floor(i / 8), i % 8)));
  ok("Black moves first, with 7 moves", s.turn === K.BLACK && K.legalMoves(s.board, K.BLACK).length === 7);
})();

(function stepTests() {
  const s = position([
    "........",
    "........",
    "........",
    "........",
    "....b...",
    "........",
    ".B......",
    "........",
  ]);
  const moves = K.legalMoves(s.board, K.BLACK);
  ok("a man steps diagonally forward only", dests(moves.filter((m) => m.from === sq(4, 4))).join() === [sq(3, 3), sq(3, 5)].join());
  ok("a king steps either way", moves.filter((m) => m.from === sq(6, 1)).length === 4);
  assert.throws(() => K.play(s, { from: sq(4, 4), path: [sq(5, 5)], captures: [] }), /illegal/);
})();

// ---- captures ------------------------------------------------------------------

(function captureTests() {
  const s = position([
    "........",
    "........",
    "........",
    "...w....",
    "....b...",
    "........",
    "b.......",
    "........",
  ]);
  const moves = K.legalMoves(s.board, K.BLACK);
  ok("a capture is compulsory", moves.length === 1 && moves[0].captures.join() === String(sq(3, 3)));
  K.play(s, moves[0]);
  ok("the jumped piece is removed", s.board[sq(3, 3)] === K.EMPTY && s.board[sq(2, 2)] === K.BLACK);

  const multi = position([
    "........",
    "........",
    "...w....",
    "........",
    ".....w..",
    "......b.",
    "........",
    "........",
  ]);
  const m = K.legalMoves(multi.board, K.BLACK);
  ok("a multi-jump goes all the way", m.length === 1 && m[0].captures.length === 2 && m[0].path.join() === [sq(3, 4), sq(1, 2)].join(), m);
  assert.throws(() => K.play(multi, { from: sq(5, 6), path: [sq(3, 4)], captures: [sq(4, 5)] }), /illegal/);

  // A king can turn corners: four captures in one move, ending the game.
  const chain = position([
    "........",
    "..w.w...",
    "........",
    "....w...",
    "........",
    "..w.....",
    ".B......",
    "........",
  ]);
  const kc = K.legalMoves(chain.board, K.BLACK);
  ok("a king chains four jumps", kc.length === 1 && kc[0].path.join() === [sq(4, 3), sq(2, 5), sq(0, 3), sq(2, 1)].join(), kc);
  K.play(chain, kc[0]);
  ok("every jumped piece goes", K.count(chain.board, K.WHITE) === 0 && chain.board[sq(2, 1)] === K.BLACK * K.KING && chain.winner === K.BLACK);

  const branch = position([
    "........",
    "........",
    "........",
    "..w.w...",
    "...b....",
    "........",
    "........",
    "........",
  ]);
  ok("any capture may be chosen", K.legalMoves(branch.board, K.BLACK).length === 2);

  const backward = position([
    "........",
    "........",
    "........",
    "........",
    "...b....",
    "..w.....",
    "........",
    "........",
  ]);
  ok("a man doesn't capture backwards", K.legalMoves(backward.board, K.BLACK).every((mv) => !mv.captures.length));
  backward.board[sq(4, 3)] = K.BLACK * K.KING;
  ok("a king does", K.legalMoves(backward.board, K.BLACK).some((mv) => mv.captures.length));
})();

(function crownTests() {
  const s = position([
    "........",
    "..b.....",
    "........",
    "........",
    "........",
    "........",
    "......w.",
    "........",
  ]);
  K.play(s, { from: sq(1, 2), path: [sq(0, 1)], captures: [] });
  ok("reaching the far row crowns", s.board[sq(0, 1)] === K.BLACK * K.KING);

  // Crowned mid-jump: the man would otherwise jump on from the back row.
  // The man lands on (0,3) and, as a king, could jump (1,2) next; it mustn't.
  const stop = position([
    "........",
    "..w.w...",
    ".....b..",
    "........",
    "........",
    "........",
    "........",
    "........",
  ]);
  const mv = K.legalMoves(stop.board, K.BLACK);
  ok("crowning ends the jump", mv.length === 1 && mv[0].captures.length === 1 && mv[0].path.join() === String(sq(0, 3)), mv);
})();

// ---- game end and undo ----------------------------------------------------------

(function endTests() {
  const s = position([
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
    "...w....",
    "..b.....",
  ], K.BLACK);
  const back = K.legalMoves(s.board, K.BLACK);
  ok("a man jumps from its own back row", back.length === 1 && back[0].path.join() === String(sq(5, 4)), back);

  const last = position([
    "........",
    "........",
    "........",
    "........",
    "........",
    "...w....",
    "....b...",
    "........",
  ], K.BLACK);
  K.play(last, K.legalMoves(last.board, K.BLACK)[0]);
  ok("taking the last piece wins", last.gameOver && last.winner === K.BLACK);

  const blocked = position([
    "........",
    "........",
    "........",
    "........",
    "........",
    "...w....",
    "..b.b...",
    ".b...b..",
  ], K.WHITE);
  blocked.board[sq(4, 2)] = K.BLACK;
  blocked.board[sq(4, 4)] = K.BLACK;
  ok("no legal move: that side has lost", K.legalMoves(blocked.board, K.WHITE).length === 0);
  blocked.turn = K.BLACK;
  K.play(blocked, { from: sq(4, 4), path: [sq(3, 5)], captures: [] });
  ok("...and the game ends there", K.legalMoves(blocked.board, K.WHITE).length === 0 && blocked.gameOver && blocked.winner === K.BLACK);

  // Two kings shuffling in their own corners never meet.
  const draw = position([
    ".B......",
    "........",
    "........",
    "........",
    "........",
    "........",
    "........",
    "......W.",
  ], K.BLACK);
  const shuttle = { [sq(0, 1)]: sq(1, 0), [sq(1, 0)]: sq(0, 1), [sq(7, 6)]: sq(6, 7), [sq(6, 7)]: sq(7, 6) };
  let plies = 0;
  while (!draw.gameOver) {
    const from = draw.board.findIndex((v) => K.side(v) === draw.turn);
    K.play(draw, { from, path: [shuttle[from]], captures: [] });
    plies++;
  }
  ok("40 moves each with kings only: a draw", draw.winner === null && plies === K.DRAW_PLIES, { plies });

  const u = K.createGame();
  const first = K.legalMoves(u.board, K.BLACK)[0];
  K.play(u, first);
  ok("undo restores the position", K.undo(u) && u.turn === K.BLACK && K.count(u.board, K.BLACK) === 12 && !K.undo(u));
})();

// ---- AI ------------------------------------------------------------------------------

(function aiTests() {
  // Two captures on offer; landing on (3,4) gets the man jumped back by (2,5)
  // (which can't be jumped on: (1,6) is taken).
  const pick = position([
    "........",
    "......w.",
    ".....w..",
    "........",
    ".w.w....",
    "..b.....",
    "........",
    "........",
  ], K.BLACK);
  for (const level of ["medium", "hard"]) {
    const mv = K.chooseMove(pick, level, makeRng(1));
    ok(level + " picks the capture that keeps its man", mv.path.join() === String(sq(3, 0)), mv);
  }

  const hang = position([
    "........",
    "........",
    "........",
    "..w.....",
    "........",
    "........",
    "......b.",
    "........",
  ], K.BLACK);
  hang.board[sq(5, 2)] = K.BLACK;
  // (5,2) stepping to (4,1) or (4,3) puts it next to the white man at (3,2), which then jumps it.
  for (const level of ["medium", "hard"]) {
    const mv = K.chooseMove(hang, level, makeRng(2));
    ok(level + " doesn't hand over a piece", mv.from === sq(6, 6), mv);
  }
})();

function playOut(levels, seed) {
  const s = K.createGame();
  const rng = makeRng(seed);
  let plies = 0;
  let sane = true;
  while (!s.gameOver) {
    if (++plies > 500) throw new Error("game did not finish");
    K.play(s, K.chooseMove(s, levels[s.turn === K.BLACK ? 0 : 1], rng));
    sane = sane && K.count(s.board, K.BLACK) <= 12 && K.count(s.board, K.WHITE) <= 12 &&
      s.board.every((v, i) => !v || K.playable(Math.floor(i / 8), i % 8));
  }
  ok("game " + seed + ": pieces stay on dark squares, never more than 12", sane);
  return s;
}

(function gamesTest() {
  let wins = 0;
  const games = 10;
  for (let g = 0; g < games; g++) {
    const flip = g % 2;
    const s = playOut(flip ? ["easy", "medium"] : ["medium", "easy"], 100 + g);
    if (s.winner === (flip ? K.WHITE : K.BLACK)) wins++;
  }
  ok("Medium beats Easy (" + wins + "/" + games + ")", wins >= games - 1);
})();

console.log("checkers.test.js: " + passed + " assertions passed");
