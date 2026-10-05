// Ludo rules and AI, no DOM. 2-4 players, four tokens each.
//
// A token's position is its own progress, the same for every colour:
//   -1      in the yard
//   0..50   on the shared 52-square loop (0 is the colour's start square)
//   51..55  its own home column
//   56      home
// A colour's progress p sits on loop square (START[color] + p) % 52.
(function (root) {
  "use strict";

  const COLORS = ["red", "green", "yellow", "blue"];
  const START = { red: 0, green: 13, yellow: 26, blue: 39 };
  const LOOP = 52;
  const LAST_LOOP = 50;
  const HOME = 56;
  const TOKENS = 4;
  // Start squares and the star eight squares past each: nobody is captured there.
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  // Two players sit opposite each other, three leave blue out.
  const SEAT_COLORS = { 2: ["red", "yellow"], 3: ["red", "green", "yellow"], 4: COLORS };
  const NAME = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };

  function loopSquare(color, p) { return p >= 0 && p <= LAST_LOOP ? (START[color] + p) % LOOP : null; }

  function createGame(types, opts) {
    const n = types.length;
    if (!SEAT_COLORS[n]) throw new Error("Ludo needs 2-4 players");
    return {
      seats: types.map((type, i) => ({ type, color: SEAT_COLORS[n][i], name: NAME[SEAT_COLORS[n][i]], tokens: new Array(TOKENS).fill(-1) })),
      rng: (opts && opts.rng) || Math.random,
      turn: 0,
      phase: "roll",
      die: null,
      sixes: 0,
      legal: [],
      lastMove: null,
      gameOver: false,
      winner: null,
      log: [],
    };
  }

  function target(p, die) {
    if (p === -1) return die === 6 ? 0 : null;
    if (p === HOME) return null;
    return p + die <= HOME ? p + die : null; // an exact roll is needed to finish
  }

  function legalMoves(state, seat, die) {
    return state.seats[seat].tokens.map((p, i) => (target(p, die) === null ? -1 : i)).filter((i) => i !== -1);
  }

  const say = (state, text) => state.log.push(text);
  const nameOf = (state, seat) => state.seats[seat].name;

  function passTurn(state) {
    state.turn = (state.turn + 1) % state.seats.length;
    state.sixes = 0;
    state.phase = "roll";
    state.legal = [];
  }

  // `value` lets tests (and replays) fix the die; play leaves it out.
  function roll(state, value) {
    if (state.gameOver || state.phase !== "roll") throw new Error("not time to roll");
    const die = value || 1 + Math.floor(state.rng() * 6);
    if (die < 1 || die > 6) throw new Error("bad die " + die);
    state.die = die;
    state.lastMove = null;
    const seat = state.turn;
    if (die === 6) state.sixes += 1;
    if (state.sixes === 3) {
      say(state, nameOf(state, seat) + " rolls a third 6 in a row and loses the turn.");
      passTurn(state);
      return die;
    }
    state.legal = legalMoves(state, seat, die);
    if (state.legal.length > 0) {
      state.phase = "move";
      say(state, nameOf(state, seat) + " rolls " + die + ".");
    } else if (die === 6) {
      say(state, nameOf(state, seat) + " rolls 6 but can't move - rolls again.");
    } else {
      say(state, nameOf(state, seat) + " rolls " + die + " - no move.");
      passTurn(state);
    }
    return die;
  }

  function move(state, token) {
    if (state.gameOver || state.phase !== "move") throw new Error("not time to move");
    if (!state.legal.includes(token)) throw new Error("token " + token + " can't move " + state.die);
    const seat = state.turn;
    const me = state.seats[seat];
    const from = me.tokens[token];
    const to = target(from, state.die);
    me.tokens[token] = to;

    const captured = [];
    const square = loopSquare(me.color, to);
    if (square !== null && !SAFE.has(square)) {
      state.seats.forEach((other, s) => {
        if (s === seat) return;
        other.tokens.forEach((q, t) => {
          if (loopSquare(other.color, q) === square) {
            other.tokens[t] = -1;
            captured.push({ seat: s, token: t, from: q });
          }
        });
      });
    }
    state.lastMove = { seat, token, from, to, captured };

    const verb = from === -1 ? " brings a token out" : to === HOME ? " gets a token home" : " moves " + state.die;
    say(state, me.name + verb + (captured.length ? ", capturing " + captured.map((c) => nameOf(state, c.seat)).join(" and ") : "") + ".");

    if (me.tokens.every((p) => p === HOME)) {
      state.gameOver = true;
      state.winner = seat;
      state.phase = "over";
      state.legal = [];
      say(state, me.name + " wins!");
      return state.lastMove;
    }
    // A 6, a capture or a token reaching home earns another roll.
    if (state.die === 6 || captured.length > 0 || to === HOME) {
      if (state.die !== 6) state.sixes = 0;
      state.phase = "roll";
      state.legal = [];
    } else {
      passTurn(state);
    }
    return state.lastMove;
  }

  // ------------------------------------------------------------------- AI

  // How many opponent tokens could land on this loop square with one roll.
  function threats(state, seat, square) {
    if (square === null || SAFE.has(square)) return 0;
    let count = 0;
    state.seats.forEach((other, s) => {
      if (s === seat) return;
      other.tokens.forEach((q) => {
        const from = loopSquare(other.color, q);
        if (from === null) return;
        const gap = (square - from + LOOP) % LOOP;
        if (gap >= 1 && gap <= 6 && q + gap <= LAST_LOOP) count += 1;
      });
    });
    return count;
  }

  // Scores a move from the mover's point of view: finish, capture, leave the
  // yard, reach safety, and don't stop where someone can hit you.
  function scoreMove(state, seat, token, die) {
    const me = state.seats[seat];
    const from = me.tokens[token];
    const to = target(from, die);
    const square = loopSquare(me.color, to);
    let score = to / 10;
    if (to === HOME) score += 100;
    if (from === -1) score += 60;
    if (from <= LAST_LOOP && to > LAST_LOOP) score += 40;
    if (square !== null && SAFE.has(square)) score += 20;
    if (square !== null && !SAFE.has(square)) {
      state.seats.forEach((other, s) => {
        if (s === seat) return;
        other.tokens.forEach((q) => { if (loopSquare(other.color, q) === square) score += 80 + q; });
      });
    }
    const atRisk = threats(state, seat, loopSquare(me.color, from));
    const willRisk = threats(state, seat, square);
    if (atRisk > 0 && willRisk === 0) score += 25 + from / 4;
    if (willRisk > 0) score -= 30 + to / 2;
    return score;
  }

  function chooseMove(state, level) {
    const legal = state.legal;
    if (level === "easy") return legal[Math.floor(state.rng() * legal.length)];
    const seat = state.turn;
    return legal.reduce((best, t) => (scoreMove(state, seat, t, state.die) > scoreMove(state, seat, best, state.die) ? t : best));
  }

  const api = {
    COLORS, START, SAFE, LOOP, LAST_LOOP, HOME, TOKENS, NAME, SEAT_COLORS,
    loopSquare, target, legalMoves, createGame, roll, move, threats, scoreMove, chooseMove,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LUDO = api;
})(typeof window !== "undefined" ? window : globalThis);
