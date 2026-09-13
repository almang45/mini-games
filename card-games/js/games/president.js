// President (a.k.a. Daifugo) engine - 3 to 4 seats. Pure climbing-set rules:
// no jokers, no 8-clears/revolution specials (documented simplification).
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  function groupByRank(hand) {
    const groups = {};
    for (const c of hand) (groups[c.rank] = groups[c.rank] || []).push(c);
    return groups;
  }

  function createGame(seatTypes, opts) {
    const n = seatTypes.length;
    if (n < 3 || n > 4) throw new Error("President supports 3-4 seats");
    const deck = CARDS.shuffle(CARDS.buildDeck(), opts && opts.rng);
    const hands = CARDS.dealEven(deck, n).map((h) => CARDS.sortForPresident(h));
    const leader = hands.findIndex((h) => h.some((c) => c.suit === "C" && c.rank === 3));
    const state = {
      game: "president",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      hands,
      pile: [],
      pileRank: null,
      pileSize: null,
      turnSeat: leader,
      lastPlayedSeat: null,
      passStreak: 0,
      finished: seatTypes.map(() => false),
      finishOrder: [],
      gameOver: false,
      log: [],
    };
    state.log.push({ text: state.seats[leader].name + " holds the 3♣ and leads first.", fresh: true });
    return state;
  }

  function activeSeats(state) {
    const list = [];
    for (let i = 0; i < state.seats.length; i++) if (!state.finished[i]) list.push(i);
    return list;
  }

  function nextActiveSeat(state, fromSeat) {
    const n = state.seats.length;
    for (let step = 1; step <= n; step++) {
      const s = (fromSeat + step) % n;
      if (!state.finished[s]) return s;
    }
    return fromSeat;
  }

  function isLegalSelection(state, seat, cards) {
    if (cards.length === 0) return false;
    const hand = state.hands[seat];
    if (!cards.every((c) => hand.some((h) => h.id === c.id))) return false;
    if (new Set(cards.map((c) => c.rank)).size !== 1) return false;
    if (state.pile.length === 0) return true; // leading: any rank, any size
    return cards.length === state.pileSize && CARDS.presidentValue(cards[0]) > state.pileRank;
  }

  function getPlayableCombos(state, seat) {
    const groups = groupByRank(state.hands[seat]);
    const combos = [];
    for (const rank of Object.keys(groups)) {
      const cards = groups[rank];
      if (state.pile.length === 0) {
        for (let size = 1; size <= cards.length; size++) combos.push(cards.slice(0, size));
      } else if (cards.length >= state.pileSize && CARDS.presidentValue(cards[0]) > state.pileRank) {
        combos.push(cards.slice(0, state.pileSize));
      }
    }
    return combos;
  }

  function playCards(state, seat, cards) {
    if (seat !== state.turnSeat) throw new Error("not this seat's turn");
    if (!isLegalSelection(state, seat, cards)) throw new Error("illegal selection");
    for (const c of cards) CARDS.removeCard(state.hands[seat], c);
    state.pile = cards;
    state.pileRank = CARDS.presidentValue(cards[0]);
    state.pileSize = cards.length;
    state.lastPlayedSeat = seat;
    state.passStreak = 0;
    state.log.push({
      text: state.seats[seat].name + " plays " + cards.map(CARDS.cardLabel).join(" ") + ".",
      fresh: true,
    });

    if (state.hands[seat].length === 0) {
      state.finished[seat] = true;
      state.finishOrder.push(seat);
      state.log.push({ text: state.seats[seat].name + " is out - place #" + state.finishOrder.length + "!", fresh: true });
      const remaining = activeSeats(state);
      if (remaining.length <= 1) {
        if (remaining.length === 1) state.finishOrder.push(remaining[0]);
        state.gameOver = true;
        state.log.push({ text: "Game over: " + state.finishOrder.map((s) => state.seats[s].name).join(" > ") + ".", fresh: true });
        return { gameOver: true };
      }
    }
    state.turnSeat = nextActiveSeat(state, seat);
    return { gameOver: false };
  }

  function passSeat(state, seat) {
    if (seat !== state.turnSeat) throw new Error("not this seat's turn");
    if (state.pile.length === 0) throw new Error("cannot pass while leading");
    state.log.push({ text: state.seats[seat].name + " passes.", fresh: true });
    state.passStreak++;
    const stillIn = activeSeats(state).length;
    const threshold = state.finished[state.lastPlayedSeat] ? stillIn : stillIn - 1;
    if (state.passStreak >= threshold) {
      state.pile = [];
      state.pileRank = null;
      state.pileSize = null;
      state.passStreak = 0;
      const leadSeat = state.finished[state.lastPlayedSeat] ? nextActiveSeat(state, state.lastPlayedSeat) : state.lastPlayedSeat;
      state.turnSeat = leadSeat;
      state.log.push({ text: "Table clears - " + state.seats[leadSeat].name + " leads.", fresh: true });
    } else {
      state.turnSeat = nextActiveSeat(state, seat);
    }
  }

  // --------------------------------------------------------------------- AI

  function aiChoosePlay(state, seat) {
    const combos = getPlayableCombos(state, seat);
    if (combos.length === 0) return null; // must pass
    if (state.pile.length === 0) {
      // Lead the lowest-ranked group, playing every copy of it.
      const groups = groupByRank(state.hands[seat]);
      const lowestRank = Object.keys(groups).map(Number).sort((a, b) => CARDS.presidentValue({ rank: a }) - CARDS.presidentValue({ rank: b }))[0];
      return groups[lowestRank];
    }
    // Beat the pile as cheaply as possible.
    return combos.slice().sort((a, b) => CARDS.presidentValue(a[0]) - CARDS.presidentValue(b[0]))[0];
  }

  const api = {
    createGame, activeSeats, nextActiveSeat,
    isLegalSelection, getPlayableCombos, playCards, passSeat,
    aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PRESIDENT = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
