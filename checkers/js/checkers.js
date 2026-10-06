// Checkers (English draughts) rules and AI, no DOM. 8x8 board, play on the
// dark squares, 12 pieces each. Black moves first, from the bottom.
//
// Men move one square diagonally forward; kings either way. Captures are
// compulsory: jump an adjacent enemy piece onto the empty square beyond, and
// keep jumping with the same piece while you can (any capture sequence may
// be chosen, but once started it must be finished). A man that reaches the
// far row is crowned, and a man crowned mid-jump stops there. A player with
// no legal move loses. 40 moves each with no capture and no man moved is a
// draw.
(function (root) {
  "use strict";

  const SIZE = 8;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = -1;
  const KING = 2;
  const DRAW_PLIES = 80;

  const side = (v) => Math.sign(v);
  const isKing = (v) => Math.abs(v) === KING;
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const playable = (r, c) => (r + c) % 2 === 1;
  // Black moves up the board (towards row 0), White down.
  const forward = (s) => (s === BLACK ? -1 : 1);
  const crownRow = (s) => (s === BLACK ? 0 : SIZE - 1);

  function createGame() {
    const board = new Array(SIZE * SIZE).fill(EMPTY);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!playable(r, c)) continue;
        if (r < 3) board[r * SIZE + c] = WHITE;
        else if (r > 4) board[r * SIZE + c] = BLACK;
      }
    }
    return { board, turn: BLACK, quiet: 0, lastMove: null, winner: null, gameOver: false, history: [] };
  }

  function directions(v) {
    const s = side(v);
    return isKing(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[forward(s), -1], [forward(s), 1]];
  }

  // Every capture sequence for the piece on `from`. Jumped pieces stay on the
  // board until the move ends but can't be jumped twice.
  function jumpsFrom(board, from) {
    const v = board[from];
    const s = side(v);
    const out = [];
    const walk = (at, piece, path, captured) => {
      const r = Math.floor(at / SIZE), c = at % SIZE;
      let extended = false;
      for (const [dr, dc] of directions(piece)) {
        const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!inside(lr, lc)) continue;
        const mid = mr * SIZE + mc, land = lr * SIZE + lc;
        if (side(board[mid]) !== -s || captured.includes(mid)) continue;
        if (board[land] !== EMPTY && land !== from) continue;
        extended = true;
        const crowned = !isKing(piece) && lr === crownRow(s);
        if (crowned) out.push({ from, path: path.concat(land), captures: captured.concat(mid) });
        else walk(land, piece, path.concat(land), captured.concat(mid));
      }
      if (!extended && captured.length) out.push({ from, path, captures: captured });
    };
    walk(from, v, [], []);
    return out;
  }

  function legalMoves(board, turn) {
    const jumps = [];
    const steps = [];
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (side(board[i]) !== turn) continue;
      jumps.push(...jumpsFrom(board, i));
      if (jumps.length) continue;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      for (const [dr, dc] of directions(board[i])) {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && board[nr * SIZE + nc] === EMPTY) steps.push({ from: i, path: [nr * SIZE + nc], captures: [] });
      }
    }
    return jumps.length ? jumps : steps;
  }

  // Applies a move to a board in place and returns what's needed to undo it.
  function apply(board, move) {
    const v = board[move.from];
    const to = move.path[move.path.length - 1];
    const taken = move.captures.map((i) => board[i]);
    board[move.from] = EMPTY;
    move.captures.forEach((i) => { board[i] = EMPTY; });
    const crowned = !isKing(v) && Math.floor(to / SIZE) === crownRow(side(v));
    board[to] = crowned ? side(v) * KING : v;
    return { v, to, taken };
  }

  function unapply(board, move, info) {
    board[info.to] = EMPTY;
    move.captures.forEach((i, k) => { board[i] = info.taken[k]; });
    board[move.from] = info.v;
  }

  const sameMove = (a, b) => a.from === b.from && a.path.length === b.path.length && a.path.every((x, i) => x === b.path[i]);

  function play(state, move) {
    if (state.gameOver) throw new Error("the game is over");
    const legal = legalMoves(state.board, state.turn).find((m) => sameMove(m, move));
    if (!legal) throw new Error("illegal move");
    const { history, ...previous } = state;
    history.push(previous);
    state.board = state.board.slice();
    const info = apply(state.board, legal);
    state.quiet = legal.captures.length || !isKing(info.v) ? 0 : state.quiet + 1;
    state.lastMove = legal;
    state.turn = -state.turn;
    if (!legalMoves(state.board, state.turn).length) {
      state.gameOver = true;
      state.winner = -state.turn;
    } else if (state.quiet >= DRAW_PLIES) {
      state.gameOver = true;
      state.winner = null;
    }
    return legal;
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    Object.assign(state, previous);
    return true;
  }

  const count = (board, s) => board.reduce((n, v) => n + (side(v) === s ? 1 : 0), 0);

  // --------------------------------------------------------------------- AI

  const WIN = 100000;
  const LEVELS = {
    easy: { depth: 2, randomMoveChance: 0.3 },
    medium: { depth: 5, randomMoveChance: 0 },
    hard: { depth: 7, randomMoveChance: 0 },
  };

  // Material first; then men advancing, kings centralised, and the back
  // row kept to stop the other side crowning.
  function evaluate(board, turn) {
    let score = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = board[i];
      if (!v) continue;
      const s = side(v);
      const r = Math.floor(i / SIZE), c = i % SIZE;
      let p;
      if (isKing(v)) {
        p = 175 - 2 * (Math.abs(3.5 - r) + Math.abs(3.5 - c));
      } else {
        const advanced = s === BLACK ? 7 - r : r;
        p = 100 + 3 * advanced + (r === (s === BLACK ? 7 : 0) ? 8 : 0);
      }
      score += s === turn ? p : -p;
    }
    return score;
  }

  // Negamax with alpha-beta. Captures are forced, so a position with one
  // pending is searched past the horizon (up to a few plies) rather than
  // judged mid-exchange.
  function negamax(board, turn, depth, alpha, beta, ply) {
    const moves = legalMoves(board, turn);
    if (!moves.length) return -WIN + ply;
    const capturing = moves[0].captures.length > 0;
    if (depth <= 0 && (!capturing || depth <= -6)) return evaluate(board, turn);
    let best = -Infinity;
    for (const m of moves) {
      const info = apply(board, m);
      const score = -negamax(board, -turn, depth - 1, -beta, -alpha, ply + 1);
      unapply(board, m, info);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove(state, level, rng) {
    const rand = rng || Math.random;
    const moves = legalMoves(state.board, state.turn);
    if (!moves.length) return null;
    const cfg = LEVELS[level] || LEVELS.medium;
    if (rand() < cfg.randomMoveChance) return moves[Math.floor(rand() * moves.length)];
    const board = state.board.slice();
    let best = [];
    let bestScore = -Infinity;
    for (const m of moves) {
      const info = apply(board, m);
      const score = -negamax(board, -state.turn, cfg.depth - 1, -Infinity, -bestScore + 1, 1);
      unapply(board, m, info);
      if (score > bestScore) { bestScore = score; best = [m]; }
      else if (score === bestScore) best.push(m);
    }
    // Ties broken at random so the AI doesn't play the same game every time.
    return best[Math.floor(rand() * best.length)];
  }

  const api = {
    SIZE, EMPTY, BLACK, WHITE, KING, DRAW_PLIES, LEVELS,
    side, isKing, playable, createGame, legalMoves, jumpsFrom, play, undo, count, evaluate, chooseMove,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CHECKERS = api;
})(typeof window !== "undefined" ? window : globalThis);
