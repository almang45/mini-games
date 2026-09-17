// Spades engine - fixed 4 seats in two partnerships (seats 1+3 vs 2+4, i.e.
// indices 0+2 vs 1+3). No DOM dependency; same pure state + functions shape as
// hearts.js so it can be driven from the browser UI or a Node test.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const SEATS = 4;
  const TARGET_SCORE = 500;
  const LOSING_SCORE = -200;
  const NIL_BONUS = 100;
  const BAG_LIMIT = 10;
  const BAG_PENALTY = 100;

  function teamOf(seat) { return seat % 2; }

  function teamName(state, team) {
    return state.seats[team].name + " & " + state.seats[team + 2].name;
  }

  // Suit-grouped (clubs, diamonds, hearts, spades), low to high - trick-taking
  // hands read by suit, unlike Hearts' rank-first sort.
  function sortHand(cards) {
    return cards.slice().sort((a, b) => CARDS.SUITS.indexOf(a.suit) - CARDS.SUITS.indexOf(b.suit) || a.rank - b.rank);
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== SEATS) throw new Error("Spades requires exactly 4 seats");
    const state = {
      game: "spades",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      teamScores: [0, 0],
      teamBags: [0, 0],
      dealerSeat: SEATS - 1, // so Seat 1 bids and leads first
      roundNumber: 0,
      rng: opts && opts.rng,
      log: [],
      round: null,
      gameOver: false,
      winningTeam: null,
    };
    startRound(state);
    return state;
  }

  function startRound(state) {
    if (state.roundNumber > 0) state.dealerSeat = (state.dealerSeat + 1) % SEATS;
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    const first = (state.dealerSeat + 1) % SEATS;
    state.round = {
      hands: CARDS.dealEven(deck, SEATS).map(sortHand),
      phase: "bidding",
      bids: [null, null, null, null],
      turnSeat: first,
      leaderSeat: first,
      currentTrick: [],
      lastTrick: null,
      tricksWon: [0, 0, 0, 0],
      trickNumber: 1,
      spadesBroken: false,
      played: [],
      summary: null,
    };
    state.roundNumber++;
    state.log.push({ text: "Round " + state.roundNumber + " dealt - " + state.seats[first].name + " bids first.", fresh: true });
  }

  function placeBid(state, seat, bid) {
    const r = state.round;
    if (r.phase !== "bidding") throw new Error("not in bidding phase");
    if (seat !== r.turnSeat) throw new Error("not this seat's turn to bid");
    if (!Number.isInteger(bid) || bid < 0 || bid > 13) throw new Error("bid must be an integer from 0 (nil) to 13");
    r.bids[seat] = bid;
    state.log.push({ text: state.seats[seat].name + (bid === 0 ? " bids nil." : " bids " + bid + "."), fresh: true });
    r.turnSeat = (seat + 1) % SEATS;
    if (r.bids.every((b) => b !== null)) r.phase = "playing"; // bidding started at the leader, so turnSeat is back on them
  }

  function getLegalPlays(state, seat) {
    const r = state.round;
    const hand = r.hands[seat];
    if (r.currentTrick.length === 0) {
      if (r.spadesBroken) return hand.slice();
      const nonSpades = hand.filter((c) => c.suit !== "S");
      return nonSpades.length > 0 ? nonSpades : hand.slice();
    }
    const ledSuit = r.currentTrick[0].card.suit;
    const followers = hand.filter((c) => c.suit === ledSuit);
    return followers.length > 0 ? followers : hand.slice();
  }

  // The best play is always either of the led suit or a spade, so a later card
  // only takes over by out-ranking it in the same suit or by trumping it.
  function trickWinner(trick) {
    let best = trick[0];
    for (const play of trick) {
      const c = play.card, b = best.card;
      if (c.suit === b.suit ? c.rank > b.rank : c.suit === "S") best = play;
    }
    return best;
  }

  function playCard(state, seat, card) {
    const r = state.round;
    if (r.phase !== "playing") throw new Error("not in playing phase");
    if (seat !== r.turnSeat) throw new Error("not this seat's turn");
    if (!getLegalPlays(state, seat).some((c) => c.id === card.id)) throw new Error("illegal card: " + card.id);
    CARDS.removeCard(r.hands[seat], card);
    r.currentTrick.push({ seat, card });
    r.played.push(card);
    if (card.suit === "S") r.spadesBroken = true;
    state.log.push({ text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) + ".", fresh: true });

    if (r.currentTrick.length < SEATS) {
      r.turnSeat = (seat + 1) % SEATS;
      return;
    }
    const winner = trickWinner(r.currentTrick).seat;
    r.tricksWon[winner]++;
    state.log.push({ text: state.seats[winner].name + " takes trick " + r.trickNumber + ".", fresh: true });
    r.lastTrick = { plays: r.currentTrick, winner };
    r.currentTrick = [];
    r.leaderSeat = winner;
    r.turnSeat = winner;
    r.trickNumber++;
    if (r.hands.every((h) => h.length === 0)) finishRound(state);
  }

  // A failed nil's tricks still count toward the partner's contract (and bags):
  // the nil penalty is the whole cost of failing it.
  function scoreTeam(round, team) {
    let delta = 0, contract = 0, tricks = 0;
    for (const seat of [team, team + 2]) {
      tricks += round.tricksWon[seat];
      if (round.bids[seat] === 0) delta += round.tricksWon[seat] === 0 ? NIL_BONUS : -NIL_BONUS;
      else contract += round.bids[seat];
    }
    const made = tricks >= contract;
    const bags = made ? tricks - contract : 0;
    delta += made ? contract * 10 + bags : -contract * 10;
    return { contract, tricks, made, bags, delta };
  }

  function finishRound(state) {
    const r = state.round;
    r.summary = [0, 1].map((team) => {
      const result = scoreTeam(r, team);
      state.teamScores[team] += result.delta;
      state.teamBags[team] += result.bags;
      result.bagPenalty = state.teamBags[team] >= BAG_LIMIT;
      if (result.bagPenalty) {
        state.teamBags[team] -= BAG_LIMIT;
        state.teamScores[team] -= BAG_PENALTY;
      }
      return result;
    });
    r.phase = "round-end";
    state.log.push({
      text: "Round over: " + r.summary.map((s, t) => teamName(state, t) + " " + (s.delta >= 0 ? "+" : "") + s.delta +
        (s.bagPenalty ? " (-" + BAG_PENALTY + " bags)" : "")).join(", "),
      fresh: true,
    });

    const [a, b] = state.teamScores;
    const someoneWon = (a >= TARGET_SCORE || b >= TARGET_SCORE) && a !== b;
    const someoneCollapsed = a <= LOSING_SCORE || b <= LOSING_SCORE;
    if (someoneWon || someoneCollapsed) {
      state.gameOver = true;
      state.winningTeam = someoneWon ? (a > b ? 0 : 1) : (a <= LOSING_SCORE ? 1 : 0);
      r.phase = "game-end";
      state.log.push({ text: teamName(state, state.winningTeam) + " win the game!", fresh: true });
    }
  }

  // --------------------------------------------------------------------- AI

  // ponytail: rule-of-thumb trick count (honors, trump length, voids), not a
  // simulation - swap in a double-dummy sampler if the AI bids too loosely.
  function aiChooseBid(hand) {
    const bySuit = { C: [], D: [], H: [], S: [] };
    hand.forEach((c) => bySuit[c.suit].push(c.rank));
    const spades = bySuit.S;
    let est = 0;
    for (const suit of ["C", "D", "H"]) {
      const ranks = bySuit[suit], len = ranks.length;
      if (ranks.includes(14)) est += len <= 5 ? 1 : 0.5;
      if (ranks.includes(13) && len >= 2) est += len <= 4 ? 0.8 : 0.4;
      if (ranks.includes(12) && len >= 3 && len <= 4) est += 0.3;
      if (len === 0 && spades.length >= 2) est += 1;
      else if (len === 1 && spades.length >= 3) est += 0.5;
    }
    spades.forEach((rank) => {
      if (rank === 14) est += 1;
      else if (rank === 13) est += spades.length >= 2 ? 0.9 : 0.4;
      else if (rank === 12) est += spades.length >= 3 ? 0.7 : 0.2;
    });
    est += Math.max(0, spades.length - 3);

    const noStoppers = hand.every((c) => c.rank < 13) && spades.every((r) => r < 10) && spades.length <= 3;
    if (noStoppers && est < 1) return 0;
    return Math.max(1, Math.min(13, Math.round(est)));
  }

  function isBoss(round, seat, card) {
    for (let rank = card.rank + 1; rank <= 14; rank++) {
      const accounted = (c) => c.suit === card.suit && c.rank === rank;
      if (!round.played.some(accounted) && !round.hands[seat].some(accounted)) return false;
    }
    return true;
  }

  // Side-suit cards before spades, then low to high: the order to shed cards in.
  function cheapestFirst(a, b) { return (a.suit === "S") - (b.suit === "S") || a.rank - b.rank; }
  function highestFirst(a, b) { return b.rank - a.rank; }

  function aiChoosePlay(state, seat) {
    const r = state.round;
    const legal = getLegalPlays(state, seat);
    if (legal.length === 1) return legal[0];

    const team = teamOf(seat);
    const teamSeats = [team, team + 2];
    const contract = teamSeats.reduce((s, t) => s + (r.bids[t] > 0 ? r.bids[t] : 0), 0);
    const teamTricks = teamSeats.reduce((s, t) => s + r.tricksWon[t], 0);
    const isNil = r.bids[seat] === 0;
    const wantTricks = !isNil && teamTricks < contract;

    if (r.currentTrick.length === 0) {
      if (wantTricks) {
        const boss = legal.filter((c) => isBoss(r, seat, c)).sort(cheapestFirst);
        if (boss.length > 0) return boss[0];
      }
      return legal.slice().sort(cheapestFirst)[0];
    }

    const beats = (c) => trickWinner(r.currentTrick.concat([{ seat, card: c }])).seat === seat;
    const winners = legal.filter(beats).sort(cheapestFirst);
    const losers = legal.filter((c) => !beats(c));

    if (!wantTricks) {
      // Nil, or contract already made: duck with the highest card that still loses (avoids bags).
      if (losers.length > 0) return losers.sort(highestFirst)[0];
      return isNil ? winners.sort(highestFirst)[0] : winners[0];
    }

    const current = trickWinner(r.currentTrick);
    const partnerHasIt = teamOf(current.seat) === team &&
      (r.currentTrick.length === SEATS - 1 || isBoss(r, seat, current.card));
    if (partnerHasIt || winners.length === 0) return legal.slice().sort(cheapestFirst)[0];
    return winners[0];
  }

  const api = {
    SEATS, TARGET_SCORE, LOSING_SCORE, NIL_BONUS, BAG_LIMIT, BAG_PENALTY,
    teamOf, teamName, createGame, startRound, placeBid,
    getLegalPlays, trickWinner, playCard, scoreTeam,
    aiChooseBid, aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SPADES = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
