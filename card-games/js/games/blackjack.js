// Blackjack engine - 1 to 4 seats against an implicit dealer (not a "seat").
// Flat 25-chip bet per round, no betting UI/phase. Hit/stand/double only (no
// splits). Dealer stands on all 17s. Natural blackjack pays 3:2. Deck is
// reshuffled fresh each round. Fixed 15-round session, ranked by final chips.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const BASE_BET = 25;
  const MAX_ROUNDS = 15;

  function handValue(cards) {
    let total = 0;
    let aces = 0;
    cards.forEach((c) => {
      if (c.rank === 14) { total += 11; aces += 1; }
      else if (c.rank >= 11) total += 10;
      else total += c.rank;
    });
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    return { total, soft: aces > 0 };
  }

  function isBlackjack(cards) { return cards.length === 2 && handValue(cards).total === 21; }

  function drawCard(state) {
    if (state.deckCursor >= state.deck.length) {
      state.deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
      state.deckCursor = 0;
    }
    return state.deck[state.deckCursor++];
  }

  function createGame(seatTypes, opts) {
    const n = seatTypes.length;
    if (n < 1 || n > 4) throw new Error("Blackjack supports 1-4 seats");
    return {
      game: "blackjack",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1), chips: 500 })),
      rng: (opts && opts.rng) || CARDS.makeRng(1),
      round: 0,
      maxRounds: MAX_ROUNDS,
      deck: [],
      deckCursor: 0,
      hands: seatTypes.map(() => ({ cards: [], bet: 0, status: "sitout", doubled: false, result: null, net: 0 })),
      dealerHand: [],
      dealerRevealed: false,
      turnSeat: null,
      phase: "round-over",
      gameOver: false,
      log: [{ text: "Blackjack - " + BASE_BET + " chips/hand, " + MAX_ROUNDS + " rounds. Deal to begin.", fresh: true }],
    };
  }

  function firstOrNextPlayingSeat(state, fromSeat) {
    for (let i = fromSeat + 1; i < state.seats.length; i++) {
      if (state.hands[i].status === "playing") return i;
    }
    return null;
  }

  function settleRound(state) {
    const dealerTotal = handValue(state.dealerHand).total;
    const dealerBJ = isBlackjack(state.dealerHand);
    const dealerBust = dealerTotal > 21;
    state.hands.forEach((h, i) => {
      if (h.status === "sitout") return;
      let net;
      if (h.status === "blackjack") net = dealerBJ ? 0 : Math.round(h.bet * 1.5);
      else if (h.status === "bust") net = -h.bet;
      else if (dealerBJ) net = -h.bet;
      else if (dealerBust) net = h.bet;
      else {
        const playerTotal = handValue(h.cards).total;
        net = playerTotal > dealerTotal ? h.bet : playerTotal < dealerTotal ? -h.bet : 0;
      }
      h.result = net > 0 ? "win" : net < 0 ? "lose" : "push";
      h.net = net;
      state.seats[i].chips += net;
      state.log.push({
        text: state.seats[i].name + " " + h.result + (net !== 0 ? " " + (net > 0 ? "+" : "") + net : "") +
          " (chips: " + state.seats[i].chips + ").",
        fresh: true,
      });
    });
    state.phase = "round-over";
    state.turnSeat = null;
    if (state.round >= state.maxRounds) {
      state.gameOver = true;
      state.log.push({ text: "Session over: " + state.seats.map((s) => s.name + " " + s.chips).join(", ") + ".", fresh: true });
    }
  }

  function resolveDealerAndSettle(state) {
    state.dealerRevealed = true;
    const anyLive = state.hands.some((h) => h.bet > 0 && h.status !== "bust");
    if (anyLive) {
      while (handValue(state.dealerHand).total < 17) state.dealerHand.push(drawCard(state));
    }
    state.log.push({
      text: "Dealer shows " + state.dealerHand.map(CARDS.cardLabel).join(" ") + " (" + handValue(state.dealerHand).total + ").",
      fresh: true,
    });
    settleRound(state);
  }

  function advanceTurn(state, fromSeat) {
    const next = firstOrNextPlayingSeat(state, fromSeat);
    if (next == null) resolveDealerAndSettle(state);
    else state.turnSeat = next;
  }

  function dealRound(state) {
    if (state.gameOver) throw new Error("game is over");
    if (state.phase !== "round-over") throw new Error("current round has not finished");
    state.round += 1;
    state.deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    state.deckCursor = 0;
    state.hands = state.seats.map((s) => {
      const bet = Math.min(BASE_BET, s.chips);
      if (bet <= 0) return { cards: [], bet: 0, status: "sitout", doubled: false, result: null, net: 0 };
      return { cards: [drawCard(state), drawCard(state)], bet, status: "playing", doubled: false, result: null, net: 0 };
    });
    state.dealerHand = [drawCard(state), drawCard(state)];
    state.dealerRevealed = false;
    state.hands.forEach((h) => { if (h.status === "playing" && isBlackjack(h.cards)) h.status = "blackjack"; });
    state.log.push({ text: "Round " + state.round + " dealt.", fresh: true });

    const dealerUp = state.dealerHand[0];
    if ((dealerUp.rank === 14 || dealerUp.rank >= 10) && isBlackjack(state.dealerHand)) {
      state.phase = "playing";
      state.dealerRevealed = true;
      state.log.push({ text: "Dealer reveals a natural blackjack.", fresh: true });
      settleRound(state);
      return;
    }

    const first = firstOrNextPlayingSeat(state, -1);
    state.phase = "playing";
    if (first == null) resolveDealerAndSettle(state);
    else state.turnSeat = first;
  }

  function requireTurn(state, seat) {
    if (state.phase !== "playing" || state.turnSeat !== seat) throw new Error("not this seat's turn");
  }

  function hit(state, seat) {
    requireTurn(state, seat);
    const h = state.hands[seat];
    h.cards.push(drawCard(state));
    const v = handValue(h.cards);
    state.log.push({ text: state.seats[seat].name + " hits: " + h.cards.map(CARDS.cardLabel).join(" ") + " (" + v.total + ").", fresh: true });
    if (v.total > 21) {
      h.status = "bust";
      state.log.push({ text: state.seats[seat].name + " busts with " + v.total + ".", fresh: true });
      advanceTurn(state, seat);
    }
  }

  function stand(state, seat) {
    requireTurn(state, seat);
    state.hands[seat].status = "stood";
    state.log.push({ text: state.seats[seat].name + " stands on " + handValue(state.hands[seat].cards).total + ".", fresh: true });
    advanceTurn(state, seat);
  }

  function doubleDown(state, seat) {
    requireTurn(state, seat);
    const h = state.hands[seat];
    if (h.cards.length !== 2) throw new Error("can only double down on the initial two cards");
    if (state.seats[seat].chips < h.bet * 2) throw new Error("not enough chips to double down");
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(drawCard(state));
    const v = handValue(h.cards);
    h.status = v.total > 21 ? "bust" : "stood";
    state.log.push({
      text: state.seats[seat].name + " doubles down: " + h.cards.map(CARDS.cardLabel).join(" ") + " (" + v.total + (h.status === "bust" ? ", bust" : "") + ").",
      fresh: true,
    });
    advanceTurn(state, seat);
  }

  // --------------------------------------------------------------------- AI

  function aiChooseAction(state, seat) {
    const h = state.hands[seat];
    const v = handValue(h.cards);
    if (h.cards.length === 2 && (v.total === 10 || v.total === 11) && state.seats[seat].chips >= h.bet * 2) return "double";
    return v.total < 17 ? "hit" : "stand";
  }

  function stepAI(state, seat) {
    const action = aiChooseAction(state, seat);
    if (action === "hit") hit(state, seat);
    else if (action === "double") doubleDown(state, seat);
    else stand(state, seat);
  }

  const api = {
    BASE_BET, MAX_ROUNDS,
    handValue, isBlackjack,
    createGame, dealRound, hit, stand, doubleDown,
    aiChooseAction, stepAI,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BLACKJACK = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
