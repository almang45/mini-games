// Oh Hell engine - 3 or 4 seats, every player for themselves. Hands shrink
// from 7 cards to 1 and grow back; a flipped card names trump, and only an
// exact bid scores. Same pure state + functions shape as spades.js.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const HAND_SIZES = [7, 6, 5, 4, 3, 2, 1, 2, 3, 4, 5, 6, 7];
  const EXACT_BONUS = 10;

  // Suit-grouped with trump last, so trumps sit together at the right of the fan.
  function sortHand(cards, trump) {
    const order = (suit) => (suit === trump ? 4 : CARDS.SUITS.indexOf(suit));
    return cards.slice().sort((a, b) => order(a.suit) - order(b.suit) || a.rank - b.rank);
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length < 3 || seatTypes.length > 4) throw new Error("Oh Hell needs 3 or 4 seats");
    const n = seatTypes.length;
    const state = {
      game: "oh-hell",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      scores: new Array(n).fill(0),
      dealerSeat: n - 1, // so Seat 1 bids and leads first
      roundIndex: -1,
      rng: opts && opts.rng,
      log: [],
      round: null,
      gameOver: false,
      winners: null,
    };
    startRound(state);
    return state;
  }

  function startRound(state) {
    const n = state.seats.length;
    if (state.roundIndex >= 0) state.dealerSeat = (state.dealerSeat + 1) % n;
    state.roundIndex++;
    const handSize = HAND_SIZES[state.roundIndex];
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    const trumpCard = deck[handSize * n];
    const first = (state.dealerSeat + 1) % n;
    state.round = {
      handSize,
      hands: Array.from({ length: n }, (_, s) => sortHand(deck.slice(s * handSize, (s + 1) * handSize), trumpCard.suit)),
      trumpCard,
      trump: trumpCard.suit,
      phase: "bidding",
      bids: new Array(n).fill(null),
      turnSeat: first,
      leaderSeat: first,
      currentTrick: [],
      lastTrick: null,
      tricksWon: new Array(n).fill(0),
      trickNumber: 1,
      played: [],
      summary: null,
    };
    state.log.push({
      text: "Round " + (state.roundIndex + 1) + " of " + HAND_SIZES.length + ": " + handSize + (handSize === 1 ? " card" : " cards") +
        " each, " + CARDS.cardLabel(trumpCard) + " turned - " + CARDS.suitName(trumpCard.suit) + " are trump.",
      fresh: true,
    });
  }

  // The dealer bids last and may not make the bids add up to the hand size,
  // so at least one player always misses.
  function legalBids(state, seat) {
    const r = state.round;
    const bids = [];
    for (let b = 0; b <= r.handSize; b++) bids.push(b);
    if (seat !== state.dealerSeat) return bids;
    const others = r.bids.reduce((sum, b) => sum + (b || 0), 0);
    return bids.filter((b) => b + others !== r.handSize);
  }

  function placeBid(state, seat, bid) {
    const r = state.round;
    if (r.phase !== "bidding") throw new Error("not in bidding phase");
    if (seat !== r.turnSeat) throw new Error("not this seat's turn to bid");
    if (!legalBids(state, seat).includes(bid)) throw new Error("illegal bid: " + bid);
    r.bids[seat] = bid;
    state.log.push({ text: state.seats[seat].name + " bids " + bid + ".", fresh: true });
    r.turnSeat = (seat + 1) % state.seats.length;
    if (r.bids.every((b) => b !== null)) r.phase = "playing"; // the dealer bid last, so turnSeat is back on the leader
  }

  function getLegalPlays(state, seat) {
    const r = state.round;
    const hand = r.hands[seat];
    if (r.currentTrick.length === 0) return hand.slice();
    const followers = hand.filter((c) => c.suit === r.currentTrick[0].card.suit);
    return followers.length > 0 ? followers : hand.slice();
  }

  // The best play is always of the led suit or trump, so a later card takes
  // over only by out-ranking it in the same suit or by trumping it.
  function trickWinner(trick, trump) {
    let best = trick[0];
    for (const play of trick) {
      const c = play.card, b = best.card;
      if (c.suit === b.suit ? c.rank > b.rank : c.suit === trump) best = play;
    }
    return best;
  }

  function playCard(state, seat, card) {
    const r = state.round;
    const n = state.seats.length;
    if (r.phase !== "playing") throw new Error("not in playing phase");
    if (seat !== r.turnSeat) throw new Error("not this seat's turn");
    if (!getLegalPlays(state, seat).some((c) => c.id === card.id)) throw new Error("illegal card: " + card.id);
    CARDS.removeCard(r.hands[seat], card);
    r.currentTrick.push({ seat, card });
    r.played.push(card);
    state.log.push({ text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) + ".", fresh: true });

    if (r.currentTrick.length < n) {
      r.turnSeat = (seat + 1) % n;
      return;
    }
    const winner = trickWinner(r.currentTrick, r.trump).seat;
    r.tricksWon[winner]++;
    state.log.push({ text: state.seats[winner].name + " takes trick " + r.trickNumber + ".", fresh: true });
    r.lastTrick = { plays: r.currentTrick, winner };
    r.currentTrick = [];
    r.leaderSeat = winner;
    r.turnSeat = winner;
    r.trickNumber++;
    if (r.hands.every((h) => h.length === 0)) finishRound(state);
  }

  function roundPoints(bid, tricks) { return bid === tricks ? EXACT_BONUS + bid : 0; }

  function finishRound(state) {
    const r = state.round;
    r.summary = state.seats.map((_, seat) => {
      const points = roundPoints(r.bids[seat], r.tricksWon[seat]);
      state.scores[seat] += points;
      return { bid: r.bids[seat], tricks: r.tricksWon[seat], points };
    });
    r.phase = "round-end";
    state.log.push({
      text: "Round over: " + r.summary.map((s, seat) => state.seats[seat].name + " " + (s.points ? "+" + s.points : "missed")).join(", ") + ".",
      fresh: true,
    });
    if (state.roundIndex < HAND_SIZES.length - 1) return;
    const best = Math.max(...state.scores);
    state.winners = state.scores.map((s, seat) => (s === best ? seat : -1)).filter((seat) => seat >= 0);
    state.gameOver = true;
    r.phase = "game-end";
    state.log.push({ text: state.winners.map((seat) => state.seats[seat].name).join(" & ") + " win" + (state.winners.length === 1 ? "s" : "") + " with " + best + "!", fresh: true });
  }

  // --------------------------------------------------------------------- AI

  // ponytail: honors-and-trump-length rule of thumb tuned on AI-vs-AI games
  // (makes ~45% of bids with 3 seats, ~55% with 4), not a simulation; it
  // ignores seat position and what earlier bidders said.
  function aiChooseBid(state, seat) {
    const r = state.round;
    const hand = r.hands[seat];
    const lengthOf = (suit) => hand.filter((c) => c.suit === suit).length;
    const trumps = lengthOf(r.trump);
    let est = 0;
    for (const c of hand) {
      const len = lengthOf(c.suit);
      if (c.suit === r.trump) {
        if (c.rank === 14) est += 1;
        else if (c.rank === 13) est += len >= 2 ? 0.85 : 0.5;
        else if (c.rank === 12) est += len >= 3 ? 0.7 : 0.3;
        else est += len >= 3 ? 0.5 : 0.25;
      } else if (c.rank === 14) est += len <= 3 ? 0.85 : 0.6;
      else if (c.rank === 13) est += len <= 3 ? 0.55 : 0.3;
      else if (c.rank === 12 && len <= 2) est += 0.2;
    }
    const voids = CARDS.SUITS.filter((s) => s !== r.trump && lengthOf(s) === 0).length;
    est += Math.max(0, Math.min(voids, trumps - 1)) * 0.5; // a void only ruffs while a spare trump lasts
    if (state.seats.length === 3) est *= 1.3; // fewer opponents, so more of your cards stand up
    return legalBids(state, seat).reduce((best, b) => (Math.abs(b - est) < Math.abs(best - est) ? b : best));
  }

  function isBoss(round, seat, card) {
    for (let rank = card.rank + 1; rank <= 14; rank++) {
      const accounted = (c) => c.suit === card.suit && c.rank === rank;
      if (!round.played.some(accounted) && !round.hands[seat].some(accounted)) return false;
    }
    return true;
  }

  function aiChoosePlay(state, seat) {
    const r = state.round;
    const legal = getLegalPlays(state, seat);
    if (legal.length === 1) return legal[0];
    const isTrump = (c) => c.suit === r.trump;
    const cheapestFirst = (a, b) => isTrump(a) - isTrump(b) || a.rank - b.rank;
    const dearestFirst = (a, b) => isTrump(b) - isTrump(a) || b.rank - a.rank;
    const wantTricks = r.tricksWon[seat] < r.bids[seat];

    if (r.currentTrick.length === 0) {
      const boss = wantTricks ? legal.filter((c) => isBoss(r, seat, c)).sort(cheapestFirst) : [];
      return boss.length > 0 ? boss[0] : legal.slice().sort(cheapestFirst)[0];
    }

    const beats = (c) => trickWinner(r.currentTrick.concat([{ seat, card: c }]), r.trump).seat === seat;
    const winners = legal.filter(beats).sort(cheapestFirst);
    const losers = legal.filter((c) => !beats(c));
    const lastToPlay = r.currentTrick.length === state.seats.length - 1;

    if (wantTricks) {
      if (winners.length === 0) return losers.sort(cheapestFirst)[0];
      return winners.find((c) => isBoss(r, seat, c)) || winners[0];
    }
    // Bid already made: shed the most dangerous card that still loses.
    if (losers.length > 0) return losers.sort(dearestFirst)[0];
    // Forced to win: last to play dumps its biggest card, otherwise hope to be overtaken.
    return lastToPlay ? winners[winners.length - 1] : winners[0];
  }

  const api = {
    HAND_SIZES, EXACT_BONUS,
    createGame, startRound, legalBids, placeBid,
    getLegalPlays, trickWinner, playCard, roundPoints,
    aiChooseBid, aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.OH_HELL = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
