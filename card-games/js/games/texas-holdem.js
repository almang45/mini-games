// Texas Hold'em engine - no-limit, 2-4 seats, fixed 10/20 blinds, a session of
// HAND_LIMIT hands or until one player holds every chip. Pure state +
// functions like the other engines; the AI estimates its equity by dealing
// out random boards and opponent hands.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const STARTING_CHIPS = 500;
  const SMALL_BLIND = 10;
  const BIG_BLIND = 20;
  const HAND_LIMIT = 20;
  const AI_SAMPLES = 150;
  const RAISE_DISCOUNT = 0.12; // at 0 the AI calls down with any pair and heads-up sessions bust in ~8 hands
  const STREET_NAME = ["Preflop", "Flop", "Turn", "River"];
  const CATEGORY_NAME = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];

  // ------------------------------------------------------------ hand ranking

  function straightHigh(ranks) {
    for (let high = 14; high >= 5; high--) {
      let run = true;
      for (let r = high; r > high - 5 && run; r--) run = ranks.has(r === 1 ? 14 : r); // the ace also plays low
      if (run) return high;
    }
    return 0;
  }

  // Best 5-card hand out of 5-7 cards, as {category, tiebreak} on the same
  // scale as Chinese Poker's evaluateHand, without trying all 21 subsets.
  function evaluate(cards) {
    const bySuit = { C: [], D: [], H: [], S: [] };
    const counts = new Array(15).fill(0);
    for (const c of cards) { bySuit[c.suit].push(c.rank); counts[c.rank]++; }
    const flush = Object.values(bySuit).find((ranks) => ranks.length >= 5);
    if (flush) {
      const high = straightHigh(new Set(flush));
      if (high) return { category: 8, tiebreak: [high] };
    }
    const groups = { 4: [], 3: [], 2: [], 1: [] };
    for (let r = 14; r >= 2; r--) if (counts[r]) groups[counts[r]].push(r);
    const kickers = (used, n) => {
      const out = [];
      for (let r = 14; r >= 2 && out.length < n; r--) if (counts[r] && !used.includes(r)) out.push(r);
      return out;
    };
    const [quad] = groups[4];
    if (quad) return { category: 7, tiebreak: [quad, ...kickers([quad], 1)] };
    const [trips, secondTrips] = groups[3];
    if (trips && (secondTrips || groups[2].length)) return { category: 6, tiebreak: [trips, Math.max(secondTrips || 0, groups[2][0] || 0)] };
    if (flush) return { category: 5, tiebreak: flush.slice().sort((a, b) => b - a).slice(0, 5) };
    const straight = straightHigh(new Set(cards.map((c) => c.rank)));
    if (straight) return { category: 4, tiebreak: [straight] };
    if (trips) return { category: 3, tiebreak: [trips, ...kickers([trips], 2)] };
    const [hi, lo] = groups[2];
    if (lo) return { category: 2, tiebreak: [hi, lo, ...kickers([hi, lo], 1)] };
    if (hi) return { category: 1, tiebreak: [hi, ...kickers([hi], 3)] };
    return { category: 0, tiebreak: kickers([], 5) };
  }

  function compare(a, b) {
    if (a.category !== b.category) return a.category - b.category;
    for (let i = 0; i < a.tiebreak.length; i++) if (a.tiebreak[i] !== b.tiebreak[i]) return a.tiebreak[i] - b.tiebreak[i];
    return 0;
  }

  // ------------------------------------------------------------------ setup

  function createGame(seatTypes, opts) {
    if (seatTypes.length < 2 || seatTypes.length > 4) throw new Error("Texas Hold'em needs 2-4 seats");
    const n = seatTypes.length;
    const state = {
      game: "texas-holdem",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      chips: new Array(n).fill(STARTING_CHIPS),
      dealerSeat: n - 1, // the button moves before every deal, so Seat 1 deals first
      handNumber: 0,
      rng: opts && opts.rng,
      log: [],
      hand: null,
      gameOver: false,
    };
    startHand(state);
    return state;
  }

  function nextWithChips(state, from) {
    const n = state.seats.length;
    for (let i = 1; i <= n; i++) if (state.chips[(from + i) % n] > 0) return (from + i) % n;
    return -1;
  }

  function seatsWhere(state, test) { return state.seats.map((_, s) => s).filter(test); }
  function liveSeats(state) { const h = state.hand; return seatsWhere(state, (s) => h.dealt[s] && !h.folded[s]); }
  function canAct(h, s) { return h.dealt[s] && !h.folded[s] && !h.allIn[s]; }
  function potTotal(h) { return h.contributed.reduce((a, b) => a + b, 0); }

  function put(state, seat, amount) {
    const h = state.hand;
    const pay = Math.min(amount, state.chips[seat]);
    state.chips[seat] -= pay;
    h.bets[seat] += pay;
    h.contributed[seat] += pay;
    if (state.chips[seat] === 0) h.allIn[seat] = true;
    return pay;
  }

  function startHand(state) {
    const n = state.seats.length;
    state.handNumber++;
    state.dealerSeat = nextWithChips(state, state.dealerSeat);
    const dealt = state.chips.map((c) => c > 0);
    const deck = CARDS.shuffle(CARDS.buildDeck(), state.rng);
    const h = state.hand = {
      deck,
      holes: dealt.map((d) => (d ? [deck.pop(), deck.pop()] : [])),
      board: [],
      dealt,
      folded: new Array(n).fill(false),
      allIn: new Array(n).fill(false),
      acted: new Array(n).fill(false),
      bets: new Array(n).fill(0),
      contributed: new Array(n).fill(0),
      street: 0,
      currentBet: BIG_BLIND, // a short big blind still has to be called in full
      minRaise: BIG_BLIND,
      raises: 0,
      turnSeat: null,
      phase: "betting",
      result: null,
    };
    // Heads-up the button posts the small blind and acts first before the flop.
    h.smallBlindSeat = dealt.filter(Boolean).length === 2 ? state.dealerSeat : nextWithChips(state, state.dealerSeat);
    h.bigBlindSeat = nextWithChips(state, h.smallBlindSeat);
    put(state, h.smallBlindSeat, SMALL_BLIND);
    put(state, h.bigBlindSeat, BIG_BLIND);
    state.log.push({
      text: "Hand " + state.handNumber + ": " + state.seats[state.dealerSeat].name + " has the button; blinds " +
        SMALL_BLIND + "/" + BIG_BLIND + " from " + state.seats[h.smallBlindSeat].name + " and " + state.seats[h.bigBlindSeat].name + ".",
      fresh: true,
    });
    moveOn(state, h.bigBlindSeat);
  }

  // ---------------------------------------------------------------- betting

  function nextToAct(state, from) {
    const h = state.hand;
    const n = state.seats.length;
    const able = seatsWhere(state, (s) => canAct(h, s)).length;
    for (let i = 1; i <= n; i++) {
      const s = (from + i) % n;
      if (!canAct(h, s) || (h.acted[s] && h.bets[s] >= h.currentBet)) continue;
      if (able === 1 && h.bets[s] >= h.currentBet) continue; // everyone else is all in: nothing to bet against
      return s;
    }
    return null;
  }

  function legalActions(state, seat) {
    const h = state.hand;
    const stack = state.chips[seat];
    const owed = Math.max(0, h.currentBet - h.bets[seat]);
    const maxRaiseTo = h.bets[seat] + stack;
    const opponentsCanAct = seatsWhere(state, (s) => s !== seat && canAct(h, s)).length > 0;
    return {
      canCheck: owed === 0,
      toCall: Math.min(owed, stack),
      canRaise: stack > owed && opponentsCanAct,
      minRaiseTo: Math.min(maxRaiseTo, h.currentBet + h.minRaise),
      maxRaiseTo,
    };
  }

  function act(state, seat, action) {
    const h = state.hand;
    if (h.phase !== "betting") throw new Error("no betting in progress");
    if (seat !== h.turnSeat) throw new Error("not this seat's turn");
    const legal = legalActions(state, seat);
    const name = state.seats[seat].name;
    let text;
    if (action.type === "fold") {
      h.folded[seat] = true;
      text = name + " folds.";
    } else if (action.type === "check") {
      if (!legal.canCheck) throw new Error("can't check facing a bet");
      text = name + " checks.";
    } else if (action.type === "call") {
      if (legal.canCheck) throw new Error("nothing to call");
      text = name + " calls " + put(state, seat, legal.toCall) + (h.allIn[seat] ? " and is all in." : ".");
    } else if (action.type === "raise") {
      const to = action.to;
      if (!legal.canRaise) throw new Error("raising isn't allowed here");
      if (!Number.isInteger(to) || to < legal.minRaiseTo || to > legal.maxRaiseTo) throw new Error("illegal raise to " + to);
      const opening = h.currentBet === 0;
      if (to - h.currentBet >= h.minRaise) h.minRaise = to - h.currentBet; // a short all-in doesn't raise the minimum
      put(state, seat, to - h.bets[seat]);
      h.currentBet = to;
      h.raises++;
      h.acted.fill(false);
      text = name + (opening ? " bets " : " raises to ") + to + (h.allIn[seat] ? " (all in)." : ".");
    } else {
      throw new Error("unknown action: " + action.type);
    }
    h.acted[seat] = true;
    state.log.push({ text, fresh: true });
    moveOn(state, seat);
  }

  function moveOn(state, fromSeat) {
    const h = state.hand;
    const live = liveSeats(state);
    if (live.length === 1) return awardUncontested(state, live[0]);
    const next = nextToAct(state, fromSeat);
    if (next !== null) { h.turnSeat = next; return; }
    if (h.street === 3) return showdown(state);
    dealStreet(state);
  }

  function dealStreet(state) {
    const h = state.hand;
    h.street++;
    h.bets.fill(0);
    h.acted.fill(false);
    h.currentBet = 0;
    h.minRaise = BIG_BLIND;
    h.raises = 0;
    h.deck.pop(); // burn
    const fresh = [];
    for (let i = 0; i < (h.street === 1 ? 3 : 1); i++) fresh.push(h.deck.pop());
    h.board.push(...fresh);
    state.log.push({ text: STREET_NAME[h.street] + ": " + fresh.map(CARDS.cardLabel).join(" ") + ".", fresh: true });
    moveOn(state, state.dealerSeat); // with nobody left to bet, this keeps dealing to the river
  }

  // ------------------------------------------------------------- settlement

  // Main pot first, then side pots; each pot is shared by the live players
  // who put in at least its level. An uncalled bet becomes a pot of one.
  // Folded chips never exceed the top live level: the biggest contributor
  // can't be facing a bet, so never folds.
  function buildPots(state) {
    const h = state.hand;
    const live = liveSeats(state);
    const levels = [...new Set(live.map((s) => h.contributed[s]))].sort((a, b) => a - b);
    let prev = 0;
    return levels.map((level) => {
      const amount = h.contributed.reduce((sum, c) => sum + Math.max(0, Math.min(c, level) - prev), 0);
      prev = level;
      return { amount, eligible: live.filter((s) => h.contributed[s] >= level) };
    });
  }

  function awardUncontested(state, seat) {
    const h = state.hand;
    const amount = potTotal(h);
    state.chips[seat] += amount;
    const payouts = h.contributed.map((_, s) => (s === seat ? amount : 0));
    h.result = { uncontested: true, pots: [{ amount, eligible: [seat], winners: [seat] }], payouts, hands: [] };
    state.log.push({ text: state.seats[seat].name + " wins " + amount + " - everyone else folded.", fresh: true });
    endHand(state);
  }

  function showdown(state) {
    const h = state.hand;
    const n = state.seats.length;
    const hands = liveSeats(state).map((seat) => ({ seat, score: evaluate(h.holes[seat].concat(h.board)) }));
    const scoreOf = (seat) => hands.find((x) => x.seat === seat).score;
    const payouts = new Array(n).fill(0);
    const pots = buildPots(state);
    const leftOfButton = (s) => (s - state.dealerSeat - 1 + n) % n;
    pots.forEach((pot, i) => {
      let best = null;
      pot.winners = [];
      for (const seat of pot.eligible) {
        const cmp = best ? compare(scoreOf(seat), best) : 1;
        if (cmp > 0) { best = scoreOf(seat); pot.winners = [seat]; } else if (cmp === 0) pot.winners.push(seat);
      }
      const share = Math.floor(pot.amount / pot.winners.length);
      let odd = pot.amount - share * pot.winners.length; // odd chips go to the winners nearest the button's left
      pot.winners.slice().sort((a, b) => leftOfButton(a) - leftOfButton(b)).forEach((seat) => {
        payouts[seat] += share + (odd-- > 0 ? 1 : 0);
      });
      const names = pot.winners.map((s) => state.seats[s].name).join(" & ");
      const label = pots.length === 1 ? "the pot" : i === 0 ? "the main pot" : "a side pot";
      state.log.push({
        text: pot.eligible.length === 1
          ? names + " takes back " + pot.amount + " nobody could call."
          : names + (pot.winners.length > 1 ? " split " : " wins ") + label + " of " + pot.amount + " with " + CATEGORY_NAME[best.category] + ".",
        fresh: true,
      });
    });
    payouts.forEach((p, seat) => { state.chips[seat] += p; });
    h.result = { uncontested: false, pots, payouts, hands };
    endHand(state);
  }

  function endHand(state) {
    const h = state.hand;
    h.phase = "hand-end";
    h.turnSeat = null;
    const standing = state.chips.filter((c) => c > 0).length;
    const humans = seatsWhere(state, (s) => state.seats[s].type === "human");
    const humansOut = humans.length > 0 && humans.every((s) => state.chips[s] === 0); // nobody left to watch the AIs finish
    if (standing > 1 && state.handNumber < HAND_LIMIT && !humansOut) return;
    state.gameOver = true;
    h.phase = "game-end";
    const top = Math.max(...state.chips);
    state.log.push({ text: "Session over: " + seatsWhere(state, (s) => state.chips[s] === top).map((s) => state.seats[s].name).join(" & ") + " finish with " + top + " chips.", fresh: true });
  }

  // --------------------------------------------------------------------- AI

  function estimateEquity(state, seat, samples) {
    const h = state.hand;
    const rand = state.rng || Math.random;
    const known = new Set(h.holes[seat].concat(h.board).map((c) => c.id));
    const pool = CARDS.buildDeck().filter((c) => !known.has(c.id));
    const opponents = liveSeats(state).length - 1;
    const need = opponents * 2 + 5 - h.board.length;
    let total = 0;
    for (let i = 0; i < samples; i++) {
      for (let k = 0; k < need; k++) {
        const j = k + Math.floor(rand() * (pool.length - k));
        [pool[k], pool[j]] = [pool[j], pool[k]];
      }
      const board = h.board.concat(pool.slice(opponents * 2, need));
      const mine = evaluate(h.holes[seat].concat(board));
      let ties = 0, lost = false;
      for (let o = 0; o < opponents && !lost; o++) {
        const cmp = compare(mine, evaluate([pool[o * 2], pool[o * 2 + 1]].concat(board)));
        if (cmp < 0) lost = true;
        else if (cmp === 0) ties++;
      }
      if (!lost) total += 1 / (ties + 1);
    }
    return total / samples;
  }

  // ponytail: equity against random hands with a pot-odds call and a fixed
  // raise bar; no bluffing, position or opponent modelling. Re-raising stops
  // after two raises a street unless the hand is very strong.
  function aiChooseAction(state, seat) {
    const h = state.hand;
    const legal = legalActions(state, seat);
    const equity = estimateEquity(state, seat, AI_SAMPLES) - RAISE_DISCOUNT * h.raises; // raisers don't hold random hands
    const pot = potTotal(h);
    const strong = equity > 1.25 / liveSeats(state).length + 0.05; // heads-up 0.675, four-way 0.36
    if (legal.canRaise && strong && (h.raises < 2 || equity > 0.8)) {
      const size = Math.max(h.minRaise, Math.round((pot * 0.75) / BIG_BLIND) * BIG_BLIND);
      return { type: "raise", to: Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, h.currentBet + size)) };
    }
    if (legal.canCheck) return { type: "check" };
    return equity >= legal.toCall / (pot + legal.toCall) ? { type: "call" } : { type: "fold" };
  }

  const api = {
    STARTING_CHIPS, SMALL_BLIND, BIG_BLIND, HAND_LIMIT, STREET_NAME, CATEGORY_NAME,
    evaluate, compare, createGame, startHand, legalActions, act, buildPots, potTotal, liveSeats,
    estimateEquity, aiChooseAction,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.HOLDEM = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
