// Euchre engine - fixed 4 seats in two partnerships (indices 0+2 vs 1+3) with
// a 24-card deck (9 through Ace). The jack of trump (right bower) and the
// other jack of the same colour (left bower) are the top trumps, and the
// left bower belongs to the trump suit for every rule. Same pure state +
// functions shape as spades.js.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const SEATS = 4;
  const HAND_SIZE = 5;
  const TARGET_SCORE = 10;
  const SAME_COLOR = { C: "S", S: "C", D: "H", H: "D" };
  const CALL_THRESHOLD = 2.2;

  function buildDeck() { return CARDS.buildDeck().filter((c) => c.rank >= 9); }
  const DECK = buildDeck();

  function teamOf(seat) { return seat % 2; }
  function teamName(state, team) { return state.seats[team].name + " & " + state.seats[team + 2].name; }

  function isRightBower(card, trump) { return card.rank === 11 && card.suit === trump; }
  function isLeftBower(card, trump) { return card.rank === 11 && card.suit === SAME_COLOR[trump]; }
  function effectiveSuit(card, trump) { return isLeftBower(card, trump) ? trump : card.suit; }

  // One comparable number per card within a trick: any trump beats the led
  // suit, which beats everything else (0).
  function cardPower(card, trump, ledSuit) {
    const suit = effectiveSuit(card, trump);
    if (suit === trump) return 100 + (isRightBower(card, trump) ? 20 : isLeftBower(card, trump) ? 19 : card.rank);
    return suit === ledSuit ? card.rank : 0;
  }

  function strength(card, trump) { return cardPower(card, trump, effectiveSuit(card, trump)); }

  // Suit-grouped low to high; once trump is known the left bower moves into
  // the trump group, which sorts last.
  function sortHand(cards, trump) {
    const key = (c) => {
      if (!trump) return CARDS.SUITS.indexOf(c.suit) * 100 + c.rank;
      const suit = effectiveSuit(c, trump);
      return (suit === trump ? 400 : CARDS.SUITS.indexOf(suit) * 100) + (strength(c, trump) % 100);
    };
    return cards.slice().sort((a, b) => key(a) - key(b));
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== SEATS) throw new Error("Euchre requires exactly 4 seats");
    const state = {
      game: "euchre",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      teamScores: [0, 0],
      dealerSeat: SEATS - 1, // so Seat 1 bids and leads first
      handNumber: 0,
      rng: opts && opts.rng,
      log: [],
      hand: null,
      gameOver: false,
      winningTeam: null,
    };
    startHand(state);
    return state;
  }

  function startHand(state) {
    if (state.handNumber > 0) state.dealerSeat = (state.dealerSeat + 1) % SEATS;
    state.handNumber++;
    const deck = CARDS.shuffle(DECK, state.rng);
    const first = (state.dealerSeat + 1) % SEATS;
    state.hand = {
      hands: Array.from({ length: SEATS }, (_, s) => sortHand(deck.slice(s * HAND_SIZE, (s + 1) * HAND_SIZE), null)),
      upcard: deck[SEATS * HAND_SIZE],
      kitty: deck.slice(SEATS * HAND_SIZE + 1),
      phase: "order",
      turnSeat: first,
      trump: null,
      maker: null,
      leaderSeat: first,
      currentTrick: [],
      lastTrick: null,
      tricksWon: [0, 0, 0, 0],
      trickNumber: 1,
      played: [],
      summary: null,
    };
    state.log.push({ text: "Hand " + state.handNumber + " dealt - " + CARDS.cardLabel(state.hand.upcard) + " turned up.", fresh: true });
  }

  function expectTurn(state, seat, phases) {
    const h = state.hand;
    if (!phases.includes(h.phase)) throw new Error("not allowed in the " + h.phase + " phase");
    if (seat !== h.turnSeat) throw new Error("not this seat's turn");
  }

  function setTrump(state, seat, suit) {
    const h = state.hand;
    h.trump = suit;
    h.maker = seat;
    h.hands = h.hands.map((cards) => sortHand(cards, suit));
  }

  function orderUp(state, seat) {
    expectTurn(state, seat, ["order"]);
    const h = state.hand;
    const dealer = state.dealerSeat;
    state.log.push({ text: state.seats[seat].name + (seat === dealer ? " picks up " : " orders up ") + CARDS.cardLabel(h.upcard) + ".", fresh: true });
    h.hands[dealer].push(h.upcard);
    setTrump(state, seat, h.upcard.suit);
    h.phase = "discard";
    h.turnSeat = dealer;
  }

  function discard(state, seat, card) {
    expectTurn(state, seat, ["discard"]);
    const h = state.hand;
    CARDS.removeCard(h.hands[seat], card);
    h.kitty.push(card);
    state.log.push({ text: state.seats[seat].name + " discards a card face down.", fresh: true });
    startPlay(state);
  }

  // Stick the dealer: once the upcard is turned down, the dealer can't pass
  // a second time, so every hand is played.
  function pass(state, seat) {
    expectTurn(state, seat, ["order", "name"]);
    const h = state.hand;
    if (h.phase === "name" && seat === state.dealerSeat) throw new Error("the dealer must name trump");
    state.log.push({ text: state.seats[seat].name + " passes.", fresh: true });
    h.turnSeat = (seat + 1) % SEATS;
    if (h.phase === "order" && seat === state.dealerSeat) {
      h.kitty.push(h.upcard);
      h.phase = "name";
      state.log.push({ text: CARDS.cardLabel(h.upcard) + " is turned down.", fresh: true });
    }
  }

  function nameTrump(state, seat, suit) {
    expectTurn(state, seat, ["name"]);
    const h = state.hand;
    if (!CARDS.SUITS.includes(suit)) throw new Error("unknown suit: " + suit);
    if (suit === h.upcard.suit) throw new Error("can't name the turned-down suit");
    setTrump(state, seat, suit);
    state.log.push({ text: state.seats[seat].name + " names " + CARDS.suitName(suit) + ".", fresh: true });
    startPlay(state);
  }

  function startPlay(state) {
    const h = state.hand;
    h.phase = "playing";
    h.leaderSeat = h.turnSeat = (state.dealerSeat + 1) % SEATS;
  }

  function getLegalPlays(state, seat) {
    const h = state.hand;
    const cards = h.hands[seat];
    if (h.currentTrick.length === 0) return cards.slice();
    const led = effectiveSuit(h.currentTrick[0].card, h.trump);
    const followers = cards.filter((c) => effectiveSuit(c, h.trump) === led);
    return followers.length > 0 ? followers : cards.slice();
  }

  function trickWinner(trick, trump) {
    const led = effectiveSuit(trick[0].card, trump);
    return trick.reduce((best, play) => (cardPower(play.card, trump, led) > cardPower(best.card, trump, led) ? play : best));
  }

  function playCard(state, seat, card) {
    expectTurn(state, seat, ["playing"]);
    const h = state.hand;
    if (!getLegalPlays(state, seat).some((c) => c.id === card.id)) throw new Error("illegal card: " + card.id);
    CARDS.removeCard(h.hands[seat], card);
    h.currentTrick.push({ seat, card });
    h.played.push(card);
    state.log.push({ text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) + ".", fresh: true });

    if (h.currentTrick.length < SEATS) {
      h.turnSeat = (seat + 1) % SEATS;
      return;
    }
    const winner = trickWinner(h.currentTrick, h.trump).seat;
    h.tricksWon[winner]++;
    state.log.push({ text: state.seats[winner].name + " takes trick " + h.trickNumber + ".", fresh: true });
    h.lastTrick = { plays: h.currentTrick, winner };
    h.currentTrick = [];
    h.leaderSeat = h.turnSeat = winner;
    h.trickNumber++;
    if (h.trickNumber > HAND_SIZE) finishHand(state);
  }

  function handResult(maker, tricksWon) {
    const makers = teamOf(maker);
    const tricks = tricksWon[makers] + tricksWon[makers + 2];
    if (tricks === HAND_SIZE) return { team: makers, points: 2, kind: "march", tricks };
    if (tricks >= 3) return { team: makers, points: 1, kind: "made", tricks };
    return { team: 1 - makers, points: 2, kind: "euchred", tricks };
  }

  function finishHand(state) {
    const h = state.hand;
    h.summary = handResult(h.maker, h.tricksWon);
    state.teamScores[h.summary.team] += h.summary.points;
    h.phase = "hand-end";
    const makers = teamName(state, teamOf(h.maker));
    const text = h.summary.kind === "euchred"
      ? makers + " are euchred with " + h.summary.tricks + " tricks: +2 to " + teamName(state, h.summary.team) + "."
      : makers + " take " + h.summary.tricks + " tricks: +" + h.summary.points + (h.summary.kind === "march" ? " for the march." : ".");
    state.log.push({ text, fresh: true });
    const [a, b] = state.teamScores;
    if (a >= TARGET_SCORE || b >= TARGET_SCORE) {
      state.gameOver = true;
      state.winningTeam = a > b ? 0 : 1;
      h.phase = "game-end";
      state.log.push({ text: teamName(state, state.winningTeam) + " win the game!", fresh: true });
    }
  }

  // --------------------------------------------------------------------- AI

  // ponytail: additive trick estimate (bowers, trump honours, side aces,
  // ruffing voids), not a simulation; seat position and score are ignored.
  function handStrength(cards, trump) {
    const isTrump = (c) => effectiveSuit(c, trump) === trump;
    const trumps = cards.filter(isTrump).length;
    let est = 0;
    for (const c of cards) {
      if (isTrump(c)) est += isRightBower(c, trump) ? 1 : isLeftBower(c, trump) ? 0.85 : c.rank === 14 ? 0.7 : c.rank === 13 ? 0.55 : 0.4;
      else if (c.rank === 14) est += 0.6;
    }
    const voids = CARDS.SUITS.filter((s) => s !== trump && !cards.some((c) => !isTrump(c) && c.suit === s)).length;
    return est + Math.min(voids, Math.max(0, trumps - 1)) * 0.3;
  }

  // Keep trump and aces; throw the lowest side card, preferring one that leaves a void.
  function aiChooseDiscard(cards, trump) {
    const sideCount = (suit) => cards.filter((c) => effectiveSuit(c, trump) === suit).length;
    const keepValue = (c) => {
      const suit = effectiveSuit(c, trump);
      if (suit === trump) return 100 + strength(c, trump);
      if (c.rank === 14) return 50;
      return c.rank - (sideCount(suit) === 1 ? 5 : 0);
    };
    return cards.slice().sort((a, b) => keepValue(a) - keepValue(b))[0];
  }

  function aiWantsOrder(state, seat) {
    const h = state.hand;
    const trump = h.upcard.suit;
    const dealer = state.dealerSeat;
    if (seat === dealer) {
      const six = h.hands[seat].concat([h.upcard]);
      const thrown = aiChooseDiscard(six, trump);
      return handStrength(six.filter((c) => c.id !== thrown.id), trump) >= CALL_THRESHOLD;
    }
    // Ordering hands the upcard to the dealer: a gift to a partner, a cost against an opponent.
    const upcardShift = teamOf(seat) === teamOf(dealer) ? 0.4 : -0.3;
    return handStrength(h.hands[seat], trump) + upcardShift >= CALL_THRESHOLD;
  }

  function aiChooseName(state, seat) {
    const h = state.hand;
    const options = CARDS.SUITS.filter((s) => s !== h.upcard.suit)
      .map((suit) => ({ suit, est: handStrength(h.hands[seat], suit) }))
      .sort((a, b) => b.est - a.est);
    return options[0].est >= CALL_THRESHOLD || seat === state.dealerSeat ? options[0].suit : null;
  }

  // The kitty stays unknown, so a card only counts as boss when every higher
  // card of its suit has been played or sits in this hand.
  function isBoss(h, seat, card) {
    const suit = effectiveSuit(card, h.trump);
    const power = cardPower(card, h.trump, suit);
    const seen = (c) => h.played.some((p) => p.id === c.id) || h.hands[seat].some((x) => x.id === c.id);
    return DECK.every((c) => effectiveSuit(c, h.trump) !== suit || cardPower(c, h.trump, suit) <= power || seen(c));
  }

  function aiChoosePlay(state, seat) {
    const h = state.hand;
    const trump = h.trump;
    const legal = getLegalPlays(state, seat);
    if (legal.length === 1) return legal[0];
    const isTrump = (c) => effectiveSuit(c, trump) === trump;
    const cheapestFirst = (a, b) => isTrump(a) - isTrump(b) || strength(a, trump) - strength(b, trump);

    if (h.currentTrick.length === 0) {
      const boss = legal.filter((c) => isBoss(h, seat, c));
      const bossTrump = boss.find(isTrump);
      if (bossTrump && teamOf(h.maker) === teamOf(seat)) return bossTrump; // makers pull trump
      const bossSide = boss.filter((c) => !isTrump(c)).sort(cheapestFirst)[0];
      return bossSide || legal.slice().sort(cheapestFirst)[0];
    }

    const beats = (c) => trickWinner(h.currentTrick.concat([{ seat, card: c }]), trump).seat === seat;
    const winners = legal.filter(beats).sort(cheapestFirst);
    const current = trickWinner(h.currentTrick, trump);
    const partnerHasIt = teamOf(current.seat) === teamOf(seat) &&
      (h.currentTrick.length === SEATS - 1 || isBoss(h, seat, current.card));
    if (partnerHasIt || winners.length === 0) return legal.slice().sort(cheapestFirst)[0];
    return winners[0];
  }

  function aiStep(state, seat) {
    const h = state.hand;
    if (h.phase === "order") return aiWantsOrder(state, seat) ? orderUp(state, seat) : pass(state, seat);
    if (h.phase === "discard") return discard(state, seat, aiChooseDiscard(h.hands[seat], h.trump));
    if (h.phase === "name") {
      const suit = aiChooseName(state, seat);
      return suit ? nameTrump(state, seat, suit) : pass(state, seat);
    }
    return playCard(state, seat, aiChoosePlay(state, seat));
  }

  const api = {
    SEATS, HAND_SIZE, TARGET_SCORE, DECK,
    teamOf, teamName, isRightBower, isLeftBower, effectiveSuit, cardPower, trickWinner,
    createGame, startHand, orderUp, discard, pass, nameTrump, getLegalPlays, playCard, handResult,
    handStrength, aiChooseDiscard, aiWantsOrder, aiChooseName, aiChoosePlay, aiStep,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.EUCHRE = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
