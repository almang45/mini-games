const assert = require("assert");
const C4 = require("../connect-four.js");

const { COLS, EMPTY, RED, YELLOW } = C4;

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (r, c) => r * COLS + c;
const CELL = { ".": EMPTY, R: RED, Y: YELLOW };

// Rows are written top to bottom: "." empty, "R" red, "Y" yellow.
function fromRows(rows, turn) {
  const state = C4.createGame();
  state.board = rows.join("").split("").map((ch) => CELL[ch]);
  state.turn = turn;
  return state;
}

function playAll(state, cols) {
  cols.forEach((col) => C4.play(state, col));
  return state;
}

// ---- rules -----------------------------------------------------------------

{
  const state = C4.createGame();
  ok("new board is empty", state.board.length === 42 && state.board.every((v) => v === EMPTY));
  ok("red moves first", state.turn === RED);
  ok("every column is open", C4.legalMoves(state.board).join() === "0,1,2,3,4,5,6");
  playAll(state, [3, 3]);
  ok("first disc drops to the bottom row", state.board[at(5, 3)] === RED);
  ok("second disc stacks on top", state.board[at(4, 3)] === YELLOW && state.turn === RED);
  ok("lastMove is the landing cell", state.lastMove === at(4, 3));
}

{
  const state = playAll(C4.createGame(), [0, 0, 0, 0, 0, 0]);
  assert.throws(() => C4.play(state, 0), /Illegal move/);
  assert.throws(() => C4.play(state, 7), /Illegal move/);
  assert.throws(() => C4.play(state, -1), /Illegal move/);
  ok("a full column is no longer legal", !C4.legalMoves(state.board).includes(0));
}

{
  const state = playAll(C4.createGame(), [0, 0, 1, 1, 2, 2, 3]);
  ok("four across wins", state.gameOver && state.winner === RED, state);
  ok("winning line is the bottom four", state.winLine.join() === [at(5, 0), at(5, 1), at(5, 2), at(5, 3)].join(), state.winLine);
  ok("the winner keeps the turn", state.turn === RED);
  assert.throws(() => C4.play(state, 4), /Game is over/);
}

{
  const state = playAll(C4.createGame(), [3, 4, 3, 4, 3, 4, 3]);
  ok("four down wins", state.winner === RED && state.winLine.join() === [at(2, 3), at(3, 3), at(4, 3), at(5, 3)].join(), state.winLine);
}

{
  const rows = [".......", ".......", ".......", "..RY...", ".RYY...", "RYRY..R"];
  const rising = C4.play(fromRows(rows, RED), 3);
  ok("four on a rising diagonal wins", rising.winner === RED && rising.winLine.join() === [at(2, 3), at(3, 2), at(4, 1), at(5, 0)].join(), rising.winLine);
  const mirrored = rows.map((row) => row.split("").reverse().join(""));
  const falling = C4.play(fromRows(mirrored, RED), 3);
  ok("four on a falling diagonal wins", falling.winner === RED && falling.winLine.length === 4, falling.winLine);
}

{
  // Colour flips every row and every second column, so no line of four exists anywhere.
  const board = Array.from({ length: 42 }, (_, i) => ((Math.floor((i % COLS) / 2) + Math.floor(i / COLS)) % 2 === 0 ? RED : YELLOW));
  board[at(0, 6)] = EMPTY;
  const state = C4.createGame();
  state.board = board;
  state.turn = YELLOW;
  C4.play(state, 6);
  ok("filling the board without four is a draw", state.gameOver && state.winner === EMPTY && state.winLine === null, state);
}

{
  const state = playAll(C4.createGame(), [2, 5]);
  ok("undo takes back one disc", C4.undo(state) && state.board[at(5, 5)] === EMPTY && state.turn === YELLOW);
  ok("undo again empties the board", C4.undo(state) && state.board.every((v) => v === EMPTY) && state.turn === RED);
  ok("nothing left to undo", C4.undo(state) === false);
}

// ---- AI ----------------------------------------------------------------------

function winsAt(board, player, col) {
  const row = C4.landingRow(board, col);
  if (row < 0) return false;
  const next = board.slice();
  next[at(row, col)] = player;
  return C4.winningLine(next, at(row, col)) !== null;
}

function drop(board, player, col) {
  const next = board.slice();
  next[at(C4.landingRow(board, col), col)] = player;
  return next;
}

const winningCols = (board, player) => C4.legalMoves(board).filter((col) => winsAt(board, player, col));
const givesAway = (board, player, col) => winningCols(drop(board, player, col), C4.opponent(player)).length > 0;

// Random mid-game positions that are still in play.
function randomPositions(count, seed) {
  const rand = mulberry32(seed);
  const positions = [];
  while (positions.length < count) {
    const state = C4.createGame();
    const length = 4 + Math.floor(rand() * 26);
    for (let i = 0; i < length && !state.gameOver; i++) {
      const moves = C4.legalMoves(state.board);
      C4.play(state, moves[Math.floor(rand() * moves.length)]);
    }
    if (!state.gameOver) positions.push(state);
  }
  return positions;
}

function checkTactics(level, positions) {
  const noRandom = () => 0.99;
  for (const { board, turn } of positions) {
    const choice = C4.chooseMove(board, turn, level, noRandom);
    ok(level + ": picks a legal column", C4.legalMoves(board).includes(choice), { board, choice });
    const wins = winningCols(board, turn);
    if (wins.length > 0) {
      ok(level + ": takes an immediate win", wins.includes(choice), { board, turn, choice });
      continue;
    }
    const threats = winningCols(board, C4.opponent(turn));
    if (threats.length === 1) {
      ok(level + ": blocks the only threat", choice === threats[0], { board, turn, choice });
      continue;
    }
    if (threats.length > 1) continue; // lost either way
    const safe = C4.legalMoves(board).filter((col) => !givesAway(board, turn, col));
    if (safe.length > 0) ok(level + ": never sets up the opponent's win", !givesAway(board, turn, choice), { board, turn, choice });
  }
}

checkTactics("easy", randomPositions(120, 1));
checkTactics("medium", randomPositions(120, 2));
checkTactics("hard", randomPositions(25, 3));

function playOut(levels, seed) {
  const rand = mulberry32(seed);
  const state = C4.createGame();
  while (!state.gameOver) C4.play(state, C4.chooseMove(state.board, state.turn, levels[state.turn], rand));
  return state.winner;
}

let hardWins = 0;
for (let g = 0; g < 4; g++) {
  if (playOut({ [RED]: "hard", [YELLOW]: "easy" }, 100 + g) === RED) hardWins++;
  if (playOut({ [RED]: "easy", [YELLOW]: "hard" }, 200 + g) === YELLOW) hardWins++;
}
ok("hard beats easy from either side", hardWins >= 7, hardWins);

const started = Date.now();
C4.chooseMove(C4.createGame().board, RED, "hard");
const openingMs = Date.now() - started;

console.log("connect-four.test.js: " + passed + " assertions passed (hard opening move " + openingMs + "ms)");
