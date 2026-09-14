// Connect Four: a 7-column, 6-row board with gravity, four-in-a-row wins,
// draws, undo, and a negamax alpha-beta AI.
// No DOM - <script> (global CONNECT_FOUR) or require() in Node.
(function (root) {
  "use strict";

  const ROWS = 6;
  const COLS = 7;
  const EMPTY = 0, RED = 1, YELLOW = 2;
  const LINE_DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  const opponent = (player) => 3 - player;
  const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

  // Every straight run of four cells a win could use (69 of them).
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of LINE_DIRS) {
        if (inBounds(r + 3 * dr, c + 3 * dc)) WINDOWS.push([0, 1, 2, 3].map((k) => (r + k * dr) * COLS + c + k * dc));
      }
    }
  }

  // Row 0 is the top row; a disc lands in the lowest empty cell of its column.
  function landingRow(board, col) {
    for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === EMPTY) return r;
    return -1;
  }

  function legalMoves(board) {
    const moves = [];
    for (let c = 0; c < COLS; c++) if (board[c] === EMPTY) moves.push(c);
    return moves;
  }

  // The line of four or more through idx for whoever owns idx, or null.
  function winningLine(board, idx) {
    const player = board[idx];
    if (player === EMPTY) return null;
    const row = Math.floor(idx / COLS), col = idx % COLS;
    for (const [dr, dc] of LINE_DIRS) {
      const line = [idx];
      for (const sign of [1, -1]) {
        let r = row + sign * dr, c = col + sign * dc;
        while (inBounds(r, c) && board[r * COLS + c] === player) {
          line.push(r * COLS + c);
          r += sign * dr;
          c += sign * dc;
        }
      }
      if (line.length >= 4) return line.sort((a, b) => a - b);
    }
    return null;
  }

  function createGame() {
    return {
      board: new Array(ROWS * COLS).fill(EMPTY),
      turn: RED,
      lastMove: null,
      winner: EMPTY,
      winLine: null,
      gameOver: false,
      history: [],
    };
  }

  function play(state, col) {
    if (state.gameOver) throw new Error("Game is over");
    const row = Number.isInteger(col) && col >= 0 && col < COLS ? landingRow(state.board, col) : -1;
    if (row < 0) throw new Error("Illegal move");
    const { history, ...previous } = state;
    history.push(previous);
    const idx = row * COLS + col;
    state.board = state.board.slice();
    state.board[idx] = state.turn;
    state.lastMove = idx;
    state.winLine = winningLine(state.board, idx);
    if (state.winLine) {
      state.winner = state.turn;
      state.gameOver = true;
    } else if (legalMoves(state.board).length === 0) {
      state.gameOver = true;
    } else {
      state.turn = opponent(state.turn);
    }
    return state;
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    Object.assign(state, previous);
    return true;
  }

  // --------------------------------------------------------------------- AI

  const CENTRE_FIRST = [3, 2, 4, 1, 5, 0, 6]; // central columns join the most windows, so they cut the most
  const WIN_SCORE = 1000000;
  const LEVELS = {
    easy: { depth: 2, randomMoveChance: 0.3 },
    medium: { depth: 5, randomMoveChance: 0 },
    hard: { depth: 10, randomMoveChance: 0 },
  };

  // ponytail: open threes/twos plus centre control, no odd/even threat
  // parity - add it if Hard loses long endgames it should hold.
  function evaluate(board, player) {
    let score = 0;
    for (const cells of WINDOWS) {
      let mine = 0, theirs = 0;
      for (const i of cells) {
        if (board[i] === player) mine++;
        else if (board[i] !== EMPTY) theirs++;
      }
      if (theirs === 0) score += mine === 3 ? 5 : mine === 2 ? 2 : 0;
      else if (mine === 0) score -= theirs === 3 ? 5 : theirs === 2 ? 2 : 0;
    }
    for (let r = 0; r < ROWS; r++) {
      const v = board[r * COLS + 3];
      if (v === player) score += 3;
      else if (v !== EMPTY) score -= 3;
    }
    return score;
  }

  // Score for `player`, who moves next. Plays into `board` and restores it.
  // A win found with more depth left is a quicker win, so it scores higher.
  function negamax(board, player, depth, alpha, beta) {
    const moves = [];
    for (const col of CENTRE_FIRST) {
      const row = landingRow(board, col);
      if (row < 0) continue;
      const idx = row * COLS + col;
      board[idx] = player;
      const wins = winningLine(board, idx) !== null;
      board[idx] = EMPTY;
      if (wins) return WIN_SCORE + depth;
      moves.push(idx);
    }
    if (moves.length === 0) return 0;
    if (depth === 0) return evaluate(board, player);
    let best = -Infinity;
    for (const idx of moves) {
      board[idx] = player;
      const score = -negamax(board, opponent(player), depth - 1, -beta, -alpha);
      board[idx] = EMPTY;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove(board, player, level, rng) {
    const rand = rng || Math.random;
    const moves = legalMoves(board);
    if (moves.length === 0) return null;
    const cfg = LEVELS[level] || LEVELS.medium;
    if (rand() < cfg.randomMoveChance) return moves[Math.floor(rand() * moves.length)];
    const work = board.slice();
    let best = null, bestScore = -Infinity;
    for (const col of CENTRE_FIRST) {
      const row = landingRow(work, col);
      if (row < 0) continue;
      const idx = row * COLS + col;
      work[idx] = player;
      const score = winningLine(work, idx)
        ? WIN_SCORE + cfg.depth
        : -negamax(work, opponent(player), cfg.depth - 1, -Infinity, -bestScore);
      work[idx] = EMPTY;
      if (score > bestScore) {
        bestScore = score;
        best = col;
      }
    }
    return best;
  }

  const api = {
    ROWS, COLS, EMPTY, RED, YELLOW, LEVELS,
    opponent, landingRow, legalMoves, winningLine, createGame, play, undo, chooseMove,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CONNECT_FOUR = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
