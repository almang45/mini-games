// Word Grid rules, scoring and AI, no DOM. Two players, a 15x15 board, 100
// tiles, racks of 7. Lay tiles in one row or column to make words that join
// what's on the board (the first word covers the centre). Every word formed
// must be in the lexicon. Using all seven tiles at once scores 50 extra.
//
// The tile values and counts are the long-standing English ones. The premium
// square layout is this game's own: symmetric like the classic board, but a
// different pattern.
(function (root) {
  "use strict";

  const SIZE = 15;
  const CENTRE = 7;
  const RACK = 7;
  const BINGO = 50;
  const A = 65;
  const BLANK = "?";

  // letter: [count, value]
  const TILES = {
    A: [9, 1], B: [2, 3], C: [2, 3], D: [4, 2], E: [12, 1], F: [2, 4], G: [3, 2], H: [2, 4], I: [9, 1],
    J: [1, 8], K: [1, 5], L: [4, 1], M: [2, 3], N: [6, 1], O: [8, 1], P: [2, 3], Q: [1, 10], R: [6, 1],
    S: [4, 1], T: [6, 1], U: [4, 1], V: [2, 4], W: [2, 4], X: [1, 8], Y: [2, 4], Z: [1, 10], "?": [2, 0],
  };
  const value = (letter) => TILES[letter][1];

  // One eighth of the board, row r and column c with r <= c <= 7; the rest is
  // mirrored. T triple word, D double word, t triple letter, d double letter.
  const OCTANT = [
    "T...t..D",
    "D....d.",
    "D..d..",
    "t...d",
    "D...",
    "t..",
    "d.",
    "D",
  ];
  function premium(r, c) {
    let a = Math.min(r, SIZE - 1 - r);
    let b = Math.min(c, SIZE - 1 - c);
    if (a > b) [a, b] = [b, a];
    const ch = OCTANT[a][b - a];
    return ch === "." ? null : ch;
  }

  let nextTileId = 0;
  function tile(letter) { return { letter, id: "t" + nextTileId++ }; }

  function buildBag() {
    const bag = [];
    Object.keys(TILES).forEach((l) => { for (let k = 0; k < TILES[l][0]; k++) bag.push(tile(l)); });
    return bag;
  }

  function shuffle(list, rng) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const emptyBoard = () => Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  const say = (state, text) => state.log.push(text);

  function createGame(types, opts) {
    if (types.length !== 2) throw new Error("Word Grid is a two-player game");
    if (!opts || !opts.lexicon) throw new Error("a lexicon is required");
    const rng = opts.rng || Math.random;
    const state = {
      seats: types.map((type, i) => ({ type, name: (opts.names && opts.names[i]) || "Player " + (i + 1), score: 0 })),
      lexicon: opts.lexicon,
      rng,
      board: emptyBoard(),
      bag: opts.bag ? opts.bag.slice() : shuffle(buildBag(), rng),
      racks: types.map(() => []),
      turn: 0,
      scoreless: 0,
      lastMove: null,
      gameOver: false,
      winner: null,
      log: [],
    };
    state.racks.forEach((rack) => refill(state, rack));
    return state;
  }

  function refill(state, rack) {
    while (rack.length < RACK && state.bag.length) rack.push(state.bag.pop());
  }

  const boardIsEmpty = (board) => board.every((row) => row.every((sq) => !sq));

  // ---------------------------------------------------------------- scoring

  // A placement: { row, col, tileId, letter, blank }. `letter` is what the
  // tile stands for (a blank's chosen letter); blanks score 0.
  //
  // Reads the word through (r, c) in direction (dr, dc), counting both the
  // board and the new placements. Returns { word, score, cells } or null for
  // a single letter.
  function wordThrough(board, placed, r, c, dr, dc) {
    const at = (rr, cc) => placed.get(rr * SIZE + cc) || board[rr][cc];
    while (inside(r - dr, c - dc) && at(r - dr, c - dc)) { r -= dr; c -= dc; }
    let word = "";
    let sum = 0;
    let mult = 1;
    let rr = r, cc = c;
    while (inside(rr, cc) && at(rr, cc)) {
      const sq = at(rr, cc);
      const fresh = placed.has(rr * SIZE + cc);
      const prem = fresh ? premium(rr, cc) : null;
      const v = sq.blank ? 0 : value(sq.letter);
      word += sq.letter;
      sum += v * (prem === "d" ? 2 : prem === "t" ? 3 : 1);
      if (prem === "D") mult *= 2;
      if (prem === "T") mult *= 3;
      rr += dr; cc += dc;
    }
    return word.length < 2 ? null : { word, score: sum * mult, row: r, col: c, dr, dc };
  }

  // Checks a set of placements and scores it. Returns { ok: true, words,
  // score } or { ok: false, error }.
  function evaluate(state, seat, placements) {
    const board = state.board;
    if (!placements.length) return { ok: false, error: "Place at least one tile." };
    const rack = state.racks[seat].slice();
    const placed = new Map();
    for (const p of placements) {
      if (!inside(p.row, p.col)) return { ok: false, error: "That square is off the board." };
      if (board[p.row][p.col]) return { ok: false, error: "That square is taken." };
      if (placed.has(p.row * SIZE + p.col)) return { ok: false, error: "Two tiles on one square." };
      const i = rack.findIndex((t) => t.id === p.tileId);
      if (i === -1) return { ok: false, error: "That tile isn't on your rack." };
      const t = rack.splice(i, 1)[0];
      const blank = t.letter === BLANK;
      if (!/^[A-Z]$/.test(p.letter) || (!blank && p.letter !== t.letter)) return { ok: false, error: "A tile can only be its own letter." };
      placed.set(p.row * SIZE + p.col, { letter: p.letter, blank });
    }
    const rows = new Set(placements.map((p) => p.row));
    const cols = new Set(placements.map((p) => p.col));
    if (rows.size > 1 && cols.size > 1) return { ok: false, error: "Tiles must be in one row or one column." };
    // One tile reads along whichever direction makes a word.
    let across = rows.size === 1 && (cols.size > 1 || placements.length === 1);
    if (placements.length === 1) {
      const p = placements[0];
      const left = inside(p.row, p.col - 1) && board[p.row][p.col - 1];
      const right = inside(p.row, p.col + 1) && board[p.row][p.col + 1];
      across = !!(left || right);
    }
    const [dr, dc] = across ? [0, 1] : [1, 0];
    // No gaps: every square between the first and last tile is filled.
    const line = placements.map((p) => (across ? p.col : p.row));
    const fixed = across ? placements[0].row : placements[0].col;
    for (let k = Math.min(...line); k <= Math.max(...line); k++) {
      const r = across ? fixed : k, c = across ? k : fixed;
      if (!placed.has(r * SIZE + c) && !board[r][c]) return { ok: false, error: "Tiles must make one unbroken line." };
    }
    const first = boardIsEmpty(board);
    if (first) {
      if (!placed.has(CENTRE * SIZE + CENTRE)) return { ok: false, error: "The first word must cover the centre square." };
      if (placements.length < 2) return { ok: false, error: "The first word needs at least two letters." };
    } else {
      const touches = placements.some((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) =>
        inside(p.row + a, p.col + b) && board[p.row + a][p.col + b]));
      if (!touches) return { ok: false, error: "The word must join tiles already on the board." };
    }
    const words = [];
    const main = wordThrough(board, placed, placements[0].row, placements[0].col, dr, dc);
    if (main) words.push(main);
    placements.forEach((p) => {
      const cross = wordThrough(board, placed, p.row, p.col, dc, dr);
      if (cross) words.push(cross);
    });
    if (!words.length) return { ok: false, error: "That doesn't make a word." };
    const bad = words.filter((w) => !state.lexicon.isWord(w.word));
    if (bad.length) return { ok: false, error: bad.map((w) => w.word).join(", ") + (bad.length > 1 ? " aren't" : " isn't") + " in the word list." };
    const score = words.reduce((s, w) => s + w.score, 0) + (placements.length === RACK ? BINGO : 0);
    return { ok: true, words, score };
  }

  // ----------------------------------------------------------------- turns

  function requireTurn(state, seat) {
    if (state.gameOver) throw new Error("the game is over");
    if (state.turn !== seat) throw new Error("not your turn");
  }

  function nextTurn(state) {
    state.turn = 1 - state.turn;
    // Both players passing or exchanging twice in a row ends the game.
    if (state.scoreless >= 4) finish(state, null);
  }

  function play(state, seat, placements) {
    requireTurn(state, seat);
    const result = evaluate(state, seat, placements);
    if (!result.ok) throw new Error(result.error);
    const rack = state.racks[seat];
    placements.forEach((p) => {
      const t = rack.splice(rack.findIndex((x) => x.id === p.tileId), 1)[0];
      state.board[p.row][p.col] = { letter: p.letter, blank: t.letter === BLANK, id: t.id };
    });
    state.seats[seat].score += result.score;
    state.scoreless = 0;
    state.lastMove = { seat, type: "play", cells: placements.map((p) => [p.row, p.col]), words: result.words.map((w) => w.word), score: result.score };
    say(state, state.seats[seat].name + " plays " + result.words.map((w) => w.word).join(", ") + " for " + result.score +
      (placements.length === RACK ? " (all seven tiles: +" + BINGO + ")" : "") + ".");
    refill(state, rack);
    if (rack.length === 0 && state.bag.length === 0) return finish(state, seat);
    nextTurn(state);
    return result;
  }

  function exchange(state, seat, tileIds) {
    requireTurn(state, seat);
    if (state.bag.length < RACK) throw new Error("exchanging needs at least " + RACK + " tiles in the bag");
    if (!tileIds.length) throw new Error("pick tiles to exchange");
    const rack = state.racks[seat];
    const out = tileIds.map((id) => {
      const i = rack.findIndex((t) => t.id === id);
      if (i === -1) throw new Error("that tile isn't on your rack");
      return rack.splice(i, 1)[0];
    });
    refill(state, rack);
    state.bag = shuffle(state.bag.concat(out), state.rng);
    state.scoreless += 1;
    state.lastMove = { seat, type: "exchange", count: out.length };
    say(state, state.seats[seat].name + " exchanges " + out.length + " tile" + (out.length > 1 ? "s" : "") + ".");
    nextTurn(state);
  }

  function pass(state, seat) {
    requireTurn(state, seat);
    state.scoreless += 1;
    state.lastMove = { seat, type: "pass" };
    say(state, state.seats[seat].name + " passes.");
    nextTurn(state);
  }

  const rackValue = (rack) => rack.reduce((s, t) => s + value(t.letter), 0);

  // Each player loses what's left on their rack; a player who went out also
  // gains the opponent's.
  function finish(state, goneOut) {
    state.racks.forEach((rack, i) => {
      const left = rackValue(rack);
      state.seats[i].score -= left;
      if (goneOut !== null && i !== goneOut) state.seats[goneOut].score += left;
    });
    state.gameOver = true;
    const [a, b] = state.seats.map((s) => s.score);
    state.winner = a === b ? null : a > b ? 0 : 1;
    say(state, (goneOut !== null ? state.seats[goneOut].name + " goes out. " : "Both players passed twice. ") +
      (state.winner === null ? "It's a draw." : state.seats[state.winner].name + " wins."));
  }

  // -------------------------------------------------------- move generation
  //
  // Appel & Jacobson's method, run across the board and across its
  // transpose. For every empty square next to a tile (an anchor), build each
  // word that covers it: a left part from the rack (or the tiles already left
  // of it), then extend right through board tiles and rack tiles while the
  // trie still has a path. Cross-checks limit each square to the letters that
  // make a valid word with the tiles above and below it.

  const ALL = (1 << 26) - 1;

  function generateMoves(state, seat) {
    const lex = state.lexicon;
    const rackTiles = state.racks[seat];
    const counts = new Array(27).fill(0);
    rackTiles.forEach((t) => { counts[t.letter === BLANK ? 26 : t.letter.charCodeAt(0) - A] += 1; });
    const moves = [];
    const seen = new Set();
    const first = boardIsEmpty(state.board);

    for (const across of [true, false]) {
      // Read the board in this direction as rows of letters.
      const sq = (r, c) => (across ? state.board[r][c] : state.board[c][r]);
      const toBoard = (r, c) => (across ? [r, c] : [c, r]);

      // Letters allowed on each empty square by the perpendicular word.
      const checks = [];
      for (let r = 0; r < SIZE; r++) {
        checks.push([]);
        for (let c = 0; c < SIZE; c++) {
          if (sq(r, c)) { checks[r].push(0); continue; }
          const above = r > 0 && sq(r - 1, c);
          const below = r < SIZE - 1 && sq(r + 1, c);
          if (!above && !below) { checks[r].push(ALL); continue; }
          let top = r;
          while (top > 0 && sq(top - 1, c)) top--;
          let prefix = "";
          for (let k = top; k < r; k++) prefix += sq(k, c).letter;
          let suffix = "";
          for (let k = r + 1; k < SIZE && sq(k, c); k++) suffix += sq(k, c).letter;
          const node = lex.walk(prefix);
          let mask = 0;
          if (node !== -1) {
            lex.eachChild(node, (l, ch) => {
              const end = lex.walk(suffix, ch);
              if (end !== -1 && lex.isTerminal(end)) mask |= 1 << l;
            });
          }
          checks[r].push(mask);
        }
      }

      const isAnchor = (r, c) => {
        if (sq(r, c)) return false;
        if (first) return r === CENTRE && c === CENTRE;
        return (r > 0 && sq(r - 1, c)) || (r < SIZE - 1 && sq(r + 1, c)) || (c > 0 && sq(r, c - 1)) || (c < SIZE - 1 && sq(r, c + 1));
      };

      for (let r = 0; r < SIZE; r++) {
        const placed = []; // [col, letterIndex, blank]

        const record = () => {
          if (!placed.length) return;
          const placements = placed.map(([c, l, blank]) => {
            const [br, bc] = toBoard(r, c);
            return { row: br, col: bc, letter: String.fromCharCode(A + l), blank };
          });
          const key = placements.map((p) => p.row + "," + p.col + p.letter + (p.blank ? "?" : "")).sort().join("|");
          if (seen.has(key)) return;
          seen.add(key);
          moves.push({ placements });
        };

        const extendRight = (c, node, anchor) => {
          if (c >= SIZE || !sq(r, c)) {
            if (c > anchor && lex.isTerminal(node)) record();
            if (c >= SIZE) return;
            const mask = checks[r][c];
            lex.eachChild(node, (l, ch) => {
              if (!(mask & (1 << l))) return;
              if (counts[l] > 0) {
                counts[l]--; placed.push([c, l, false]);
                extendRight(c + 1, ch, anchor);
                placed.pop(); counts[l]++;
              }
              if (counts[26] > 0) {
                counts[26]--; placed.push([c, l, true]);
                extendRight(c + 1, ch, anchor);
                placed.pop(); counts[26]++;
              }
            });
          } else {
            const ch = lex.child(node, sq(r, c).letter.charCodeAt(0) - A);
            if (ch !== -1) extendRight(c + 1, ch, anchor);
          }
        };

        // Left part: a prefix from the rack laid into the free squares just
        // before the anchor. The trie reads it left to right, so each new
        // letter goes on the end and the whole prefix shifts one square left.
        const leftPart = (node, anchor, limit) => {
          extendRight(anchor, node, anchor);
          if (limit === 0) return;
          const reflow = () => { for (let k = 0; k < placed.length; k++) placed[k][0] = anchor - placed.length + k; };
          lex.eachChild(node, (l, ch) => {
            const tryWith = (isBlank) => {
              placed.push([0, l, isBlank]);
              reflow();
              leftPart(ch, anchor, limit - 1);
              placed.pop();
              reflow();
            };
            if (counts[l] > 0) { counts[l]--; tryWith(false); counts[l]++; }
            if (counts[26] > 0) { counts[26]--; tryWith(true); counts[26]++; }
          });
        };

        for (let c = 0; c < SIZE; c++) {
          if (!isAnchor(r, c)) continue;
          if (c > 0 && sq(r, c - 1)) {
            // Tiles already to the left are the start of the word.
            let start = c;
            while (start > 0 && sq(r, start - 1)) start--;
            let text = "";
            for (let k = start; k < c; k++) text += sq(r, k).letter;
            const node = lex.walk(text);
            if (node !== -1) extendRight(c, node, c);
          } else {
            // Free squares to the left that aren't anchors themselves.
            let limit = 0;
            while (c - limit - 1 >= 0 && !sq(r, c - limit - 1) && !isAnchor(r, c - limit - 1)) limit++;
            leftPart(0, c, limit);
          }
        }
      }
    }

    // Score each candidate with the same rules a player's move goes through.
    const rackLeft = rackTiles.slice();
    const out = [];
    for (const m of moves) {
      const pool = rackLeft.slice();
      const placements = m.placements.map((p) => {
        const i = pool.findIndex((t) => (p.blank ? t.letter === BLANK : t.letter === p.letter));
        const t = pool.splice(i, 1)[0];
        return { row: p.row, col: p.col, tileId: t.id, letter: p.letter, blank: p.blank };
      });
      const result = evaluate(state, seat, placements);
      if (result.ok) out.push({ placements, score: result.score, words: result.words.map((w) => w.word) });
    }
    return out;
  }

  // ------------------------------------------------------------------- AI

  // What the tiles kept on the rack are worth for the next turn: a blank or
  // an S is good, duplicates and a Q without a U are bad, and a balance of
  // vowels and consonants helps.
  function leaveValue(rack) {
    const letters = rack.map((t) => t.letter);
    let v = 0;
    const count = {};
    letters.forEach((l) => { count[l] = (count[l] || 0) + 1; });
    if (count["?"]) v += 12 * count["?"];
    if (count.S) v += 4 + 2 * (count.S - 1);
    Object.keys(count).forEach((l) => { if (l !== "?" && count[l] > 1) v -= 3 * (count[l] - 1); });
    if (count.Q && !count.U) v -= 8;
    const vowels = letters.filter((l) => "AEIOU".includes(l)).length;
    const consonants = letters.length - vowels - (count["?"] || 0);
    v -= 2 * Math.abs(vowels - consonants);
    return v;
  }

  function leaveAfter(rack, placements) {
    const used = new Set(placements.map((p) => p.tileId));
    return rack.filter((t) => !used.has(t.id));
  }

  // Hard: best score plus the value of the tiles kept. Easy: a move from the
  // lower-scoring half, so it plays real words but leaves points on the board.
  function chooseMove(state, seat, level) {
    const moves = generateMoves(state, seat);
    if (!moves.length) return null;
    if (level === "easy") {
      moves.sort((a, b) => a.score - b.score);
      const half = moves.slice(0, Math.max(1, Math.ceil(moves.length / 2)));
      return half[Math.floor(state.rng() * half.length)];
    }
    const rack = state.racks[seat];
    const endgame = state.bag.length === 0;
    const rate = (m) => m.score + (endgame ? 0 : leaveValue(leaveAfter(rack, m.placements)));
    return moves.reduce((best, m) => (rate(m) > rate(best) ? m : best));
  }

  // Throws back the tiles that hurt the rack most.
  function chooseExchange(state, seat) {
    const rack = state.racks[seat];
    let keep = rack.slice();
    while (keep.length > 3) {
      const worst = keep.reduce((w, t) => (leaveValue(keep.filter((x) => x !== t)) > leaveValue(keep.filter((x) => x !== w)) ? t : w));
      if (leaveValue(keep.filter((x) => x !== worst)) <= leaveValue(keep)) break;
      keep = keep.filter((x) => x !== worst);
    }
    const out = rack.filter((t) => !keep.includes(t));
    return out.length ? out : [rack.reduce((a, b) => (value(b.letter) > value(a.letter) ? b : a))];
  }

  function stepAI(state, seat, level) {
    const move = chooseMove(state, seat, level);
    if (move) return play(state, seat, move.placements);
    if (state.bag.length >= RACK) return exchange(state, seat, chooseExchange(state, seat).map((t) => t.id));
    return pass(state, seat);
  }

  const api = {
    SIZE, CENTRE, RACK, BINGO, BLANK, TILES,
    value, premium, tile, buildBag, createGame, evaluate, play, exchange, pass, rackValue,
    generateMoves, leaveValue, chooseMove, chooseExchange, stepAI,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WORD_GRID = api;
})(typeof window !== "undefined" ? window : globalThis);
