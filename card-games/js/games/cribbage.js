// Cribbage engine - two players, six-card deal, first to 121. Pure state +
// functions like the other engines. "Go" is resolved automatically: a player
// who can't stay at or under 31 never has to press anything.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const WIN_SCORE = 121;
  const ord = (card) => (card.rank === 14 ? 1 : card.rank); // aces are low
  const pip = (card) => Math.min(ord(card), 10);
  const sortHand = (cards) => cards.slice().sort((a, b) => ord(a) - ord(b) || a.suit.localeCompare(b.suit));
  const sum = (items) => items.reduce((a, x) => a + x.points, 0);

  // ------------------------------------------------------------- counting

  function scoreHand(cards, starter, isCrib) {
    const all = cards.concat([starter]);
    const pips = all.map(pip);
    const items = [];

    let fifteens = 0;
    for (let mask = 1; mask < 32; mask++) {
      let total = 0;
      for (let i = 0; i < 5; i++) if (mask & (1 << i)) total += pips[i];
      if (total === 15) fifteens++;
    }
    if (fifteens) items.push({ label: fifteens === 1 ? "fifteen" : fifteens + " fifteens", points: fifteens * 2 });

    let pairs = 0;
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (ord(all[i]) === ord(all[j])) pairs++;
    if (pairs) items.push({ label: pairs === 1 ? "pair" : pairs + " pairs", points: pairs * 2 });

    // Five cards hold at most one stretch of 3+ ranks; duplicates multiply it.
    const counts = new Array(15).fill(0);
    all.forEach((c) => counts[ord(c)]++);
    for (let start = 1; start <= 13; start++) {
      let end = start, ways = 1;
      while (counts[end]) ways *= counts[end++];
      if (end - start >= 3) {
        items.push({ label: (ways === 1 ? "run of " : ways + " runs of ") + (end - start), points: (end - start) * ways });
        break;
      }
      start = end;
    }

    if (cards.every((c) => c.suit === cards[0].suit)) {
      const five = starter.suit === cards[0].suit;
      if (five) items.push({ label: "5-card flush", points: 5 });
      else if (!isCrib) items.push({ label: "flush", points: 4 }); // a crib flush needs the starter too
    }
    if (cards.some((c) => c.rank === 11 && c.suit === starter.suit)) items.push({ label: "nobs", points: 1 });
    return { items, points: sum(items) };
  }

  // Points for the card just added to the current count.
  function pegPoints(run, count) {
    const items = [];
    if (count === 15) items.push({ label: "fifteen", points: 2 });
    if (count === 31) items.push({ label: "31", points: 2 });
    const last = ord(run[run.length - 1].card);
    let same = 1;
    while (same < run.length && ord(run[run.length - 1 - same].card) === last) same++;
    if (same > 1) items.push({ label: ["pair", "pair royal", "double pair royal"][same - 2], points: [2, 6, 12][same - 2] });
    for (let k = run.length; k >= 3; k--) {
      const ords = run.slice(-k).map((p) => ord(p.card));
      if (new Set(ords).size === k && Math.max(...ords) - Math.min(...ords) === k - 1) {
        items.push({ label: "run of " + k, points: k });
        break;
      }
    }
    return items;
  }

  // ------------------------------------------------------------------ flow

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== 2) throw new Error("Cribbage needs 2 seats");
    const state = {
      game: "cribbage",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      scores: [0, 0],
      dealerSeat: 1, // the deal alternates before every hand, so Seat 1 deals first
      handNumber: 0,
      rng: opts && opts.rng,
      log: [],
      hand: null,
      gameOver: false,
      winner: null,
    };
    startHand(state);
    return state;
  }

  function startHand(state) {
    state.handNumber++;
    state.dealerSeat = 1 - state.dealerSeat;
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    state.hand = {
      deck,
      hands: [sortHand(deck.splice(0, 6)), sortHand(deck.splice(0, 6))],
      crib: [],
      starter: null,
      phase: "discard",
      turnSeat: 1 - state.dealerSeat, // the non-dealer lays away first
      pegHands: null,
      run: [], // cards in the current count
      count: 0,
      goSaid: false,
      show: null,
    };
    state.log.push({ text: "Hand " + state.handNumber + ": " + state.seats[state.dealerSeat].name + " deals.", fresh: true });
  }

  // Returns true when these points end the game, so callers stop right there.
  function addPoints(state, seat, items, where) {
    const points = sum(items);
    if (!points) return false;
    state.scores[seat] += points;
    state.log.push({ text: state.seats[seat].name + " scores " + points + " for " + items.map((x) => x.label).join(", ") + (where || "") + ".", fresh: true });
    if (state.scores[seat] < WIN_SCORE) return false;
    state.gameOver = true;
    state.winner = seat;
    state.hand.phase = "game-end";
    state.hand.turnSeat = null;
    state.log.push({ text: state.seats[seat].name + " reaches " + WIN_SCORE + " and wins.", fresh: true });
    return true;
  }

  function expectTurn(state, seat, phase) {
    if (state.hand.phase !== phase) throw new Error("not allowed in the " + state.hand.phase + " phase");
    if (seat !== state.hand.turnSeat) throw new Error("not this seat's turn");
  }

  function discard(state, seat, cards) {
    expectTurn(state, seat, "discard");
    const h = state.hand;
    if (cards.length !== 2) throw new Error("lay away exactly 2 cards");
    cards.forEach((c) => CARDS.removeCard(h.hands[seat], c));
    h.crib.push(...cards);
    state.log.push({ text: state.seats[seat].name + " lays away 2 cards.", fresh: true });
    if (seat !== state.dealerSeat) { h.turnSeat = state.dealerSeat; return; }

    h.starter = h.deck.pop();
    state.log.push({ text: "Starter: " + CARDS.cardLabel(h.starter) + ".", fresh: true });
    if (h.starter.rank === 11 && addPoints(state, seat, [{ label: "his heels", points: 2 }])) return;
    h.phase = "pegging";
    h.pegHands = h.hands.map((x) => x.slice());
    h.turnSeat = 1 - state.dealerSeat;
  }

  function legalPegs(state, seat) {
    const h = state.hand;
    return h.pegHands[seat].filter((c) => h.count + pip(c) <= 31);
  }

  function peg(state, seat, card) {
    expectTurn(state, seat, "pegging");
    const h = state.hand;
    if (!legalPegs(state, seat).some((c) => c.id === card.id)) throw new Error("that card takes the count past 31");
    CARDS.removeCard(h.pegHands[seat], card);
    h.count += pip(card);
    h.run.push({ seat, card });
    state.log.push({ text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) + " (" + h.count + ").", fresh: true });
    if (addPoints(state, seat, pegPoints(h.run, h.count))) return;

    const other = 1 - seat;
    const canPlay = (s) => legalPegs(state, s).length > 0;
    if (h.count < 31 && canPlay(other)) { h.turnSeat = other; return; }
    if (h.count < 31 && canPlay(seat)) {
      if (!h.goSaid && h.pegHands[other].length) state.log.push({ text: state.seats[other].name + " says go.", fresh: true });
      h.goSaid = true;
      return;
    }
    if (h.count < 31) {
      const lastCard = !h.pegHands[0].length && !h.pegHands[1].length;
      if (addPoints(state, seat, [{ label: lastCard ? "last card" : "the go", points: 1 }])) return;
    }
    h.count = 0;
    h.run = [];
    h.goSaid = false;
    if (h.pegHands[other].length) h.turnSeat = other;
    else if (h.pegHands[seat].length) h.turnSeat = seat;
    else showHands(state);
  }

  // Counted in order - non-dealer's hand, dealer's hand, crib - and the
  // first player to reach 121 wins before the rest is counted.
  function showHands(state) {
    const h = state.hand;
    const dealer = state.dealerSeat;
    h.phase = "hand-end";
    h.turnSeat = null;
    h.show = [
      { seat: 1 - dealer, label: "hand", cards: h.hands[1 - dealer] },
      { seat: dealer, label: "hand", cards: h.hands[dealer] },
      { seat: dealer, label: "crib", cards: sortHand(h.crib) },
    ];
    for (const entry of h.show) {
      Object.assign(entry, scoreHand(entry.cards, h.starter, entry.label === "crib"));
      entry.counted = !state.gameOver;
      if (entry.counted) addPoints(state, entry.seat, entry.items, entry.label === "crib" ? " in the crib" : " in hand");
    }
  }

  // --------------------------------------------------------------------- AI

  // Rough worth of two cards to whoever owns the crib.
  function cribValue(a, b) {
    return (ord(a) === ord(b) ? 2 : 0) + (pip(a) + pip(b) === 15 ? 2 : 0) +
      (Math.abs(ord(a) - ord(b)) === 1 ? 1 : 0) + (a.rank === 5 ? 1 : 0) + (b.rank === 5 ? 1 : 0);
  }

  // ponytail: best average hand over every possible starter plus a crib rule
  // of thumb; ignores what the kept cards are worth while pegging.
  function aiChooseDiscard(state, seat) {
    const hand = state.hand.hands[seat];
    const held = new Set(hand.map((c) => c.id));
    const starters = CARDS.buildDeck().filter((c) => !held.has(c.id));
    const sign = seat === state.dealerSeat ? 1 : -1;
    let best = null;
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        const keep = hand.filter((_, k) => k !== i && k !== j);
        const average = starters.reduce((total, s) => total + scoreHand(keep, s, false).points, 0) / starters.length;
        const value = average + sign * cribValue(hand[i], hand[j]);
        if (!best || value > best.value) best = { value, discard: [hand[i], hand[j]] };
      }
    }
    return best.discard;
  }

  // ponytail: grab the most points now and avoid leaving 5 or 21 for a
  // ten-card reply; no look-ahead at the opponent's likely cards.
  function aiChoosePeg(state, seat) {
    const h = state.hand;
    let best = null;
    for (const card of legalPegs(state, seat)) {
      const count = h.count + pip(card);
      let value = 10 * sum(pegPoints(h.run.concat([{ seat, card }]), count));
      if (count === 5 || count === 21) value -= 4;
      if (h.count === 0 && pip(card) < 5) value += 1; // nothing makes 15 off a low lead
      value += pip(card) / 10; // keep low cards to squeeze in near 31
      if (!best || value > best.value) best = { value, card };
    }
    return best.card;
  }

  const api = {
    WIN_SCORE, ord, pip, sortHand, scoreHand, pegPoints,
    createGame, startHand, discard, legalPegs, peg,
    aiChooseDiscard, aiChoosePeg,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CRIBBAGE = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
