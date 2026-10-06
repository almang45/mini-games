// Backgammon rules and AI, no DOM. Standard 15-checker setup, no doubling
// cube; a win scores 1, a gammon 2, a backgammon 3.
//
// Positions are stored as 24 signed counts (index 0..23; White's checkers
// positive, Black's negative) plus checkers on the bar and borne off. Rules
// code works in "relative points": for either side, point r (1..24) is r
// pips from bearing off, 25 is the bar and 0 is off. White's r is index+1,
// Black's is 24-index, so each side's home board is r 1..6.
//
// A turn uses as many dice as it can (doubles give four moves); if only one
// die can be used and either could be, it must be the larger.
(function (root) {
  "use strict";

  const WHITE = 1;
  const BLACK = -1;
  const CHECKERS = 15;
  const BAR = 25;
  const OFF = 0;

  const idx = (s, r) => (s === WHITE ? r - 1 : 24 - r);
  const rel = (s, i) => (s === WHITE ? i + 1 : 24 - i);
  const other = (s) => -s;

  // Relative points of each side's opening checkers: 2 on 24, 5 on 13, 3 on 8, 5 on 6.
  const START = [[24, 2], [13, 5], [8, 3], [6, 5]];

  function startPosition() {
    const board = new Array(24).fill(0);
    for (const s of [WHITE, BLACK]) for (const [r, n] of START) board[idx(s, r)] += s * n;
    return { board, bar: { [WHITE]: 0, [BLACK]: 0 }, off: { [WHITE]: 0, [BLACK]: 0 } };
  }

  const clonePos = (p) => ({ board: p.board.slice(), bar: { ...p.bar }, off: { ...p.off } });
  const countAt = (p, s, r) => Math.max(0, p.board[idx(s, r)] * s);
  const posKey = (p) => p.board.join(",") + "|" + p.bar[WHITE] + "," + p.bar[BLACK] + "|" + p.off[WHITE] + "," + p.off[BLACK];

  // The relative point of side s's rearmost checker (25 if any is on the bar, 0 if none are left).
  function rearmost(p, s) {
    if (p.bar[s]) return BAR;
    for (let r = 24; r >= 1; r--) if (countAt(p, s, r)) return r;
    return 0;
  }

  function pips(p, s) {
    let n = p.bar[s] * BAR;
    for (let r = 1; r <= 24; r++) n += r * countAt(p, s, r);
    return n;
  }

  // ------------------------------------------------------------ moves

  // Where a checker of side s on relative point `from` lands with die d, or -1.
  function target(p, s, from, d) {
    if (p.bar[s] && from !== BAR) return -1;
    if (from === BAR ? !p.bar[s] : !countAt(p, s, from)) return -1;
    const to = from - d;
    if (to >= 1) return p.board[idx(s, to)] * s <= -2 ? -1 : to;
    // Bearing off: everything home, and an overshoot only from the rearmost checker.
    if (rearmost(p, s) > 6) return -1;
    if (to < 0 && rearmost(p, s) > from) return -1;
    return OFF;
  }

  // Plays a single checker move on p in place; returns whether it hit.
  function applyStep(p, s, from, to) {
    if (from === BAR) p.bar[s]--;
    else p.board[idx(s, from)] -= s;
    if (to === OFF) { p.off[s]++; return false; }
    const i = idx(s, to);
    const hit = p.board[i] === -s;
    if (hit) { p.board[i] = 0; p.bar[-s]++; }
    p.board[i] += s;
    return hit;
  }

  function stepsFor(p, s, d) {
    const out = [];
    const froms = p.bar[s] ? [BAR] : [];
    if (!p.bar[s]) for (let r = 24; r >= 1; r--) if (countAt(p, s, r)) froms.push(r);
    for (const from of froms) {
      const to = target(p, s, from, d);
      if (to >= 0) out.push({ from, to, die: d });
    }
    return out;
  }

  // Every legal way to play the dice, as lists of steps. Sequences reaching
  // the same position by different orders are all kept, so the UI can accept
  // the moves in whatever order the player makes them.
  function legalTurns(p, s, dice) {
    const all = [];
    const walk = (pos, left, seq) => {
      let extended = false;
      const tried = new Set();
      for (let k = 0; k < left.length; k++) {
        const d = left[k];
        if (tried.has(d)) continue;
        tried.add(d);
        const rest = left.slice(0, k).concat(left.slice(k + 1));
        for (const st of stepsFor(pos, s, d)) {
          extended = true;
          const next = clonePos(pos);
          const hit = applyStep(next, s, st.from, st.to);
          walk(next, rest, seq.concat({ ...st, hit }));
        }
      }
      if (!extended) all.push(seq);
    };
    walk(p, diceFaces(dice), []);
    const most = Math.max(...all.map((t) => t.length));
    if (most === 0) return [];
    let turns = all.filter((t) => t.length === most);
    if (most === 1 && dice[0] !== dice[1]) {
      const high = Math.max(dice[0], dice[1]);
      const withHigh = turns.filter((t) => t[0].die === high);
      if (withHigh.length) turns = withHigh;
    }
    return turns;
  }

  function resultOf(p, winner) {
    const loser = -winner;
    if (p.off[loser]) return { kind: "single", points: 1 };
    // Backgammon: the loser still has a checker on the bar or in the winner's home board.
    const stuck = p.bar[loser] || [19, 20, 21, 22, 23, 24].some((r) => countAt(p, loser, r));
    return stuck ? { kind: "backgammon", points: 3 } : { kind: "gammon", points: 2 };
  }

  // ------------------------------------------------------------ game state

  const die = (rng) => 1 + Math.floor(rng() * 6);

  // A game starts with each side rolling one die; the higher one moves first with both.
  function createGame(rng) {
    const rand = rng || Math.random;
    let a, b;
    let tries = 0;
    do {
      // A broken rng (one that only ever ties) would otherwise spin forever.
      if (++tries > 1000) throw new Error("the opening roll keeps tying: bad rng");
      a = die(rand); b = die(rand);
    } while (a === b);
    const state = {
      ...startPosition(),
      turn: a > b ? WHITE : BLACK,
      dice: null, turns: [], done: [], start: null,
      phase: "roll", winner: null, result: null, gameOver: false, lastTurn: null,
    };
    beginTurn(state, [a, b]);
    return state;
  }

  const posOf = (state) => ({ board: state.board, bar: state.bar, off: state.off });

  function beginTurn(state, dice) {
    state.dice = dice;
    state.turns = legalTurns(posOf(state), state.turn, dice);
    state.done = [];
    state.start = clonePos(posOf(state));
    state.phase = "move";
  }

  function roll(state, rng) {
    if (state.phase !== "roll") throw new Error("not the time to roll");
    const rand = rng || Math.random;
    beginTurn(state, [die(rand), die(rand)]);
    return state.dice;
  }

  const sameStep = (a, b) => a.from === b.from && a.to === b.to;
  // The dice as moves: doubles count four times.
  const diceFaces = (dice) => (dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice());
  // The legal turns that start with the moves already made this turn.
  const following = (state) => state.turns.filter((t) => state.done.every((st, k) => sameStep(t[k], st)));

  // The single checker moves that can be played next.
  function nextSteps(state) {
    if (state.phase !== "move") return [];
    const seen = new Map();
    for (const t of following(state)) {
      const st = t[state.done.length];
      if (st && !seen.has(st.from + ">" + st.to)) seen.set(st.from + ">" + st.to, { from: st.from, to: st.to, die: st.die });
    }
    return [...seen.values()];
  }

  // Dice not yet used this turn.
  function diceLeft(state) {
    if (!state.dice) return [];
    const left = diceFaces(state.dice);
    for (const st of state.done) left.splice(left.indexOf(st.die), 1);
    return left;
  }

  function move(state, from, to) {
    if (state.phase !== "move") throw new Error("not the time to move");
    const t = following(state).find((x) => x[state.done.length] && sameStep(x[state.done.length], { from, to }));
    if (!t) throw new Error("illegal move");
    const st = t[state.done.length];
    const hit = applyStep(state, state.turn, from, to);
    state.done.push({ from, to, die: st.die, hit });
    if (state.off[state.turn] === CHECKERS) finish(state);
    return state.done[state.done.length - 1];
  }

  // Takes back the last checker move of the turn in progress.
  function undoStep(state) {
    if (state.phase !== "move" || !state.done.length) return false;
    const done = state.done.slice(0, -1);
    Object.assign(state, clonePos(state.start));
    state.done = [];
    for (const st of done) state.done.push({ ...st, hit: applyStep(state, state.turn, st.from, st.to) });
    return true;
  }

  // The turn is complete: every die that can be used has been, or none can.
  const turnComplete = (state) => state.phase === "move" && (!state.turns.length || state.done.length === state.turns[0].length);

  function endTurn(state) {
    if (!turnComplete(state)) throw new Error("the turn isn't finished");
    state.lastTurn = { player: state.turn, dice: state.dice, moves: state.done };
    state.turn = other(state.turn);
    state.dice = null;
    state.turns = [];
    state.done = [];
    state.phase = "roll";
  }

  function finish(state) {
    state.lastTurn = { player: state.turn, dice: state.dice, moves: state.done };
    state.winner = state.turn;
    state.result = resultOf(posOf(state), state.turn);
    state.gameOver = true;
    state.phase = "over";
  }

  // --------------------------------------------------------------------- AI

  // Rolls that hit a blot from a shooter `dist` pips away, as a 36-bit set
  // over (a,b). Blocked intermediate points are ignored: a slight overestimate.
  const ROLLS36 = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) ROLLS36.push([a, b]);
  const reach = ROLLS36.map(([a, b]) => (a === b ? [a, 2 * a, 3 * a, 4 * a] : [a, b, a + b]));

  // Probability (0..1) that side s's blot on relative point r is hit next roll.
  function hitChance(p, s, r) {
    const o = -s;
    const ro = 25 - r; // the blot's point in the shooter's terms
    const dists = [];
    if (p.bar[o]) dists.push(BAR - ro);
    for (let q = ro + 1; q <= 24; q++) if (countAt(p, o, q)) dists.push(q - ro);
    if (!dists.length) return 0;
    // A blot can only be hit by checkers the bar doesn't hold back.
    const shooters = p.bar[o] ? dists.filter((d) => d === BAR - ro) : dists;
    let n = 0;
    for (const hits of reach) if (hits.some((h) => shooters.includes(h))) n++;
    return n / 36;
  }

  const POINT_VALUE = [0, 2, 3, 4, 6, 7, 7, 5, 3, 1.5, 1.5, 1.5, 1.5, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3];

  function structure(p, s) {
    let v = 0;
    let run = 0;
    let bestRun = 0;
    for (let r = 1; r <= 24; r++) {
      const made = countAt(p, s, r) >= 2;
      if (made) v += POINT_VALUE[r];
      run = made && r <= 12 ? run + 1 : 0;
      if (run > bestRun) bestRun = run;
    }
    if (bestRun >= 3) v += (bestRun - 2) * 4;
    return v;
  }

  const homePoints = (p, s) => [1, 2, 3, 4, 5, 6].filter((r) => countAt(p, s, r) >= 2).length;
  const contact = (p) => rearmost(p, WHITE) + rearmost(p, BLACK) > 25;

  // Side s's view of p, with the other side to roll next.
  function evaluate(p, s) {
    const o = -s;
    if (p.off[s] === CHECKERS) return 1000;
    const race = pips(p, o) - pips(p, s);
    if (!contact(p)) {
      // Pure race: pips, less a little for checkers piled deep in the home board.
      let waste = 0;
      for (let r = 1; r <= 6; r++) waste += Math.max(0, countAt(p, s, r) - 3) * (7 - r) * 0.05;
      return race - waste;
    }
    let score = race + structure(p, s) - 0.9 * structure(p, o);
    score -= p.bar[s] * (2 + 3 * homePoints(p, o));
    score += p.bar[o] * (2 + 3 * homePoints(p, s));
    for (let r = 1; r <= 24; r++) {
      if (countAt(p, s, r) === 1) score -= hitChance(p, s, r) * (25 - r + 10);
      if (countAt(p, o, r) === 1) score += 0.15 * (25 - r);
    }
    return score;
  }

  const LEVELS = {
    easy: { plies: 1, randomTurnChance: 0.4 },
    medium: { plies: 1, randomTurnChance: 0 },
    hard: { plies: 2, randomTurnChance: 0, candidates: 6 },
  };

  // The distinct end positions of a roll, each with one turn that reaches it.
  function outcomes(p, s, dice) {
    const seen = new Map();
    for (const t of legalTurns(p, s, dice)) {
      const q = clonePos(p);
      for (const st of t) applyStep(q, s, st.from, st.to);
      const k = posKey(q);
      if (!seen.has(k)) seen.set(k, { turn: t, pos: q });
    }
    return [...seen.values()];
  }

  const ROLLS21 = [];
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS21.push({ dice: [a, b], weight: a === b ? 1 : 2 });

  // s's view after the other side's best reply, averaged over its 21 rolls.
  // A roll it can't use leaves the position standing, with s to roll again.
  function lookahead(p, s) {
    const o = -s;
    if (p.off[s] === CHECKERS) return 1000;
    let total = 0;
    for (const { dice, weight } of ROLLS21) {
      const replies = outcomes(p, o, dice);
      let value;
      if (!replies.length) value = -evaluate(p, o);
      else value = -Math.max(...replies.map((r) => evaluate(r.pos, o)));
      total += weight * value;
    }
    return total / 36;
  }

  // The turn the AI plays for the state's current dice (an empty list if it can't move).
  function chooseTurn(state, level, rng) {
    const rand = rng || Math.random;
    const cfg = LEVELS[level] || LEVELS.medium;
    const s = state.turn;
    const options = outcomes(state.start || posOf(state), s, state.dice);
    if (!options.length) return [];
    if (rand() < cfg.randomTurnChance) return options[Math.floor(rand() * options.length)].turn;
    options.forEach((o) => { o.score = evaluate(o.pos, s); });
    let pool = options;
    if (cfg.plies > 1 && options.length > 1) {
      pool = options.slice().sort((a, b) => b.score - a.score).slice(0, cfg.candidates);
      pool.forEach((o) => { o.score = lookahead(o.pos, s); });
    }
    const top = Math.max(...pool.map((o) => o.score));
    const best = pool.filter((o) => o.score >= top - 1e-9);
    return best[Math.floor(rand() * best.length)].turn;
  }

  const api = {
    WHITE, BLACK, CHECKERS, BAR, OFF, LEVELS,
    idx, rel, startPosition, clonePos, countAt, pips, rearmost, target, applyStep, legalTurns, resultOf,
    createGame, roll, diceFaces, following, nextSteps, diceLeft, move, undoStep, turnComplete, endTurn,
    hitChance, evaluate, contact, chooseTurn,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BACKGAMMON = api;
})(typeof window !== "undefined" ? window : globalThis);
