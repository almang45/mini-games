// Spider Solitaire rules engine: numbered deals in 1, 2 or 4 suits, run moves,
// dealing from the stock, completed suits, hints and undo.
// No DOM - <script> (global SPIDER) or require() in Node.
(function (root) {
  "use strict";

  const COLUMNS = 10;
  const MAX_DEAL = 1000000;
  const FULL_RUN = 13;
  // One suit letter per 13-card set; eight sets make the 104-card double deck.
  const SUIT_SETS = { 1: "SSSSSSSS", 2: "SSSSHHHH", 4: "SSHHDDCC" };
  const START_SCORE = 500;
  const SUIT_BONUS = 100;

  const isRed = (card) => card.suit === "H" || card.suit === "D";

  // mulberry32, so a deal number gives the same layout on every machine.
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildDeck(suits) {
    const deck = [];
    [...SUIT_SETS[suits]].forEach((suit, set) => {
      for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit, id: rank + suit + set, faceUp: false });
    });
    return deck;
  }

  function createGame(suits, number) {
    if (!SUIT_SETS[suits]) throw new Error("Suits must be 1, 2 or 4");
    if (!Number.isInteger(number) || number < 1 || number > MAX_DEAL) {
      throw new Error("Deal number must be a whole number from 1 to " + MAX_DEAL);
    }
    const deck = buildDeck(suits);
    const rand = makeRng(number * 10 + suits);
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const columns = Array.from({ length: COLUMNS }, (_, i) => deck.splice(0, i < 4 ? 6 : 5));
    columns.forEach(flipTop);
    return { suits, number, columns, stock: deck, completed: [], moves: 0, score: START_SCORE, history: [] };
  }

  // Cards are replaced rather than mutated when they turn face up, so a snapshot only copies arrays.
  function flipTop(col) {
    const last = col.length - 1;
    if (last >= 0 && !col[last].faceUp) col[last] = { ...col[last], faceUp: true };
  }

  function snapshot(state) {
    return {
      columns: state.columns.map((col) => col.slice()),
      stock: state.stock.slice(),
      completed: state.completed.slice(),
      moves: state.moves,
      score: state.score,
    };
  }

  // How many cards at the bottom of a column form a face-up, same-suit, descending run.
  function runLength(col) {
    if (!col.length || !col[col.length - 1].faceUp) return 0;
    let n = 1;
    while (n < col.length) {
      const upper = col[col.length - n - 1], lower = col[col.length - n];
      if (!upper.faceUp || upper.suit !== lower.suit || upper.rank !== lower.rank + 1) break;
      n++;
    }
    return n;
  }

  // Any suit may build on a card one rank higher, but only a same-suit run moves as a unit.
  function canMove(state, from, count, to) {
    const src = state.columns[from], dst = state.columns[to];
    if (!src || !dst || from === to || !Number.isInteger(count) || count < 1 || count > runLength(src)) return false;
    return dst.length === 0 || dst[dst.length - 1].rank === src[src.length - count].rank + 1;
  }

  // A King-to-Ace run of one suit leaves the table. Returns its suit, or null.
  function collectRun(state, index) {
    const col = state.columns[index];
    if (runLength(col) < FULL_RUN) return null;
    const run = col.splice(col.length - FULL_RUN);
    state.completed.push(run[0].suit);
    state.score += SUIT_BONUS;
    flipTop(col);
    return run[0].suit;
  }

  function move(state, from, count, to) {
    if (!canMove(state, from, count, to)) throw new Error("Illegal move");
    state.history.push(snapshot(state));
    state.columns[to].push(...state.columns[from].splice(-count));
    flipTop(state.columns[from]);
    state.moves++;
    state.score--;
    collectRun(state, to);
    return state;
  }

  const canDeal = (state) => state.stock.length > 0 && state.columns.every((col) => col.length > 0);

  // One face-up card onto every column. Classic rules refuse while any column is empty.
  function dealRow(state) {
    if (state.stock.length === 0) throw new Error("The stock is empty");
    if (!canDeal(state)) throw new Error("Fill every empty column before dealing");
    state.history.push(snapshot(state));
    state.columns.forEach((col) => col.push({ ...state.stock.pop(), faceUp: true }));
    state.moves++;
    state.score--;
    state.columns.forEach((_, index) => collectRun(state, index));
    return state;
  }

  function undo(state) {
    const prev = state.history.pop();
    if (!prev) return false;
    Object.assign(state, prev);
    return true;
  }

  const isWon = (state) => state.completed.length === SUIT_SETS[state.suits].length;
  const dealsLeft = (state) => state.stock.length / COLUMNS;

  // Moves worth making, best first, as {from, count, to, priority}. Same-suit builds
  // rank highest, then moves that uncover a card or empty a column. Moves that only
  // shift a run from one fitting card to another are left out, and so is moving a
  // whole column into an empty one.
  function hints(state) {
    const found = [];
    const firstEmpty = state.columns.findIndex((col) => col.length === 0);
    state.columns.forEach((src, from) => {
      const run = runLength(src);
      for (let count = 1; count <= run; count++) {
        const lead = src[src.length - count];
        const below = src[src.length - count - 1];
        const reveals = !!below && !below.faceUp;
        const alreadyBuilt = !!below && below.faceUp && below.rank === lead.rank + 1;
        state.columns.forEach((dst, to) => {
          if (dst.length === 0 || !canMove(state, from, count, to)) return;
          const sameSuit = dst[dst.length - 1].suit === lead.suit;
          if (alreadyBuilt && (below.suit === lead.suit || !sameSuit)) return;
          found.push({ from, count, to, priority: (sameSuit ? 8 : 0) + (reveals ? 4 : 0) + (below ? 0 : 2) + 1 });
        });
        if (firstEmpty >= 0 && count === run && below && !alreadyBuilt) found.push({ from, count, to: firstEmpty, priority: reveals ? 1 : 0 });
      }
    });
    return found.sort((a, b) => b.priority - a.priority);
  }

  // Double-click: the best hint for exactly these cards, or null.
  function quickMove(state, from, count) {
    const best = hints(state).find((h) => h.from === from && h.count === count) ||
      state.columns.map((_, to) => ({ from, count, to })).find((h) => canMove(state, h.from, h.count, h.to));
    if (!best) return null;
    move(state, best.from, best.count, best.to);
    return best.to;
  }

  const api = {
    COLUMNS, MAX_DEAL, FULL_RUN, SUIT_SETS, START_SCORE, SUIT_BONUS,
    isRed, buildDeck, createGame, runLength, canMove, move, canDeal, dealRow, undo, isWon, dealsLeft, hints, quickMove,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SPIDER = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
