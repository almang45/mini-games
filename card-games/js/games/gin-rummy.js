// Gin Rummy engine - exactly 2 seats. The engine always arranges melds
// optimally (bestMelds) for humans and AI alike, so a turn is only ever
// "draw from where?" then "discard which card - and knock with it?".
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const HAND_SIZE = 10;
  const KNOCK_LIMIT = 10;
  const GIN_BONUS = 25;
  const UNDERCUT_BONUS = 25;
  const TARGET_SCORE = 100;
  const STOCK_FLOOR = 2; // discarding without a knock when only this many stock cards remain voids the hand

  function ginRank(card) { return card.rank === 14 ? 1 : card.rank; } // aces are low in gin
  function cardPoints(card) { return Math.min(10, ginRank(card)); }
  function sumPoints(cards) { return cards.reduce((s, c) => s + cardPoints(c), 0); }

  function sortHand(cards) {
    return cards.slice().sort((a, b) => CARDS.SUITS.indexOf(a.suit) - CARDS.SUITS.indexOf(b.suit) || ginRank(a) - ginRank(b));
  }

  // Every set (3-4 of a rank, including each 3-card subset of a 4-set) and every
  // same-suit run of 3+ consecutive ranks - overlapping candidates are expected.
  function candidateMelds(cards) {
    const melds = [];
    const byRank = new Map();
    cards.forEach((c) => byRank.set(ginRank(c), (byRank.get(ginRank(c)) || []).concat(c)));
    for (const group of byRank.values()) {
      if (group.length >= 3) melds.push(group);
      if (group.length === 4) group.forEach((skip) => melds.push(group.filter((c) => c !== skip)));
    }
    for (const suit of CARDS.SUITS) {
      const run = cards.filter((c) => c.suit === suit).sort((a, b) => ginRank(a) - ginRank(b));
      for (let i = 0; i < run.length; i++) {
        for (let j = i + 1; j < run.length && ginRank(run[j]) === ginRank(run[j - 1]) + 1; j++) {
          if (j - i >= 2) melds.push(run.slice(i, j + 1));
        }
      }
    }
    return melds;
  }

  // Exact minimum-deadwood arrangement. Walks cards in order; each undecided
  // card either joins a non-overlapping candidate meld or becomes deadwood.
  function bestMelds(cards) {
    const bit = new Map(cards.map((c, i) => [c.id, 1 << i]));
    const candidates = candidateMelds(cards).map((m) => ({ cards: m, mask: m.reduce((acc, c) => acc | bit.get(c.id), 0) }));
    let best = { points: Infinity, melds: [] };
    const chosen = [];
    (function search(i, used, points) {
      if (points >= best.points) return;
      while (i < cards.length && (used & (1 << i))) i++;
      if (i === cards.length) { best = { points, melds: chosen.slice() }; return; }
      const b = 1 << i;
      for (const m of candidates) {
        if ((m.mask & b) && !(m.mask & used)) {
          chosen.push(m.cards);
          search(i + 1, used | m.mask, points);
          chosen.pop();
        }
      }
      search(i + 1, used | b, points + cardPoints(cards[i]));
    })(0, 0, 0);
    const melded = new Set(best.melds.flat().map((c) => c.id));
    return {
      melds: best.melds.map(sortHand),
      deadwood: sortHand(cards.filter((c) => !melded.has(c.id))),
      points: best.points,
    };
  }

  function canExtend(meld, card) {
    if (meld.every((c) => ginRank(c) === ginRank(meld[0]))) return meld.length < 4 && ginRank(card) === ginRank(meld[0]);
    if (card.suit !== meld[0].suit) return false;
    const ranks = meld.map(ginRank);
    return ginRank(card) === Math.min(...ranks) - 1 || ginRank(card) === Math.max(...ranks) + 1;
  }

  // ponytail: greedy layoff onto the knocker's melds after the defender's own
  // best arrangement - misses the rare case where breaking a defender meld
  // lays off more. Search both together if that ever matters.
  function layOff(melds, deadwood) {
    const extended = melds.map((m) => m.slice());
    const laidOff = [];
    let remaining = deadwood.slice();
    let card;
    while ((card = remaining.find((c) => extended.some((m) => canExtend(m, c))))) {
      extended.find((m) => canExtend(m, card)).push(card);
      laidOff.push(card);
      remaining = remaining.filter((c) => c !== card);
    }
    return { melds: extended.map(sortHand), laidOff, deadwood: remaining };
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== 2) throw new Error("Gin Rummy requires exactly 2 seats");
    const state = {
      game: "gin-rummy",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      scores: [0, 0],
      dealerSeat: 1, // so Seat 1 takes the first turn
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
    if (state.handNumber > 0) state.dealerSeat = 1 - state.dealerSeat;
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    const first = 1 - state.dealerSeat;
    state.hand = {
      hands: [deck.slice(0, HAND_SIZE), deck.slice(HAND_SIZE, HAND_SIZE * 2)].map(sortHand),
      discardPile: [deck[HAND_SIZE * 2]],
      stock: deck.slice(HAND_SIZE * 2 + 1),
      turnSeat: first,
      phase: "draw",
      takenDiscardId: null,
      result: null,
    };
    state.handNumber++;
    state.log.push({ text: "Hand " + state.handNumber + " dealt - " + state.seats[first].name + " goes first.", fresh: true });
  }

  function topDiscard(state) {
    const pile = state.hand.discardPile;
    return pile.length > 0 ? pile[pile.length - 1] : null;
  }

  function assertTurn(state, seat, phase) {
    if (state.gameOver || state.hand.phase !== phase) throw new Error("not in " + phase + " phase");
    if (seat !== state.hand.turnSeat) throw new Error("not this seat's turn");
  }

  function drawStock(state, seat) {
    assertTurn(state, seat, "draw");
    const h = state.hand;
    h.hands[seat] = sortHand(h.hands[seat].concat(h.stock.pop()));
    h.takenDiscardId = null;
    h.phase = "discard";
    state.log.push({ text: state.seats[seat].name + " draws from the stock.", fresh: true });
  }

  function takeDiscard(state, seat) {
    assertTurn(state, seat, "draw");
    const h = state.hand;
    const card = h.discardPile.pop();
    if (!card) throw new Error("discard pile is empty");
    h.hands[seat] = sortHand(h.hands[seat].concat(card));
    h.takenDiscardId = card.id;
    h.phase = "discard";
    state.log.push({ text: state.seats[seat].name + " takes the " + CARDS.cardLabel(card) + ".", fresh: true });
  }

  function canDiscard(state, seat, card) {
    const h = state.hand;
    return !state.gameOver && h.phase === "discard" && seat === h.turnSeat &&
      card.id !== h.takenDiscardId && h.hands[seat].some((c) => c.id === card.id);
  }

  function deadwoodAfterDiscard(state, seat, card) {
    return bestMelds(state.hand.hands[seat].filter((c) => c.id !== card.id)).points;
  }

  function canKnock(state, seat, card) {
    return canDiscard(state, seat, card) && deadwoodAfterDiscard(state, seat, card) <= KNOCK_LIMIT;
  }

  function discard(state, seat, card, knock) {
    if (!canDiscard(state, seat, card)) throw new Error("cannot discard " + card.id + " now");
    if (knock && !canKnock(state, seat, card)) throw new Error("deadwood above " + KNOCK_LIMIT + " - cannot knock");
    const h = state.hand;
    CARDS.removeCard(h.hands[seat], card);
    h.discardPile.push(card);
    h.takenDiscardId = null;
    state.log.push({ text: state.seats[seat].name + " discards " + CARDS.cardLabel(card) + (knock ? " and knocks." : "."), fresh: true });
    if (knock) {
      settleKnock(state, seat);
    } else if (h.stock.length <= STOCK_FLOOR) {
      h.phase = "hand-end";
      h.result = { type: "void" };
      state.log.push({ text: "Only " + h.stock.length + " stock cards left - the hand is a draw.", fresh: true });
    } else {
      h.turnSeat = 1 - seat;
      h.phase = "draw";
    }
  }

  function settleKnock(state, knocker) {
    const h = state.hand;
    const defender = 1 - knocker;
    const k = bestMelds(h.hands[knocker]);
    const d = bestMelds(h.hands[defender]);
    const gin = k.points === 0;
    const lay = gin ? { melds: k.melds, laidOff: [], deadwood: d.deadwood } : layOff(k.melds, d.deadwood);
    const defenderPoints = sumPoints(lay.deadwood);

    let type, winner, points;
    if (gin) { type = "gin"; winner = knocker; points = GIN_BONUS + defenderPoints; }
    else if (defenderPoints <= k.points) { type = "undercut"; winner = defender; points = UNDERCUT_BONUS + k.points - defenderPoints; }
    else { type = "knock"; winner = knocker; points = defenderPoints - k.points; }

    const arrangements = [];
    arrangements[knocker] = { melds: lay.melds, deadwood: k.deadwood, points: k.points };
    arrangements[defender] = { melds: d.melds, deadwood: lay.deadwood, points: defenderPoints };
    state.scores[winner] += points;
    h.phase = "hand-end";
    h.result = { type, knocker, winner, points, laidOff: lay.laidOff, arrangements };
    state.log.push({ text: state.seats[winner].name + " scores " + points + (type === "knock" ? "." : " (" + type + ")."), fresh: true });

    if (state.scores[winner] >= TARGET_SCORE) {
      state.gameOver = true;
      state.winner = winner;
      state.log.push({ text: state.seats[winner].name + " wins the game!", fresh: true });
    }
  }

  function nextHand(state) {
    if (state.gameOver || state.hand.phase !== "hand-end") throw new Error("hand still in progress");
    startHand(state);
  }

  // --------------------------------------------------------------------- AI

  function aiWantsDiscard(state, seat) {
    const top = topDiscard(state);
    return !!top && !bestMelds(state.hand.hands[seat].concat(top)).deadwood.some((c) => c.id === top.id);
  }

  function neighbors(hand, card) {
    return hand.filter((c) => c !== card &&
      (c.rank === card.rank || (c.suit === card.suit && Math.abs(ginRank(c) - ginRank(card)) <= 2))).length;
  }

  // Lowest resulting deadwood first; among ties shed high cards that don't
  // connect to anything else in hand.
  function aiChooseDiscard(state, seat) {
    const h = state.hand;
    let best = null;
    for (const card of h.hands[seat]) {
      if (card.id === h.takenDiscardId) continue;
      const deadwood = deadwoodAfterDiscard(state, seat, card);
      const score = deadwood * 100 + neighbors(h.hands[seat], card) * 10 - cardPoints(card);
      if (!best || score < best.score) best = { card, deadwood, score };
    }
    return { card: best.card, deadwood: best.deadwood };
  }

  // ponytail: knock early, then hold out for a low count mid-hand to dodge
  // undercuts; no opponent-hand modelling.
  function aiShouldKnock(state, deadwood) {
    const stock = state.hand.stock.length;
    return deadwood === 0 || (deadwood <= KNOCK_LIMIT && (deadwood <= 4 || stock >= 16 || stock <= STOCK_FLOOR));
  }

  function aiStep(state, seat) {
    if (state.hand.phase === "draw") {
      if (aiWantsDiscard(state, seat)) takeDiscard(state, seat);
      else drawStock(state, seat);
      return;
    }
    const { card, deadwood } = aiChooseDiscard(state, seat);
    discard(state, seat, card, aiShouldKnock(state, deadwood));
  }

  const api = {
    HAND_SIZE, KNOCK_LIMIT, GIN_BONUS, UNDERCUT_BONUS, TARGET_SCORE, STOCK_FLOOR,
    ginRank, cardPoints, sortHand, candidateMelds, bestMelds, layOff,
    createGame, startHand, nextHand, topDiscard,
    drawStock, takeDiscard, canDiscard, deadwoodAfterDiscard, canKnock, discard,
    aiWantsDiscard, aiChooseDiscard, aiShouldKnock, aiStep,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.GIN_RUMMY = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
