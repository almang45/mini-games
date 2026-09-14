// Mancala, Kalah rules with six pits and four seeds each: sowing, extra turns,
// captures, the end-of-game sweep, undo, and an alpha-beta AI.
// No DOM - <script> (global MANCALA) or require() in Node.
(function (root) {
  "use strict";

  const PITS = 6;
  const SEEDS = 4;
  const TOTAL_SEEDS = 2 * PITS * SEEDS;
  // Indices run counter-clockwise: South's pits 0-5, South's store 6,
  // North's pits 7-12, North's store 13.
  const SOUTH = 0, NORTH = 1;
  const STORE = [6, 13];
  const PIT_INDICES = [[0, 1, 2, 3, 4, 5], [7, 8, 9, 10, 11, 12]];

  const opponent = (player) => 1 - player;
  const opposite = (pit) => 12 - pit;
  const sideSeeds = (board, player) => PIT_INDICES[player].reduce((sum, i) => sum + board[i], 0);

  function initialBoard() {
    const board = new Array(14).fill(SEEDS);
    board[STORE[SOUTH]] = 0;
    board[STORE[NORTH]] = 0;
    return board;
  }

  function legalMoves(board, player) {
    return PIT_INDICES[player].filter((i) => board[i] > 0);
  }

  // Everything that happens when `player` sows from `pit`:
  // {board, path (indices that got a seed, in order), extraTurn, capture, sweep, gameOver}.
  function sow(board, player, pit) {
    if (!PIT_INDICES[player].includes(pit) || board[pit] === 0) throw new Error("Illegal move");
    const next = board.slice();
    let seeds = next[pit];
    next[pit] = 0;
    const path = [];
    let pos = pit;
    while (seeds > 0) {
      pos = (pos + 1) % 14;
      if (pos === STORE[opponent(player)]) continue;
      next[pos]++;
      path.push(pos);
      seeds--;
    }

    let capture = null;
    const landedInOwnEmptyPit = PIT_INDICES[player].includes(pos) && next[pos] === 1;
    if (landedInOwnEmptyPit && next[opposite(pos)] > 0) {
      capture = { pit: pos, opposite: opposite(pos), seeds: next[opposite(pos)] + 1 };
      next[STORE[player]] += capture.seeds;
      next[pos] = 0;
      next[opposite(pos)] = 0;
    }

    // Once either side is empty the game ends and each player banks what's left on their own side.
    let sweep = null;
    if (sideSeeds(next, SOUTH) === 0 || sideSeeds(next, NORTH) === 0) {
      sweep = [SOUTH, NORTH].map((p) => {
        const banked = sideSeeds(next, p);
        PIT_INDICES[p].forEach((i) => { next[i] = 0; });
        next[STORE[p]] += banked;
        return banked;
      });
    }
    return { board: next, path, extraTurn: !sweep && pos === STORE[player], capture, sweep, gameOver: !!sweep };
  }

  function createGame() {
    return { board: initialBoard(), turn: SOUTH, lastMove: null, lastResult: null, gameOver: false, history: [] };
  }

  function play(state, pit) {
    if (state.gameOver) throw new Error("Game is over");
    const result = sow(state.board, state.turn, pit);
    const { history, ...previous } = state;
    history.push(previous);
    state.board = result.board;
    state.lastMove = { player: state.turn, pit };
    state.lastResult = result;
    state.gameOver = result.gameOver;
    if (!result.gameOver && !result.extraTurn) state.turn = opponent(state.turn);
    return state;
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    Object.assign(state, previous);
    return true;
  }

  // SOUTH, NORTH, or null for a draw.
  function winner(board) {
    const diff = board[STORE[SOUTH]] - board[STORE[NORTH]];
    if (diff === 0) return null;
    return diff > 0 ? SOUTH : NORTH;
  }

  // --------------------------------------------------------------------- AI

  const WIN_SCALE = 1000; // per seed of final margin, so a finished game outranks any estimate
  const LEVELS = {
    easy: { depth: 2, randomMoveChance: 0.3 },
    medium: { depth: 6, randomMoveChance: 0 },
    hard: { depth: 14, randomMoveChance: 0 },
  };

  // Seeds in a store are banked for good; seeds on your side usually, not always, end up yours.
  function evaluate(board, player) {
    const opp = opponent(player);
    return 4 * (board[STORE[player]] - board[STORE[opp]]) + sideSeeds(board, player) - sideSeeds(board, opp);
  }

  // Moves that end in your own store come first: they are usually best, which lets alpha-beta cut more.
  function orderedMoves(board, player) {
    const earnsExtraTurn = (pit) => board[pit] === STORE[player] - pit;
    return legalMoves(board, player).sort((a, b) => earnsExtraTurn(b) - earnsExtraTurn(a) || b - a);
  }

  // Score for `player`, who moves next. An extra turn keeps the same player
  // (and the same window) instead of flipping sides.
  function search(board, player, depth, alpha, beta) {
    const opp = opponent(player);
    let best = -Infinity;
    for (const pit of orderedMoves(board, player)) {
      const result = sow(board, player, pit);
      let score;
      if (result.gameOver) score = (result.board[STORE[player]] - result.board[STORE[opp]]) * WIN_SCALE;
      else if (depth <= 1) score = evaluate(result.board, player);
      else if (result.extraTurn) score = search(result.board, player, depth - 1, alpha, beta);
      else score = -search(result.board, opp, depth - 1, -beta, -alpha);
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
    const opp = opponent(player);
    let best = moves[0], bestScore = -Infinity;
    for (const pit of orderedMoves(board, player)) {
      const result = sow(board, player, pit);
      let score;
      if (result.gameOver) score = (result.board[STORE[player]] - result.board[STORE[opp]]) * WIN_SCALE;
      else if (result.extraTurn) score = search(result.board, player, cfg.depth - 1, bestScore, Infinity);
      else score = -search(result.board, opp, cfg.depth - 1, -Infinity, -bestScore);
      if (score > bestScore) {
        bestScore = score;
        best = pit;
      }
    }
    return best;
  }

  const api = {
    PITS, SEEDS, TOTAL_SEEDS, SOUTH, NORTH, STORE, PIT_INDICES, LEVELS,
    opponent, opposite, initialBoard, legalMoves, sow, createGame, play, undo, winner, chooseMove,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MANCALA = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
