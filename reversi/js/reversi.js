// Reversi (Othello): a flat 64-square board of EMPTY/BLACK/WHITE, moves with
// flips, forced passes, undo, and a negamax alpha-beta AI.
// No DOM - <script> (global REVERSI) or require() in Node.
(function (root) {
  "use strict";

  const SIZE = 8;
  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  const opponent = (player) => 3 - player;
  const onBoard = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

  function initialBoard() {
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    board[27] = WHITE; board[36] = WHITE;
    board[28] = BLACK; board[35] = BLACK;
    return board;
  }

  // Opponent discs `player` would flip by playing idx (empty = illegal).
  function flips(board, player, idx) {
    if (board[idx] !== EMPTY) return [];
    const row = Math.floor(idx / SIZE), col = idx % SIZE, opp = opponent(player);
    const out = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let r = row + dr, c = col + dc;
      while (onBoard(r, c) && board[r * SIZE + c] === opp) {
        line.push(r * SIZE + c);
        r += dr;
        c += dc;
      }
      if (line.length > 0 && onBoard(r, c) && board[r * SIZE + c] === player) out.push(...line);
    }
    return out;
  }

  function legalMoves(board, player) {
    const moves = [];
    for (let i = 0; i < board.length; i++) if (flips(board, player, i).length > 0) moves.push(i);
    return moves;
  }

  function applyMove(board, player, idx) {
    const flipped = flips(board, player, idx);
    if (flipped.length === 0) throw new Error("Illegal move");
    const next = board.slice();
    next[idx] = player;
    flipped.forEach((i) => { next[i] = player; });
    return next;
  }

  function count(board) {
    let black = 0, white = 0;
    board.forEach((v) => {
      if (v === BLACK) black++;
      else if (v === WHITE) white++;
    });
    return { black, white };
  }

  function winner(board) {
    const { black, white } = count(board);
    if (black === white) return EMPTY;
    return black > white ? BLACK : WHITE;
  }

  // `passed` names the player who just had to pass, for the UI to announce.
  function createGame() {
    return { board: initialBoard(), turn: BLACK, lastMove: null, passed: null, gameOver: false, history: [] };
  }

  function play(state, idx) {
    if (state.gameOver) throw new Error("Game is over");
    const board = applyMove(state.board, state.turn, idx);
    const { history, ...previous } = state;
    history.push(previous);
    state.board = board;
    state.lastMove = idx;
    const next = opponent(state.turn);
    if (legalMoves(board, next).length > 0) {
      state.turn = next;
      state.passed = null;
    } else if (legalMoves(board, state.turn).length > 0) {
      state.passed = next;
    } else {
      state.gameOver = true;
      state.passed = null;
    }
    return state;
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    Object.assign(state, previous);
    return true;
  }

  // Corners can never be flipped; the squares touching them give corners away.
  // ponytail: square weights + mobility only, no edge stability or parity -
  // add those if Hard proves easy to beat.
  const WEIGHTS = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, -1, -1, -1, -1, -2, 10,
    5, -2, -1, -1, -1, -1, -2, 5,
    5, -2, -1, -1, -1, -1, -2, 5,
    10, -2, -1, -1, -1, -1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100,
  ];
  const MOBILITY_WEIGHT = 5;
  const WIN_SCALE = 1000; // per disc of final margin, so a real result outranks any heuristic score
  const EXACT_ENDGAME_EMPTIES = 12;
  const LEVELS = {
    easy: { depth: 1, randomMoveChance: 0.3 },
    medium: { depth: 3, randomMoveChance: 0 },
    hard: { depth: 6, randomMoveChance: 0 },
  };

  // Squares next to a corner only give it away while that corner is still empty.
  const CORNER_NEIGHBOURS = [[0, [1, 8, 9]], [7, [6, 14, 15]], [56, [48, 49, 57]], [63, [54, 55, 62]]];

  function evaluate(board, player, mobility) {
    const opp = opponent(player);
    const owner = (i) => {
      if (board[i] === player) return 1;
      return board[i] === opp ? -1 : 0;
    };
    let score = 0;
    for (let i = 0; i < board.length; i++) score += owner(i) * WEIGHTS[i];
    for (const [corner, neighbours] of CORNER_NEIGHBOURS) {
      if (board[corner] !== EMPTY) neighbours.forEach((n) => { score -= owner(n) * WEIGHTS[n]; });
    }
    return score + MOBILITY_WEIGHT * (mobility - legalMoves(board, opp).length);
  }

  function finalScore(board, player) {
    const { black, white } = count(board);
    return (player === BLACK ? black - white : white - black) * WIN_SCALE;
  }

  // Trying corners first lets alpha-beta cut far more of the tree.
  const byWeight = (moves) => moves.slice().sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);

  function negamax(board, player, depth, alpha, beta) {
    const moves = legalMoves(board, player);
    if (moves.length === 0) {
      if (legalMoves(board, opponent(player)).length === 0) return finalScore(board, player);
      return -negamax(board, opponent(player), depth, -beta, -alpha);
    }
    if (depth === 0) return evaluate(board, player, moves.length);
    let best = -Infinity;
    for (const move of byWeight(moves)) {
      const score = -negamax(applyMove(board, player, move), opponent(player), depth - 1, -beta, -alpha);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove(board, player, level, rng) {
    const rand = rng || Math.random;
    const moves = legalMoves(board, player);
    if (moves.length === 0) return null;
    const cfg = LEVELS[level] || LEVELS.medium;
    if (rand() < cfg.randomMoveChance) return moves[Math.floor(rand() * moves.length)];
    const empties = board.filter((v) => v === EMPTY).length;
    // Every ply fills a square, so searching `empties` deep plays the ending perfectly.
    const depth = level === "hard" && empties <= EXACT_ENDGAME_EMPTIES ? empties : cfg.depth;
    let best = moves[0], bestScore = -Infinity;
    for (const move of byWeight(moves)) {
      const score = -negamax(applyMove(board, player, move), opponent(player), depth - 1, -Infinity, -bestScore);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  const api = {
    SIZE, EMPTY, BLACK, WHITE, LEVELS,
    opponent, initialBoard, flips, legalMoves, applyMove, count, winner, createGame, play, undo, chooseMove,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.REVERSI = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
