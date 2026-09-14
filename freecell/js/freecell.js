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

  const api = {
    SUITS, RANKS, CELL_COUNT, CASCADE_COUNT, MAX_DEAL,
    isRed, isRun, deal, createGame, canMove, maxMovable, move, isSafeToFoundation, autoPlay, undo, isWon, quickMove,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.FREECELL = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
