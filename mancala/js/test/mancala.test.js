const assert = require("assert");
const M = require("../mancala.js");

const { SOUTH, NORTH, STORE } = M;

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

// South's pits, South's store, North's pits, North's store.
const board = (south, southStore, north, northStore) => [...south, southStore, ...north, northStore];
const total = (b) => b.reduce((sum, n) => sum + n, 0);

// ---- rules -----------------------------------------------------------------

{
  const state = M.createGame();
  ok("six pits of four a side, empty stores", state.board.join() === "4,4,4,4,4,4,0,4,4,4,4,4,4,0");
  ok("South moves first", state.turn === SOUTH);
  ok("South may sow any of its pits", M.legalMoves(state.board, SOUTH).join() === "0,1,2,3,4,5");
  ok("North owns 7-12", M.legalMoves(state.board, NORTH).join() === "7,8,9,10,11,12");
  assert.throws(() => M.play(state, 8), /Illegal move/);
}

{
  const result = M.sow(M.initialBoard(), SOUTH, 2);
  ok("sowing drops one seed per pit counter-clockwise", result.path.join() === "3,4,5,6" && result.board[2] === 0, result);
  ok("ending in your own store earns another turn", result.extraTurn && result.board[STORE[SOUTH]] === 1);
  const state = M.play(M.createGame(), 2);
  ok("the turn stays with South after an extra turn", state.turn === SOUTH);
  M.play(state, 0);
  ok("an ordinary move passes the turn", state.turn === NORTH);
}

{
  const result = M.sow(board([2, 2, 2, 0, 0, 9], 0, [1, 1, 1, 1, 1, 1], 0), SOUTH, 5);
  ok("the opponent's store is skipped", !result.path.includes(STORE[NORTH]) && result.board[STORE[NORTH]] === 0, result.path);
  ok("sowing wraps round to your own side", result.path.join() === "6,7,8,9,10,11,12,0,1" && result.board[1] === 3);
  ok("landing in a non-empty pit captures nothing", result.capture === null && !result.extraTurn);
}

{
  const result = M.sow(board([0, 1, 0, 0, 0, 3], 0, [1, 1, 1, 5, 1, 1], 0), SOUTH, 1);
  ok("landing in your own empty pit captures the opposite pit", result.capture && result.capture.opposite === 10 && result.capture.seeds === 6, result.capture);
  ok("captured seeds go to your store", result.board[STORE[SOUTH]] === 6 && result.board[2] === 0 && result.board[10] === 0);
  const empty = M.sow(board([0, 1, 0, 0, 0, 3], 0, [1, 1, 1, 0, 1, 1], 0), SOUTH, 1);
  ok("no capture when the opposite pit is empty", empty.capture === null && empty.board[2] === 1);
}

{
  const result = M.sow(board([0, 0, 0, 0, 0, 1], 10, [2, 0, 0, 3, 0, 0], 20), SOUTH, 5);
  ok("emptying your side ends the game", result.gameOver && !result.extraTurn, result);
  ok("the other side banks its own seeds", result.sweep.join() === "0,5" && result.board[STORE[NORTH]] === 25 && result.board[STORE[SOUTH]] === 11);
  ok("the sweep clears every pit", M.PIT_INDICES.flat().every((i) => result.board[i] === 0));
}

{
  const north = M.sow(board([1, 1, 1, 1, 1, 1], 0, [1, 1, 1, 1, 1, 1], 0), NORTH, 12);
  ok("North's last pit feeds North's store", north.extraTurn && north.board[STORE[NORTH]] === 1);
  const state = M.createGame();
  M.play(state, 0);
  M.play(state, 9);
  ok("undo steps back one move", M.undo(state) && state.turn === NORTH && state.board[9] === 4);
  ok("undo again restores the start", M.undo(state) && state.board.join() === M.initialBoard().join());
  ok("nothing left to undo", M.undo(state) === false);
}

{
  const rand = mulberry32(7);
  let conserved = true, finished = 0;
  for (let g = 0; g < 50; g++) {
    const state = M.createGame();
    let guard = 0;
    while (!state.gameOver && guard++ < 500) {
      const moves = M.legalMoves(state.board, state.turn);
      M.play(state, moves[Math.floor(rand() * moves.length)]);
      if (total(state.board) !== M.TOTAL_SEEDS) conserved = false;
    }
    if (state.gameOver && state.board[STORE[SOUTH]] + state.board[STORE[NORTH]] === M.TOTAL_SEEDS) finished++;
  }
  ok("random games never create or lose seeds", conserved);
  ok("random games all end with every seed banked", finished === 50, finished);
}

// ---- AI ----------------------------------------------------------------------

{
  const position = board([0, 1, 0, 4, 4, 4], 0, [1, 1, 1, 12, 1, 1], 0);
  ok("medium grabs a 13-seed capture", M.chooseMove(position, SOUTH, "medium") === 1);
  ok("hard grabs a 13-seed capture", M.chooseMove(position, SOUTH, "hard") === 1);
  ok("easy grabs it too when not moving at random", M.chooseMove(position, SOUTH, "easy", () => 0.99) === 1);
}

function playOut(levels, seed) {
  const rand = mulberry32(seed);
  const state = M.createGame();
  while (!state.gameOver) M.play(state, M.chooseMove(state.board, state.turn, levels[state.turn], rand));
  return M.winner(state.board);
}

let hardWins = 0;
for (let g = 0; g < 4; g++) {
  if (playOut({ [SOUTH]: "hard", [NORTH]: "easy" }, 300 + g) === SOUTH) hardWins++;
  if (playOut({ [SOUTH]: "easy", [NORTH]: "hard" }, 400 + g) === NORTH) hardWins++;
}
ok("hard beats easy from either side", hardWins >= 7, hardWins);

const started = Date.now();
M.chooseMove(M.initialBoard(), SOUTH, "hard");
const openingMs = Date.now() - started;

console.log("mancala.test.js: " + passed + " assertions passed (hard opening move " + openingMs + "ms)");
