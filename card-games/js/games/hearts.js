// Hearts engine - fixed 4 seats. No DOM dependency; pure state + functions so
// it can be driven from the browser UI or from a Node test/simulation.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const SEATS = 4;
  const PASS_CYCLE = ["left", "right", "across", "hold"];
  const QUEEN_OF_SPADES = { suit: "S", rank: 12 };

  function isPointCard(card) { return card.suit === "H" || (card.suit === "S" && card.rank === 12); }
  function cardValue(card) { return card.suit === "H" ? 1 : (card.suit === "S" && card.rank === 12) ? 13 : 0; }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== SEATS) throw new Error("Hearts requires exactly 4 seats");
    const state = {
      game: "hearts",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      scores: [0, 0, 0, 0],
      roundNumber: 0,
      rng: opts && opts.rng,
      log: [],
      round: null,
      gameOver: false,
    };
    startRound(state);
    return state;
  }

  function startRound(state) {
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    const hands = CARDS.dealEven(deck, SEATS).map((h) => CARDS.sortByRank(h));
    const passDirection = PASS_CYCLE[state.roundNumber % PASS_CYCLE.length];
    state.round = {
      hands,
      passDirection,
      phase: passDirection === "hold" ? "playing" : "passing",
      passSelections: [null, null, null, null],
      heartsBroken: false,
      currentTrick: [],
      leaderSeat: null,
      turnSeat: null,
      trickNumber: 1,
      tricksWon: [[], [], [], []],
      firstTrick: true,
    };
    state.roundNumber++;
    state.log.push({ text: "Round " + state.roundNumber + " dealt - pass " + passDirection + ".", fresh: true });
    if (passDirection === "hold") beginPlay(state);
  }

  function passTarget(seat, direction) {
    if (direction === "left") return (seat + 1) % SEATS;
    if (direction === "right") return (seat + 3) % SEATS;
    return (seat + 2) % SEATS; // across
  }

  function setPassSelection(state, seat, cards) {
    if (state.round.phase !== "passing") throw new Error("not in passing phase");
    if (cards.length !== 3) throw new Error("must pass exactly 3 cards");
    state.round.passSelections[seat] = cards;
    if (state.round.passSelections.every(Boolean)) applyPass(state);
  }

  function applyPass(state) {
    const r = state.round;
    const incoming = [[], [], [], []];
    for (let seat = 0; seat < SEATS; seat++) {
      const target = passTarget(seat, r.passDirection);
      for (const card of r.passSelections[seat]) {
        CARDS.removeCard(r.hands[seat], card);
        incoming[target].push(card);
      }
    }
    for (let seat = 0; seat < SEATS; seat++) {
      r.hands[seat] = CARDS.sortByRank(r.hands[seat].concat(incoming[seat]));
    }
    r.phase = "playing";
    state.log.push({ text: "Cards passed " + r.passDirection + ".", fresh: true });
    beginPlay(state);
  }

  function beginPlay(state) {
    const r = state.round;
    const leader = r.hands.findIndex((h) => h.some((c) => c.suit === "C" && c.rank === 2));
    r.leaderSeat = leader;
    r.turnSeat = leader;
  }

  function getLegalPlays(state, seat) {
    const r = state.round;
    const hand = r.hands[seat];
    if (r.currentTrick.length === 0) {
      if (r.firstTrick) return hand.filter((c) => c.suit === "C" && c.rank === 2);
      if (r.heartsBroken) return hand.slice();
      const nonHearts = hand.filter((c) => c.suit !== "H");
      return nonHearts.length > 0 ? nonHearts : hand.slice();
    }
    const ledSuit = r.currentTrick[0].card.suit;
    const followers = hand.filter((c) => c.suit === ledSuit);
    if (followers.length > 0) return followers;
    if (r.firstTrick) {
      const safe = hand.filter((c) => !isPointCard(c));
      return safe.length > 0 ? safe : hand.slice();
    }
    return hand.slice();
  }

  function playCard(state, seat, card) {
    const r = state.round;
    if (seat !== r.turnSeat) throw new Error("not this seat's turn");
    const legal = getLegalPlays(state, seat);
    if (!legal.some((c) => c.id === card.id)) throw new Error("illegal card: " + card.id);
    CARDS.removeCard(r.hands[seat], card);
    r.currentTrick.push({ seat, card });
    if (card.suit === "H") r.heartsBroken = true;
    state.log.push({ text: state.seats[seat].name + " plays " + CARDS.cardLabel(card) + ".", fresh: true });

    const events = { trickComplete: false, roundComplete: false, gameOver: false };
    if (r.currentTrick.length === SEATS) {
      const result = resolveTrick(state);
      events.trickComplete = true;
      events.trickWinner = result.winner;
      events.trickPoints = result.points;
      if (r.hands.every((h) => h.length === 0)) {
        const roundResult = finishRound(state);
        events.roundComplete = true;
        events.roundScores = roundResult.roundScores;
        events.moonShot = roundResult.moonShot;
        events.gameOver = state.gameOver;
      }
    } else {
      r.turnSeat = (seat + 1) % SEATS;
    }
    return events;
  }

  function resolveTrick(state) {
    const r = state.round;
    const ledSuit = r.currentTrick[0].card.suit;
    let best = r.currentTrick[0];
    for (const play of r.currentTrick) {
      if (play.card.suit === ledSuit && play.card.rank > best.card.rank) best = play;
    }
    const winner = best.seat;
    const points = r.currentTrick.reduce((sum, p) => sum + cardValue(p.card), 0);
    r.tricksWon[winner].push(...r.currentTrick.map((p) => p.card));
    state.log.push({ text: state.seats[winner].name + " takes the trick" + (points ? " (" + points + " pts)" : "") + ".", fresh: true });
    r.currentTrick = [];
    r.leaderSeat = winner;
    r.turnSeat = winner;
    r.trickNumber++;
    r.firstTrick = false;
    return { winner, points };
  }

  function finishRound(state) {
    const r = state.round;
    const points = r.tricksWon.map((cards) => cards.reduce((s, c) => s + cardValue(c), 0));
    let moonShot = -1;
    points.forEach((p, seat) => { if (p === 26) moonShot = seat; });
    const roundScores = moonShot === -1
      ? points
      : points.map((_, seat) => (seat === moonShot ? 0 : 26));
    roundScores.forEach((p, seat) => { state.scores[seat] += p; });
    r.phase = "round-end";
    state.log.push({
      text: moonShot !== -1
        ? state.seats[moonShot].name + " shot the moon!"
        : "Round over: " + roundScores.map((p, i) => state.seats[i].name + " +" + p).join(", "),
      fresh: true,
    });
    if (state.scores.some((s) => s >= 100)) {
      state.gameOver = true;
      r.phase = "game-end";
    }
    return { roundScores, moonShot };
  }

  function winners(state) {
    const min = Math.min(...state.scores);
    return state.scores.reduce((acc, s, i) => (s === min ? acc.concat(i) : acc), []);
  }

  // --------------------------------------------------------------------- AI

  function dangerScore(card) {
    if (card.suit === "S" && card.rank === 12) return 200;
    if (card.suit === "S" && card.rank > 12) return 120 + card.rank; // A/K spades can draw out the queen
    if (card.suit === "H") return 60 + card.rank;
    return card.rank;
  }

  function aiChoosePass(hand) {
    return hand.slice().sort((a, b) => dangerScore(b) - dangerScore(a)).slice(0, 3);
  }

  function aiChoosePlay(state, seat) {
    const r = state.round;
    const legal = getLegalPlays(state, seat);
    if (legal.length === 1) return legal[0];

    if (r.currentTrick.length === 0) {
      // Lead low from the shortest safe suit.
      const bySuit = {};
      legal.forEach((c) => { (bySuit[c.suit] = bySuit[c.suit] || []).push(c); });
      const suits = Object.keys(bySuit).sort((a, b) => bySuit[a].length - bySuit[b].length);
      const chosen = bySuit[suits[0]].sort((a, b) => a.rank - b.rank);
      return chosen[0];
    }

    const ledSuit = r.currentTrick[0].card.suit;
    const bestSoFar = r.currentTrick.reduce((best, p) => (p.card.suit === ledSuit && p.card.rank > best.rank ? p.card : best), r.currentTrick[0].card);
    const following = legal.filter((c) => c.suit === ledSuit);
    const trickPoints = r.currentTrick.reduce((s, p) => s + cardValue(p.card), 0);

    if (following.length > 0) {
      const safe = following.filter((c) => c.rank < bestSoFar.rank).sort((a, b) => b.rank - a.rank);
      const isLastToPlay = r.currentTrick.length === SEATS - 1;
      if (safe.length > 0) return safe[0]; // duck just under the current winner
      if (isLastToPlay && trickPoints === 0) {
        return following.sort((a, b) => b.rank - a.rank)[0]; // safe to win a pointless trick
      }
      return following.sort((a, b) => a.rank - b.rank)[0]; // forced to win; take it as cheaply as possible
    }

    // Void in led suit: dump the most dangerous card we're holding.
    return legal.slice().sort((a, b) => dangerScore(b) - dangerScore(a))[0];
  }

  const api = {
    SEATS, PASS_CYCLE, QUEEN_OF_SPADES,
    isPointCard, cardValue,
    createGame, startRound, setPassSelection, applyPass,
    getLegalPlays, playCard, winners,
    aiChoosePass, aiChoosePlay,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HEARTS = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
