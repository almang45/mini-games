// Crazy Eights engine - 2 to 4 seats. No skip/reverse/draw-two specials: the
// only wild card is the 8 (documented simplification, see README).
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  function dealCount(seatCount) { return seatCount === 2 ? 7 : 5; }

  function createGame(seatTypes, opts) {
    const n = seatTypes.length;
    if (n < 2 || n > 4) throw new Error("Crazy Eights supports 2-4 seats");
    const deck = CARDS.shuffle(CARDS.buildDeck(), opts && opts.rng);
    const perHand = dealCount(n);
    const hands = Array.from({ length: n }, () => []);
    for (let i = 0; i < perHand * n; i++) hands[i % n].push(deck[i]);
    const rest = deck.slice(perHand * n);
    const discardPile = [rest.pop()];
    // Never start on an eight - it has no suit to match against yet.
    while (discardPile[0].rank === 8) {
      rest.unshift(discardPile.pop());
      discardPile.push(rest.pop());
    }
    const state = {
      game: "crazy-eights",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      hands: hands.map((h) => CARDS.sortByRank(h)),
      drawPile: rest,
      discardPile,
      declaredSuit: null,
      turnSeat: 0,
      pendingDraw: null,
      winner: null,
      gameOver: false,
      rng: opts && opts.rng,
      log: [],
    };
    state.log.push({ text: "Dealt " + perHand + " cards each. " + CARDS.cardLabel(discardPile[0]) + " starts the discard.", fresh: true });
    return state;
  }

  function topCard(state) { return state.discardPile[state.discardPile.length - 1]; }
  function effectiveSuit(state) { return state.declaredSuit || topCard(state).suit; }

  function isPlayable(state, card) {
    if (card.rank === 8) return true;
    const top = topCard(state);
    return card.suit === effectiveSuit(state) || card.rank === top.rank;
  }

  function getLegalPlays(state, seat) {
    if (state.pendingDraw) {
      return state.pendingDraw.seat === seat && state.pendingDraw.playable ? [state.pendingDraw.card] : [];
    }
    return state.hands[seat].filter((c) => isPlayable(state, c));
  }

  function canDraw(state, seat) {
    return !state.pendingDraw && state.turnSeat === seat && getLegalPlays(state, seat).length === 0;
  }

  function reshuffleIfNeeded(state) {
    if (state.drawPile.length > 0) return;
    const top = state.discardPile.pop();
    state.drawPile = CARDS.shuffle(state.discardPile, state.rng);
    state.discardPile = [top];
  }

  function drawCard(state, seat) {
    if (!canDraw(state, seat)) throw new Error("cannot draw right now");
    reshuffleIfNeeded(state);
    if (state.drawPile.length === 0) { advanceTurn(state); return null; } // stalemate guard
    const card = state.drawPile.pop();
    state.hands[seat].push(card);
    state.hands[seat] = CARDS.sortByRank(state.hands[seat]);
    const playable = isPlayable(state, card);
    state.log.push({ text: state.seats[seat].name + " draws a card.", fresh: true });
    if (!playable) {
      state.log.push({ text: state.seats[seat].name + " can't play it - turn passes.", fresh: true });
      advanceTurn(state);
      return { card, playable: false };
    }
    state.pendingDraw = { seat, card, playable: true };
    return { card, playable: true };
  }

  function passTurn(state, seat) {
    if (!state.pendingDraw || state.pendingDraw.seat !== seat || !state.pendingDraw.playable) {
      throw new Error("nothing to pass on");
    }
    state.pendingDraw = null;
    state.log.push({ text: state.seats[seat].name + " keeps the drawn card and passes.", fresh: true });
    advanceTurn(state);
  }

  function playCard(state, seat, card, declaredSuit) {
    if (seat !== state.turnSeat) throw new Error("not this seat's turn");
    const legal = getLegalPlays(state, seat);
    if (!legal.some((c) => c.id === card.id)) throw new Error("illegal card: " + card.id);
    if (card.rank === 8 && !CARDS.SUITS.includes(declaredSuit)) throw new Error("must declare a suit for an eight");

    CARDS.removeCard(state.hands[seat], card);
    state.discardPile.push(card);
    state.declaredSuit = card.rank === 8 ? declaredSuit : null;
    state.pendingDraw = null;
    state.log.push({
      text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) +
        (card.rank === 8 ? " (suit is now " + CARDS.suitName(declaredSuit) + ")" : "") + ".",
      fresh: true,
    });

    if (state.hands[seat].length === 0) {
      state.winner = seat;
      state.gameOver = true;
      state.log.push({ text: state.seats[seat].name + " wins!", fresh: true });
      return { gameOver: true, winner: seat };
    }
    advanceTurn(state);
    return { gameOver: false };
  }

  function advanceTurn(state) {
    state.turnSeat = (state.turnSeat + 1) % state.seats.length;
  }

  // --------------------------------------------------------------------- AI

  function suitCounts(hand) {
    const counts = {};
    for (const c of hand) if (c.rank !== 8) counts[c.suit] = (counts[c.suit] || 0) + 1;
    return counts;
  }

  function aiChooseSuit(hand) {
    const counts = suitCounts(hand);
    return CARDS.SUITS.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
  }

  function aiChoosePlay(state, seat) {
    const legal = getLegalPlays(state, seat);
    const nonEights = legal.filter((c) => c.rank !== 8);
    const pool = nonEights.length > 0 ? nonEights : legal; // hold eights back until forced
    const counts = suitCounts(state.hands[seat]);
    const card = pool.slice().sort((a, b) => (counts[b.suit] || 0) - (counts[a.suit] || 0))[0];
    const declaredSuit = card.rank === 8 ? aiChooseSuit(state.hands[seat].filter((c) => c.id !== card.id)) : undefined;
    return { card, declaredSuit };
  }

  const api = {
    dealCount, createGame, topCard, effectiveSuit, isPlayable,
    getLegalPlays, canDraw, drawCard, passTurn, playCard,
    aiChooseSuit, aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CRAZY_EIGHTS = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
