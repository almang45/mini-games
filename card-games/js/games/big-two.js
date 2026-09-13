// Big Two (Deuces) engine - fixed 4 seats. Standard poker-hand ranking for
// 5-card plays (straight < flush < full house < four-of-a-kind < straight
// flush - see README); no jokers, no 4-card "bomb" interrupts. No DOM
// dependency; pure state + functions, same shape as games/president.js.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const SUIT_RANK = { D: 0, C: 1, H: 2, S: 3 }; // low to high, traditional Big Two suit order

  function singleValue(card) { return CARDS.presidentValue(card) * 4 + SUIT_RANK[card.suit]; }

  function groupByRank(hand) {
    const groups = {};
    for (const c of hand) (groups[c.rank] = groups[c.rank] || []).push(c);
    return groups;
  }

  function isConsecutiveNoTwo(sortedRanks) {
    if (sortedRanks.includes(2)) return false; // 2 is excluded from straights (documented simplification)
    for (let i = 1; i < sortedRanks.length; i++) if (sortedRanks[i] !== sortedRanks[i - 1] + 1) return false;
    return true;
  }

  // category: 2 straight, 3 flush, 4 full house, 5 four-of-a-kind, 6 straight flush
  function classifyFive(cards) {
    const groups = Object.values(groupByRank(cards)).sort((a, b) => b.length - a.length);
    const ranksSorted = cards.map((c) => c.rank).sort((a, b) => a - b);
    const flush = new Set(cards.map((c) => c.suit)).size === 1;
    const straight = isConsecutiveNoTwo(ranksSorted);
    const highCard = cards.reduce((best, c) => (singleValue(c) > singleValue(best) ? c : best), cards[0]);

    if (straight && flush) return { category: 6, tiebreak: singleValue(highCard) };
    if (groups[0].length === 4) return { category: 5, tiebreak: CARDS.presidentValue(groups[0][0]) * 4 };
    if (groups[0].length === 3 && groups[1] && groups[1].length === 2) return { category: 4, tiebreak: CARDS.presidentValue(groups[0][0]) * 4 };
    if (flush) return { category: 3, tiebreak: singleValue(highCard) };
    if (straight) return { category: 2, tiebreak: singleValue(highCard) };
    return null;
  }

  // Returns {size, strength} (only ever compared against another combo of the
  // same size) or null if `cards` isn't a legal Big Two shape at all.
  function describeCombo(cards) {
    const n = cards.length;
    if (n === 1) return { size: 1, strength: singleValue(cards[0]) };
    if (n === 2 || n === 3) {
      if (!cards.every((c) => c.rank === cards[0].rank)) return null;
      const suitPart = n === 2 ? Math.max(...cards.map((c) => SUIT_RANK[c.suit])) : 0;
      return { size: n, strength: CARDS.presidentValue(cards[0]) * 4 + suitPart };
    }
    if (n === 5) {
      const five = classifyFive(cards);
      return five ? { size: 5, strength: five.category * 1000 + five.tiebreak } : null;
    }
    return null; // sizes 4 and 6+ are never legal plays in this build
  }

  function kCombinations(arr, k) {
    const out = [];
    (function pick(start, chosen) {
      if (chosen.length === k) { out.push(chosen.slice()); return; }
      for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); pick(i + 1, chosen); chosen.pop(); }
    })(0, []);
    return out;
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== 4) throw new Error("Big Two requires exactly 4 seats");
    const deck = CARDS.shuffle(CARDS.buildDeck(), opts && opts.rng);
    const hands = CARDS.dealEven(deck, 4).map((h) => CARDS.sortForPresident(h));
    const leader = hands.findIndex((h) => h.some((c) => c.suit === "D" && c.rank === 3));
    const state = {
      game: "big-two",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      hands,
      pile: [],
      pileCombo: null,
      turnSeat: leader,
      lastPlayedSeat: null,
      passStreak: 0,
      finished: seatTypes.map(() => false),
      finishOrder: [],
      gameOver: false,
      log: [],
    };
    state.log.push({ text: state.seats[leader].name + " holds the 3♦ and leads first.", fresh: true });
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
    const combo = describeCombo(cards);
    if (!combo) return false;
    if (state.pile.length === 0) return true; // leading: any legal shape
    return combo.size === state.pileCombo.size && combo.strength > state.pileCombo.strength;
  }

  function playCards(state, seat, cards) {
    if (seat !== state.turnSeat) throw new Error("not this seat's turn");
    if (!isLegalSelection(state, seat, cards)) throw new Error("illegal selection");
    const combo = describeCombo(cards);
    for (const c of cards) CARDS.removeCard(state.hands[seat], c);
    state.pile = cards;
    state.pileCombo = combo;
    state.lastPlayedSeat = seat;
    state.passStreak = 0;
    state.log.push({ text: state.seats[seat].name + " plays " + cards.map(CARDS.cardLabel).join(" ") + ".", fresh: true });

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
      state.pileCombo = null;
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
    const hand = state.hands[seat];
    if (state.pile.length === 0) {
      const groups = groupByRank(hand);
      const lowestRank = Object.keys(groups).map(Number).sort((a, b) => CARDS.presidentValue({ rank: a }) - CARDS.presidentValue({ rank: b }))[0];
      return groups[lowestRank].slice(0, Math.min(3, groups[lowestRank].length));
    }
    const size = state.pileCombo.size;
    let best = null;
    if (size === 5) {
      for (const combo of kCombinations(hand, 5)) {
        const desc = describeCombo(combo);
        if (desc && desc.strength > state.pileCombo.strength && (!best || desc.strength < best.desc.strength)) best = { cards: combo, desc };
      }
    } else {
      const groups = groupByRank(hand);
      for (const rank of Object.keys(groups)) {
        const g = groups[rank];
        if (g.length < size) continue;
        const candidate = g.slice(0, size);
        const desc = describeCombo(candidate);
        if (desc.strength > state.pileCombo.strength && (!best || desc.strength < best.desc.strength)) best = { cards: candidate, desc };
      }
    }
    return best ? best.cards : null; // null => AI must pass
  }

  const api = {
    SUIT_RANK, singleValue, classifyFive, describeCombo, kCombinations,
    createGame, activeSeats, nextActiveSeat,
    isLegalSelection, playCards, passSeat,
    aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BIG_TWO = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
