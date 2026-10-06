// Dots and Boxes rules and AI, no DOM. A board of W x H boxes. Players take
// turns drawing a line between neighbouring dots; whoever draws the fourth
// side of a box claims it and must move again. Most boxes wins.
//
// Lines are numbered horizontals first: horizontal (r, c) for r in 0..H and
// c in 0..W-1 is r*W + c; vertical (r, c) for r in 0..H-1 and c in 0..W is
// (H+1)*W + r*(W+1) + c. Box (r, c) is r*W + c.
(function (root) {
  "use strict";

  const P1 = 1;
  const P2 = 2;
  const other = (p) => 3 - p;

  // ------------------------------------------------------------ geometry

  // Lines and boxes for a W x H board, computed once per size.
  const GEOMETRY = new Map();
  function geometry(w, h) {
    const key = w + "x" + h;
    if (GEOMETRY.has(key)) return GEOMETRY.get(key);
    const hCount = (h + 1) * w;
    const lineCount = hCount + h * (w + 1);
    const hLine = (r, c) => r * w + c;
    const vLine = (r, c) => hCount + r * (w + 1) + c;
    // Each box's four sides, and each line's one or two boxes.
    const sides = [];
    const lineBoxes = Array.from({ length: lineCount }, () => []);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const b = r * w + c;
        const s = [hLine(r, c), hLine(r + 1, c), vLine(r, c), vLine(r, c + 1)];
        sides.push(s);
        s.forEach((l) => lineBoxes[l].push(b));
      }
    }
    const info = (l) => (l < hCount
      ? { dir: "h", r: Math.floor(l / w), c: l % w }
      : { dir: "v", r: Math.floor((l - hCount) / (w + 1)), c: (l - hCount) % (w + 1) });
    const g = { w, h, lineCount, boxCount: w * h, sides, lineBoxes, info, hLine, vLine };
    GEOMETRY.set(key, g);
    return g;
  }

  function createGame(w, h) {
    if (!(w >= 1 && h >= 1 && w <= 12 && h <= 12)) throw new Error("board size out of range");
    const g = geometry(w, h);
    return {
      w, h,
      lines: new Array(g.lineCount).fill(0), // 0 undrawn, else the player who drew it
      boxes: new Array(g.boxCount).fill(0),  // 0 open, else the owner
      turn: P1,
      score: { [P1]: 0, [P2]: 0 },
      lastLine: null,
      gameOver: false,
      winner: null,
      history: [],
    };
  }

  const undrawnSides = (g, lines, b) => g.sides[b].reduce((n, l) => n + (lines[l] ? 0 : 1), 0);

  // Draws line l for the side to move. Returns how many boxes it completed.
  function play(state, l) {
    if (state.gameOver) throw new Error("the game is over");
    const g = geometry(state.w, state.h);
    if (!(l >= 0 && l < g.lineCount) || state.lines[l]) throw new Error("illegal move");
    state.history.push({ line: l, turn: state.turn, lastLine: state.lastLine });
    state.lines[l] = state.turn;
    let made = 0;
    for (const b of g.lineBoxes[l]) {
      if (undrawnSides(g, state.lines, b) === 0) {
        state.boxes[b] = state.turn;
        made++;
      }
    }
    state.score[state.turn] += made;
    state.lastLine = l;
    if (!made) state.turn = other(state.turn);
    if (state.lines.every((x) => x)) {
      state.gameOver = true;
      const a = state.score[P1], b = state.score[P2];
      state.winner = a === b ? null : a > b ? P1 : P2;
    }
    return made;
  }

  function undo(state) {
    const last = state.history.pop();
    if (!last) return false;
    const g = geometry(state.w, state.h);
    for (const b of g.lineBoxes[last.line]) {
      if (state.boxes[b]) {
        state.score[state.boxes[b]]--;
        state.boxes[b] = 0;
      }
    }
    state.lines[last.line] = 0;
    state.turn = last.turn;
    state.lastLine = last.lastLine;
    state.gameOver = false;
    state.winner = null;
    return true;
  }

  // --------------------------------------------------------------- analysis

  const freeLines = (g, lines) => {
    const out = [];
    for (let l = 0; l < g.lineCount; l++) if (!lines[l]) out.push(l);
    return out;
  };

  // A line that completes a box.
  const captures = (g, lines, l) => g.lineBoxes[l].some((b) => undrawnSides(g, lines, b) === 1);
  // A line that leaves no box with three sides drawn (and takes none).
  const isSafe = (g, lines, l) => g.lineBoxes[l].every((b) => undrawnSides(g, lines, b) >= 3);

  // Chains and loops of the position: runs of boxes with exactly two undrawn
  // sides. A chain ends at the edge of the board or at a box with three or
  // more undrawn sides (a junction, treated as if it were the edge: a usual
  // simplification). Each comes with the line to draw to open it.
  function components(g, lines) {
    const seen = new Set();
    const out = [];
    const deg = (b) => undrawnSides(g, lines, b);
    // The box across undrawn line l from b, or -1 for the edge or a non-chain box.
    const across = (b, l) => {
      const n = g.lineBoxes[l].find((x) => x !== b);
      return n === undefined ? -1 : n;
    };
    for (let start = 0; start < g.boxCount; start++) {
      if (seen.has(start) || deg(start) !== 2) continue;
      const boxes = [start];
      const inner = [];
      seen.add(start);
      const ends = [];
      let loop = false;
      // Walk out of `start` through each of its two open sides.
      for (const first of g.sides[start].filter((l) => !lines[l])) {
        let b = start;
        let l = first;
        for (;;) {
          const n = across(b, l);
          if (n === start) { loop = true; inner.push(l); break; }
          if (n < 0 || deg(n) !== 2) { ends.push(l); break; }
          inner.push(l);
          if (seen.has(n)) break;
          seen.add(n);
          boxes.push(n);
          const next = g.sides[n].find((x) => !lines[x] && x !== l);
          b = n;
          l = next;
        }
        if (loop) break;
      }
      if (loop) out.push({ loop: true, size: boxes.length, open: inner[0], boxes });
      else {
        // A 2-chain is opened in the middle so the taker can't decline it.
        const open = boxes.length === 2 && inner.length ? inner[0] : ends[0];
        out.push({ loop: false, size: boxes.length, open, boxes });
      }
    }
    return out;
  }

  // Net boxes for the player who has to open one of these components next,
  // with both sides playing the chains well: the taker either takes all and
  // moves on, or takes all but two (four in a loop) and makes the opener
  // move again. A 2-chain opened in the middle can't be declined.
  const VALUE_MEMO = new Map();
  function chainValue(list) {
    if (!list.length) return 0;
    const key = list.map((c) => (c.loop ? "L" : "C") + c.size).sort().join(",");
    if (VALUE_MEMO.has(key)) return VALUE_MEMO.get(key);
    let best = -Infinity;
    const tried = new Set();
    list.forEach((c, i) => {
      const k = (c.loop ? "L" : "C") + c.size;
      if (tried.has(k)) return;
      tried.add(k);
      const rest = chainValue(list.slice(0, i).concat(list.slice(i + 1)));
      const k2 = c.size;
      const takeAll = k2 + rest;
      const decline = c.loop ? (k2 >= 4 ? k2 - 8 - rest : -Infinity) : k2 >= 3 ? k2 - 4 - rest : -Infinity;
      const mine = -Math.max(takeAll, decline);
      if (mine > best) best = mine;
    });
    VALUE_MEMO.set(key, best);
    return best;
  }

  // --------------------------------------------------------------------- AI

  const LEVELS = {
    easy: { randomMoveChance: 0.5, chains: false, search: 0 },
    medium: { randomMoveChance: 0, chains: false, search: 0 },
    hard: { randomMoveChance: 0, chains: true, search: 14 },
  };

  const pickRandom = (arr, rand) => arr[Math.floor(rand() * arr.length)];

  // The best line to give away when every line gives something: by the
  // chain values, or (without them) just the smallest component.
  function bestOpening(g, lines, useValues) {
    const comps = components(g, lines);
    if (!comps.length) return null;
    if (!useValues) return comps.slice().sort((a, b) => a.size - b.size || Number(a.loop) - Number(b.loop))[0].open;
    let best = null;
    let bestScore = -Infinity;
    comps.forEach((c, i) => {
      const rest = chainValue(comps.slice(0, i).concat(comps.slice(i + 1)));
      const decline = c.loop ? (c.size >= 4 ? c.size - 8 - rest : -Infinity) : c.size >= 3 ? c.size - 4 - rest : -Infinity;
      const mine = -Math.max(c.size + rest, decline);
      if (mine > bestScore) { bestScore = mine; best = c.open; }
    });
    return best;
  }

  // When line l takes box A into B, the chain's last box, B's far side: the
  // line that hands both boxes over instead (the double-cross). Else -1.
  function farSideOfLastTwo(g, lines, l) {
    const boxes = g.lineBoxes[l];
    const a = boxes.find((b) => undrawnSides(g, lines, b) === 1);
    const b = boxes.find((x) => x !== a);
    if (a === undefined || b === undefined || undrawnSides(g, lines, b) !== 2) return -1;
    const far = g.sides[b].find((x) => !lines[x] && x !== l);
    // B ends the chain: past it is the edge or a box that isn't another link.
    const beyond = g.lineBoxes[far].find((x) => x !== b);
    if (beyond !== undefined && undrawnSides(g, lines, beyond) === 2) return -1;
    return far;
  }

  // When line l takes into an opened loop that is down to four boxes (a run
  // with a takeable box at each end), the middle line: drawing it hands all
  // four over as two pairs. Returns { middle, lines } or null.
  function loopLastFour(g, lines, l) {
    const deg = (b) => undrawnSides(g, lines, b);
    const a = g.lineBoxes[l].find((b) => deg(b) === 1);
    if (a === undefined) return null;
    const path = [a];
    const between = [];
    let cur = a;
    let via = l;
    for (;;) {
      const n = g.lineBoxes[via].find((b) => b !== cur);
      if (n === undefined) return null;
      path.push(n);
      between.push(via);
      if (deg(n) === 1) break;
      if (deg(n) !== 2 || path.length > 4) return null;
      via = g.sides[n].find((x) => !lines[x] && x !== via);
      cur = n;
    }
    return path.length === 4 ? { middle: between[1], lines: between } : null;
  }

  // With only the last two boxes of a chain left to take, whether to hand
  // them over so the other player has to open the next chain. Returns that
  // line when declining is worth more, else null.
  function doubleDeal(g, lines) {
    const takeable = freeLines(g, lines).filter((l) => captures(g, lines, l));
    if (takeable.length === 2) return loopDeal(g, lines, takeable);
    if (takeable.length !== 1) return null;
    const l = takeable[0];
    const far = farSideOfLastTwo(g, lines, l);
    if (far < 0) return null;
    // What's left once both boxes are gone: only worth it if the rest is all chains.
    const after = lines.slice();
    after[l] = 1;
    after[far] = 1;
    if (freeLines(g, after).some((x) => isSafe(g, after, x) || captures(g, after, x))) return null;
    const rest = chainValue(components(g, after));
    // Take two and open the rest, or give two and have them open it.
    return -2 - rest > 2 + rest ? far : null;
  }

  // The loop version: keep control by handing over the last four boxes.
  function loopDeal(g, lines, takeable) {
    const four = loopLastFour(g, lines, takeable[0]);
    if (!four || !four.lines.includes(takeable[1])) return null;
    const after = lines.slice();
    four.lines.forEach((x) => { after[x] = 1; });
    if (freeLines(g, after).some((x) => isSafe(g, after, x) || captures(g, after, x))) return null;
    const rest = chainValue(components(g, after));
    // Take four and open the rest, or give four and have them open it.
    return -4 - rest > 4 + rest ? four.middle : null;
  }

  // Search over safe moves to win the fight for control: whoever runs out of
  // safe moves first has to open the chains. Values are boxes for the mover.
  function safeSearch(g, lines, memo, budget) {
    const key = lines.map((x) => (x ? 1 : 0)).join("");
    if (memo.has(key)) return memo.get(key);
    if (budget.nodes-- <= 0) throw new Error("budget");
    const safe = freeLines(g, lines).filter((l) => isSafe(g, lines, l));
    let v;
    if (!safe.length) v = chainValue(components(g, lines));
    else {
      v = -Infinity;
      for (const l of safe) {
        lines[l] = 1;
        const s = -safeSearch(g, lines, memo, budget);
        lines[l] = 0;
        if (s > v) v = s;
      }
    }
    memo.set(key, v);
    return v;
  }

  function chooseMove(state, level, rng) {
    const rand = rng || Math.random;
    const cfg = LEVELS[level] || LEVELS.medium;
    const g = geometry(state.w, state.h);
    const lines = state.lines;
    const free = freeLines(g, lines);
    if (!free.length) return null;

    const taking = free.filter((l) => captures(g, lines, l));
    if (cfg.chains) {
      const dd = doubleDeal(g, lines);
      if (dd != null) return dd;
    }
    if (taking.length) {
      // Keep the end of a chain, and the last four of a loop, for last, so
      // the double-cross is still on.
      const first = cfg.chains ? taking.filter((l) => farSideOfLastTwo(g, lines, l) < 0 && !loopLastFour(g, lines, l)) : [];
      return pickRandom(first.length ? first : taking, rand);
    }
    if (rand() < cfg.randomMoveChance) return pickRandom(free, rand);

    const safe = free.filter((l) => isSafe(g, lines, l));
    if (safe.length) {
      if (cfg.search && safe.length <= cfg.search) {
        try {
          const memo = new Map();
          const budget = { nodes: 200000 };
          const work = lines.map((x) => (x ? 1 : 0));
          let best = [];
          let bestV = -Infinity;
          for (const l of safe) {
            work[l] = 1;
            const v = -safeSearch(g, work, memo, budget);
            work[l] = 0;
            if (v > bestV) { bestV = v; best = [l]; } else if (v === bestV) best.push(l);
          }
          return pickRandom(best, rand);
        } catch (e) {
          if (e.message !== "budget") throw e;
          // Too many positions to search: fall through to a random safe move.
        }
      }
      return pickRandom(safe, rand);
    }
    const open = bestOpening(g, lines, cfg.chains);
    return open != null ? open : pickRandom(free, rand);
  }

  const api = {
    P1, P2, LEVELS, geometry, createGame, play, undo,
    captures, isSafe, components, chainValue, chooseMove,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DOTS_BOXES = api;
})(typeof window !== "undefined" ? window : globalThis);
