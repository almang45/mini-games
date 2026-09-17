const assert = require("assert");
const R = require("../reversi.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- opening, flips, illegal moves, undo ----
{
  const s = R.createGame();
  ok("black opens with d3, c4, f5 or e6", R.legalMoves(s.board, R.BLACK).join() === "19,26,37,44");
  R.play(s, 19);
  ok("d3 flips d4", s.board[19] === R.BLACK && s.board[27] === R.BLACK);
  ok("then it's white's turn", s.turn === R.WHITE && s.lastMove === 19 && s.passed === null);
  ok("score is 4-1", JSON.stringify(R.count(s.board)) === JSON.stringify({ black: 4, white: 1 }));
  assert.throws(() => R.play(s, 0), /Illegal/);
  ok("an illegal move leaves the game untouched", s.history.length === 1 && s.turn === R.WHITE);
  ok("undo restores the opening", R.undo(s) && s.turn === R.BLACK && s.board[27] === R.WHITE && s.lastMove === null && s.history.length === 0);
  ok("nothing left to undo", !R.undo(s));
}
{
  const b = new Array(64).fill(R.EMPTY);
  b[28] = R.WHITE; b[29] = R.BLACK; // right: flips
  b[19] = R.WHITE; b[11] = R.BLACK; // up: flips
  b[36] = R.WHITE; b[45] = R.BLACK; // down-right: flips
  b[26] = R.WHITE;                  // left: runs into an empty square, no flip
  ok("flips every bracketed line and only those", R.flips(b, R.BLACK, 27).sort((x, y) => x - y).join() === "19,28,36");
  ok("an occupied square flips nothing", R.flips(b, R.BLACK, 28).length === 0);
}

// ---- passes and game end ----
{
  // After black takes c1, white's lone disc on b8 can't bracket anything, but black can still take c8.
  const s = R.createGame();
  s.board = new Array(64).fill(R.EMPTY);
  s.board[0] = R.BLACK; s.board[1] = R.WHITE; s.board[56] = R.BLACK; s.board[57] = R.WHITE;
  R.play(s, 2);
  ok("white passes and black moves again", s.turn === R.BLACK && s.passed === R.WHITE && !s.gameOver);
  R.play(s, 58);
  ok("the game ends when neither side can move", s.gameOver && R.winner(s.board) === R.BLACK && s.passed === null);
  assert.throws(() => R.play(s, 3), /over/);
  ok("undo reopens a finished game", R.undo(s) && !s.gameOver && s.passed === R.WHITE);
  ok("a level board is a draw", R.winner(R.initialBoard()) === R.EMPTY);
}

// ---- AI ----
{
  // a1 is on offer: b2 (white) sits between it and c3 (black).
  const b = R.initialBoard();
  b[9] = R.WHITE; b[18] = R.BLACK;
  ok("easy grabs the corner when not playing randomly", R.chooseMove(b, R.BLACK, "easy", () => 0.99) === 0);
  ok("no legal move gives null", R.chooseMove(new Array(64).fill(R.EMPTY), R.BLACK, "hard") === null);
}
{
  // c1 flips both white discs and ends the game 6-0; d2 only flips one of them.
  const b = new Array(64).fill(R.EMPTY);
  b[0] = R.BLACK; b[9] = R.BLACK; b[18] = R.BLACK; b[1] = R.WHITE; b[10] = R.WHITE;
  ok("black can choose c1 or d2", R.legalMoves(b, R.BLACK).join() === "2,11");
  ok("medium takes the win on the spot", R.chooseMove(b, R.BLACK, "medium") === 2);
}

// Perfect-play final margin for `player`, by brute force.
function exact(board, player) {
  const moves = R.legalMoves(board, player);
  const opp = R.opponent(player);
  if (moves.length === 0) {
    if (R.legalMoves(board, opp).length === 0) {
      const { black, white } = R.count(board);
      return player === R.BLACK ? black - white : white - black;
    }
    return -exact(board, opp);
  }
  return Math.max(...moves.map((m) => -exact(R.applyMove(board, player, m), opp)));
}

for (const [seed, blackLevel, whiteLevel] of [[1, "easy", "medium"], [2, "medium", "hard"], [3, "hard", "easy"]]) {
  const rng = mulberry32(seed);
  const s = R.createGame();
  let legal = true, endgameChecked = false;
  while (!s.gameOver) {
    const empties = s.board.filter((v) => v === R.EMPTY).length;
    if (!endgameChecked && empties <= 8) {
      const move = R.chooseMove(s.board, s.turn, "hard");
      const best = exact(s.board, s.turn);
      const got = -exact(R.applyMove(s.board, s.turn, move), R.opponent(s.turn));
      ok("seed " + seed + ": hard plays the ending perfectly (" + empties + " empty)", got === best, { got, best });
      endgameChecked = true;
    }
    const move = R.chooseMove(s.board, s.turn, s.turn === R.BLACK ? blackLevel : whiteLevel, rng);
    if (!R.legalMoves(s.board, s.turn).includes(move)) legal = false;
    R.play(s, move);
  }
  const { black, white } = R.count(s.board);
  ok(blackLevel + " vs " + whiteLevel + ": every AI move was legal", legal);
  ok(blackLevel + " vs " + whiteLevel + ": one disc placed per move", black + white === 4 + s.history.length);
  ok(blackLevel + " vs " + whiteLevel + ": the endgame was reached and checked", endgameChecked || black + white < 56);
}

console.log("reversi.test.js: " + passed + " assertions passed");
