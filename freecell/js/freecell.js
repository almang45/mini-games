// FreeCell rules engine: Microsoft-numbered deals, move validation with the
// free-cell/empty-column "supermove" limit, safe autoplay to the foundations,
// and undo. No DOM - <script> (global FREECELL) or require() in Node.
(function (root) {
  "use strict";

  const SUITS = "CDHS";
  const RANKS = "A23456789TJQK";
  const CELL_COUNT = 4;
  const CASCADE_COUNT = 8;
  const MAX_DEAL = 1000000;

  const isRed = (card) => card.suit === "D" || card.suit === "H";

  function makeCard(n) {
    const rank = Math.floor(n / 4) + 1;
    const suit = SUITS[n % 4];
    return { rank, suit, id: RANKS[rank - 1] + suit };
  }

  // Microsoft's generator, so "deal #11982" here is the same deal as in every other FreeCell.
  function deal(number) {
    let seed = number;
    const rand = () => {
      seed = (seed * 214013 + 2531011) & 0x7fffffff;
      return seed >> 16;
    };
    const deck = Array.from({ length: 52 }, (_, i) => 51 - i);
    for (let i = 0; i < 51; i++) {
      const j = 51 - (rand() % (52 - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const cascades = Array.from({ length: CASCADE_COUNT }, () => []);
    deck.forEach((n, i) => cascades[i % CASCADE_COUNT].push(makeCard(n)));
    return cascades;
  }

  function createGame(number) {
    if (!Number.isInteger(number) || number < 1 || number > MAX_DEAL) {
      throw new Error("Deal number must be a whole number from 1 to " + MAX_DEAL);
    }
    const state = {
      number,
      cascades: deal(number),
      cells: new Array(CELL_COUNT).fill(null),
      foundations: { C: 0, D: 0, H: 0, S: 0 },
      moves: 0,
      history: [],
    };
    autoPlay(state);
    return state;
  }

  function snapshot(state) {
    return {
      cascades: state.cascades.map((col) => col.slice()),
      cells: state.cells.slice(),
      foundations: { ...state.foundations },
      moves: state.moves,
    };
  }

  // A move source is {type: "cell", index} or {type: "cascade", index, count}.
  function pickUp(state, from) {
    if (from.type === "cell") {
      const card = state.cells[from.index];
      return card ? [card] : null;
    }
    const col = state.cascades[from.index];
    const count = from.count || 1;
    if (!col || count < 1 || count > col.length) return null;
    return col.slice(col.length - count);
  }

  function isRun(cards) {
    return cards.every((card, i) => i === 0 || (card.rank === cards[i - 1].rank - 1 && isRed(card) !== isRed(cards[i - 1])));
  }

  // Moving a run is shorthand for single-card moves through free cells and
  // empty columns; this is how many cards that spare space can carry.
  function maxMovable(state, toEmptyCascade) {
    const freeCells = state.cells.filter((card) => !card).length;
    const emptyCascades = state.cascades.filter((col) => col.length === 0).length - (toEmptyCascade ? 1 : 0);
    return (freeCells + 1) * 2 ** emptyCascades;
  }

  // `to` is {type: "cell", index}, {type: "cascade", index} or {type: "foundation"}.
  function canMove(state, from, to) {
    const cards = pickUp(state, from);
    if (!cards || !isRun(cards)) return false;
    const lead = cards[0];
    switch (to.type) {
      case "cell":
        return cards.length === 1 && to.index >= 0 && to.index < CELL_COUNT && !state.cells[to.index];
      case "foundation":
        return cards.length === 1 && state.foundations[lead.suit] === lead.rank - 1;
      case "cascade": {
        const target = state.cascades[to.index];
        if (!target || (from.type === "cascade" && from.index === to.index)) return false;
        if (target.length === 0) return cards.length <= maxMovable(state, true);
        const top = target[target.length - 1];
        return top.rank === lead.rank + 1 && isRed(top) !== isRed(lead) && cards.length <= maxMovable(state, false);
      }
      default:
        return false;
    }
  }

  function applyMove(state, from, to) {
    let cards;
    if (from.type === "cell") {
      cards = [state.cells[from.index]];
      state.cells[from.index] = null;
    } else {
      cards = state.cascades[from.index].splice(-(from.count || 1));
    }
    if (to.type === "cell") state.cells[to.index] = cards[0];
    else if (to.type === "foundation") state.foundations[cards[0].suit] = cards[0].rank;
    else state.cascades[to.index].push(...cards);
  }

  function move(state, from, to) {
    if (!canMove(state, from, to)) throw new Error("Illegal move");
    state.history.push(snapshot(state));
    applyMove(state, from, to);
    state.moves++;
    autoPlay(state);
    return state;
  }

  // Safe once nothing still in play could need to sit on it: both
  // opposite-colour foundations already hold the rank below.
  function isSafeToFoundation(state, card) {
    if (state.foundations[card.suit] !== card.rank - 1) return false;
    if (card.rank <= 2) return true;
    const opposite = isRed(card) ? ["C", "S"] : ["D", "H"];
    return opposite.every((suit) => state.foundations[suit] >= card.rank - 1);
  }

  function autoPlay(state) {
    let moved = 0;
    let progress = true;
    while (progress) {
      progress = false;
      const sources = [
        ...state.cells.map((card, index) => ({ card, from: { type: "cell", index } })),
        ...state.cascades.map((col, index) => ({ card: col[col.length - 1], from: { type: "cascade", index, count: 1 } })),
      ];
      const next = sources.find(({ card }) => card && isSafeToFoundation(state, card));
      if (next) {
        applyMove(state, next.from, { type: "foundation" });
        moved++;
        progress = true;
      }
    }
    return moved;
  }

  function undo(state) {
    const prev = state.history.pop();
    if (!prev) return false;
    Object.assign(state, prev);
    return true;
  }

  function isWon(state) {
    return [...SUITS].every((suit) => state.foundations[suit] === 13);
  }

  // Double-click: foundation, then building on a column, then a free cell,
  // and an empty column last since it's the most valuable space.
  function quickMove(state, from) {
    const cascades = state.cascades.map((_, index) => ({ type: "cascade", index }));
    const candidates = [
      { type: "foundation" },
      ...cascades.filter((t) => state.cascades[t.index].length > 0),
      ...(from.type === "cell" ? [] : state.cells.map((_, index) => ({ type: "cell", index }))),
      ...cascades.filter((t) => state.cascades[t.index].length === 0),
    ];
    const to = candidates.find((t) => canMove(state, from, t));
    if (!to) return null;
    move(state, from, to);
    return to;
  }

  // ----------------------------------------------------------------- solver

  const FOUNDATION = { type: "foundation" };
  const fits = (onto, card) => onto.rank === card.rank + 1 && isRed(onto) !== isRed(card);

  // How many cards at the bottom of a column already form a movable run.
  function runLength(col) {
    let n = col.length ? 1 : 0;
    while (n < col.length && fits(col[col.length - n - 1], col[col.length - n])) n++;
    return n;
  }

  // Every move worth trying, as {from, to}. Skips duplicates that only differ
  // by which empty cell or empty column they use, and moving a whole column into an empty one.
  function candidateMoves(state) {
    const moves = [];
    const freeCell = state.cells.indexOf(null);
    const emptyColumn = state.cascades.findIndex((col) => col.length === 0);
    const limit = maxMovable(state, false);
    const emptyLimit = emptyColumn >= 0 ? maxMovable(state, true) : 0;

    state.cells.forEach((card, index) => {
      if (!card) return;
      const from = { type: "cell", index };
      if (state.foundations[card.suit] === card.rank - 1) moves.push({ from, to: FOUNDATION });
      state.cascades.forEach((col, target) => {
        if (col.length && fits(col[col.length - 1], card)) moves.push({ from, to: { type: "cascade", index: target } });
      });
      if (emptyColumn >= 0) moves.push({ from, to: { type: "cascade", index: emptyColumn } });
    });

    state.cascades.forEach((col, index) => {
      if (!col.length) return;
      const top = col[col.length - 1];
      const run = runLength(col);
      if (state.foundations[top.suit] === top.rank - 1) moves.push({ from: { type: "cascade", index, count: 1 }, to: FOUNDATION });
      state.cascades.forEach((target, t) => {
        if (t === index || !target.length) return;
        const count = target[target.length - 1].rank - top.rank;
        if (count >= 1 && count <= run && count <= limit && fits(target[target.length - 1], col[col.length - count])) {
          moves.push({ from: { type: "cascade", index, count }, to: { type: "cascade", index: t } });
        }
      });
      for (let count = 1; count <= Math.min(run, emptyLimit, col.length - 1); count++) {
        moves.push({ from: { type: "cascade", index, count }, to: { type: "cascade", index: emptyColumn } });
      }
      if (freeCell >= 0) moves.push({ from: { type: "cascade", index, count: 1 }, to: { type: "cell", index: freeCell } });
    });
    return moves;
  }

  const cardCode = (card) => String.fromCharCode(48 + (card.rank - 1) * 4 + SUITS.indexOf(card.suit));

  // Column order and cell order don't change what can happen next, so they're sorted out of the key.
  function positionKey(state) {
    const cascades = state.cascades.map((col) => col.map(cardCode).join("")).sort();
    const cells = state.cells.filter(Boolean).map(cardCode).sort();
    return cascades.join("|") + "/" + cells.join("");
  }

  // Lower is closer to solved: cards still out, cards sitting on a lower card they block, and full cells.
  function estimate(state) {
    let blocking = 0;
    for (const col of state.cascades) {
      let lowest = 14;
      for (const card of col) {
        if (card.rank > lowest) blocking++;
        else lowest = card.rank;
      }
    }
    const home = state.foundations.C + state.foundations.D + state.foundations.H + state.foundations.S;
    return 52 - home + blocking + state.cells.filter(Boolean).length;
  }

  function heapPush(heap, node) {
    let i = heap.push(node) - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].priority <= node.priority) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = node;
  }

  function heapPop(heap) {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let i = 0;
      for (;;) {
        const left = 2 * i + 1, right = left + 1;
        let child = left;
        if (right < heap.length && heap[right].priority < heap[left].priority) child = right;
        if (child >= heap.length || heap[child].priority >= last.priority) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return top;
  }

  // Best-first search from the current position, playing moves exactly as move() does.
  // {result: "solved", moves}, "unsolvable" once every reachable position has been
  // tried, or "gave-up" after maxPositions without an answer.
  function solve(state, maxPositions) {
    const budget = maxPositions || 100000;
    const root = snapshot(state);
    if (isWon(root)) return { result: "solved", moves: [] };
    const seen = new Set([positionKey(root)]);
    const heap = [];
    heapPush(heap, { priority: 0, position: root, depth: 0, trail: null });
    while (heap.length) {
      const node = heapPop(heap);
      for (const step of candidateMoves(node.position)) {
        const next = snapshot(node.position);
        applyMove(next, step.from, step.to);
        autoPlay(next);
        const key = positionKey(next);
        if (seen.has(key)) continue;
        seen.add(key);
        const trail = { step, parent: node.trail };
        if (isWon(next)) {
          const moves = [];
          for (let t = trail; t; t = t.parent) moves.unshift(t.step);
          return { result: "solved", moves };
        }
        if (seen.size >= budget) return { result: "gave-up" };
        // A little weight on depth keeps solutions from wandering; hints should look purposeful.
        heapPush(heap, { priority: estimate(next) * 2 + node.depth * 0.5, position: next, depth: node.depth + 1, trail });
      }
    }
    return { result: "unsolvable" };
  }

  const api = {
    SUITS, RANKS, CELL_COUNT, CASCADE_COUNT, MAX_DEAL,
    isRed, isRun, deal, createGame, canMove, maxMovable, move, isSafeToFoundation, autoPlay, undo, isWon, quickMove,
    candidateMoves, solve,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FREECELL = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
