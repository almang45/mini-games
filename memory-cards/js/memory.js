// Rules for Kartu Memori: deal pairs, turn cards over two at a time, and fit the board to the
// screen. Framework-agnostic (no DOM); every function returns a new game instead of changing one.
(function (root) {
  "use strict";

  const SIZES = [4, 6, 8, 12, 16];

  function shuffle(list, rng) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // `faces` is the theme's pool; a random `count / 2` of them become pairs. Each pair has a
  // side 0 and a side 1 card, so a theme can draw the two halves differently (a numeral and
  // its dots) while matching still only looks at `face`.
  function createGame(faces, count, rng) {
    const random = rng || Math.random;
    if (!SIZES.includes(count)) throw new Error("Kartu Memori: no board of " + count + " cards");
    const pairs = count / 2;
    if (faces.length < pairs) throw new Error("Kartu Memori: " + pairs + " pairs need more than " + faces.length + " faces");
    const chosen = shuffle(faces, random).slice(0, pairs);
    const cards = shuffle(chosen.flatMap((face) => [{ face, side: 0 }, { face, side: 1 }]), random)
      .map((card) => Object.freeze(Object.assign({ matched: false }, card)));
    return Object.freeze({ cards: Object.freeze(cards), open: Object.freeze([]), moves: 0, found: 0, pairs });
  }

  function withChanges(game, changes) {
    return Object.freeze(Object.assign({}, game, changes));
  }

  // result: "first" (one card up), "match", "miss" (two different cards stay up until
  // hide()), or "ignored" (a matched card, a card already up, or two already up).
  function flip(game, index) {
    const card = game.cards[index];
    if (!card || card.matched || game.open.includes(index) || game.open.length >= 2) {
      return { game, result: "ignored" };
    }
    if (game.open.length === 0) {
      return { game: withChanges(game, { open: Object.freeze([index]) }), result: "first" };
    }
    const other = game.open[0];
    const moves = game.moves + 1;
    if (game.cards[other].face !== card.face) {
      return { game: withChanges(game, { open: Object.freeze([other, index]), moves }), result: "miss" };
    }
    const cards = game.cards.map((c, i) => (i === index || i === other ? Object.freeze(Object.assign({}, c, { matched: true })) : c));
    return {
      game: withChanges(game, { cards: Object.freeze(cards), open: Object.freeze([]), moves, found: game.found + 1 }),
      result: "match",
    };
  }

  function hide(game) {
    return game.open.length ? withChanges(game, { open: Object.freeze([]) }) : game;
  }

  function isWon(game) {
    return game.found === game.pairs;
  }

  function isFaceUp(game, index) {
    return game.cards[index].matched || game.open.includes(index);
  }

  // The column count that gives the biggest cards of shape `aspect` (width / height) inside a
  // `width` × `height` box with `gap` between cards. Rows may end short.
  function bestGrid(count, width, height, aspect, gap) {
    let best = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const cellW = (width - gap * (cols - 1)) / cols;
      const cellH = (height - gap * (rows - 1)) / rows;
      if (cellW <= 0 || cellH <= 0) continue;
      const cardW = Math.min(cellW, cellH * aspect);
      // Prefer full rows: a short last row only wins when it gives clearly bigger cards.
      const score = cardW * (count % cols === 0 ? 1.08 : 1);
      if (!best || score > best.score) best = { cols, rows, cardW, cardH: cardW / aspect, score };
    }
    if (!best) return { cols: count, rows: 1, cardW: 0, cardH: 0 };
    return { cols: best.cols, rows: best.rows, cardW: Math.floor(best.cardW), cardH: Math.floor(best.cardH) };
  }

  const api = {
    SIZES,
    createGame,
    flip,
    hide,
    isWon,
    isFaceUp,
    bestGrid,
    shuffle,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MEMORY = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
