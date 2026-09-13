// Chinese Poker (Pusoy, 13-card variant) engine - fixed 4 seats. One deal,
// each seat privately arranges all 13 cards into front(3)/middle(5)/back(5),
// then every pair of seats is scored row-by-row and the round ends. Standard
// poker hand ranking (Ace high or low for a wheel straight); no suit
// ranking, no royalty bonuses - see README for the full simplification list.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const CATEGORY_NAME = ["High Card", "Pair", "Two Pair", "Trips", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];

  function kCombinations(arr, k) {
    const out = [];
    (function pick(start, chosen) {
      if (chosen.length === k) { out.push(chosen.slice()); return; }
      for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); pick(i + 1, chosen); chosen.pop(); }
    })(0, []);
    return out;
  }

  function groupByRank(cards) {
    const groups = {};
    cards.forEach((c) => { (groups[c.rank] = groups[c.rank] || []).push(c); });
    return groups;
  }

  function isStraight(uniqueRanksAsc) {
    if (uniqueRanksAsc.length !== 5) return { isStraight: false };
    let normal = true;
    for (let i = 1; i < 5; i++) if (uniqueRanksAsc[i] !== uniqueRanksAsc[i - 1] + 1) { normal = false; break; }
    if (normal) return { isStraight: true, highRank: uniqueRanksAsc[4] };
    const wheel = [2, 3, 4, 5, 14];
    if (wheel.every((r, i) => r === uniqueRanksAsc[i])) return { isStraight: true, highRank: 5 }; // ace plays low
    return { isStraight: false };
  }

  // Works for both 3-card (front) and 5-card (middle/back) hands. Returns
  // {category, tiebreak: number[]} on one shared, comparable scale.
  function evaluateHand(cards) {
    const groups = groupByRank(cards);
    const rankCounts = Object.entries(groups)
      .map(([rank, list]) => ({ rank: Number(rank), count: list.length }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);
    const ranksDesc = cards.map((c) => c.rank).sort((a, b) => b - a);

    if (cards.length === 3) {
      if (rankCounts[0].count === 3) return { category: 3, tiebreak: [rankCounts[0].rank] };
      if (rankCounts[0].count === 2) return { category: 1, tiebreak: [rankCounts[0].rank, rankCounts[1].rank] };
      return { category: 0, tiebreak: ranksDesc };
    }

    const flush = new Set(cards.map((c) => c.suit)).size === 1;
    const straightInfo = isStraight(Array.from(new Set(cards.map((c) => c.rank))).sort((a, b) => a - b));

    if (straightInfo.isStraight && flush) return { category: 8, tiebreak: [straightInfo.highRank] };
    if (rankCounts[0].count === 4) return { category: 7, tiebreak: [rankCounts[0].rank, rankCounts[1].rank] };
    if (rankCounts[0].count === 3 && rankCounts[1] && rankCounts[1].count === 2) return { category: 6, tiebreak: [rankCounts[0].rank, rankCounts[1].rank] };
    if (flush) return { category: 5, tiebreak: ranksDesc };
    if (straightInfo.isStraight) return { category: 4, tiebreak: [straightInfo.highRank] };
    if (rankCounts[0].count === 3) return { category: 3, tiebreak: [rankCounts[0].rank, ...ranksDesc.filter((r) => r !== rankCounts[0].rank)] };
    if (rankCounts[0].count === 2 && rankCounts[1] && rankCounts[1].count === 2) {
      const [hi, lo] = [rankCounts[0].rank, rankCounts[1].rank].sort((a, b) => b - a);
      const kicker = ranksDesc.find((r) => r !== hi && r !== lo);
      return { category: 2, tiebreak: [hi, lo, kicker] };
    }
    if (rankCounts[0].count === 2) return { category: 1, tiebreak: [rankCounts[0].rank, ...ranksDesc.filter((r) => r !== rankCounts[0].rank)] };
    return { category: 0, tiebreak: ranksDesc };
  }

  function compareHandStrength(a, b) {
    if (a.category !== b.category) return a.category - b.category;
    for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
      const diff = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }

  function isValidArrangement(front, middle, back) {
    if (front.length !== 3 || middle.length !== 5 || back.length !== 5) return false;
    return compareHandStrength(evaluateHand(front), evaluateHand(middle)) <= 0 &&
      compareHandStrength(evaluateHand(middle), evaluateHand(back)) <= 0;
  }

  function createGame(seatTypes, opts) {
    if (seatTypes.length !== 4) throw new Error("Chinese Poker requires exactly 4 seats");
    const deck = CARDS.shuffle(CARDS.buildDeck(), opts && opts.rng);
    const hands = CARDS.dealEven(deck, 4).map((h) => CARDS.sortByRank(h));
    return {
      game: "chinese-poker",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      hands,
      arrangements: [null, null, null, null],
      scores: [0, 0, 0, 0],
      phase: "arranging",
      gameOver: false,
      log: [{ text: "Cards dealt - arrange your 13 cards into front (3), middle (5), and back (5).", fresh: true }],
    };
  }

  function ownsExactly13(hand, front, middle, back) {
    const combined = [...front, ...middle, ...back];
    if (combined.length !== 13) return false;
    const ids = combined.map((c) => c.id);
    if (new Set(ids).size !== 13) return false;
    return ids.every((id) => hand.some((c) => c.id === id));
  }

  function submitArrangement(state, seat, front, middle, back) {
    if (state.phase !== "arranging") throw new Error("not in the arranging phase");
    if (state.arrangements[seat]) throw new Error("seat already submitted");
    if (!ownsExactly13(state.hands[seat], front, middle, back)) throw new Error("arrangement must use exactly this seat's 13 cards, once each");
    const evaluated = { front: evaluateHand(front), middle: evaluateHand(middle), back: evaluateHand(back) };
    const fouled = !isValidArrangement(front, middle, back);
    state.arrangements[seat] = { front, middle, back, evaluated, fouled };
    state.log.push({ text: state.seats[seat].name + " arranges" + (fouled ? " - FOULED (back/middle/front out of order)" : "") + ".", fresh: true });
    if (state.arrangements.every(Boolean)) resolveShowdown(state);
  }

  function rowResult(a, b, row) {
    if (a.fouled && b.fouled) return 0;
    if (a.fouled) return -1;
    if (b.fouled) return 1;
    const cmp = compareHandStrength(a.evaluated[row], b.evaluated[row]);
    return cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
  }

  function resolveShowdown(state) {
    const ROWS = ["front", "middle", "back"];
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        for (const row of ROWS) {
          const outcome = rowResult(state.arrangements[i], state.arrangements[j], row);
          if (outcome === 0) continue;
          const winner = outcome > 0 ? i : j;
          const loser = outcome > 0 ? j : i;
          state.scores[winner] += 1;
          state.scores[loser] -= 1;
          const winnerArrangement = state.arrangements[winner];
          const loserArrangement = state.arrangements[loser];
          state.log.push({
            text: state.seats[winner].name + " beats " + state.seats[loser].name + " on " + row +
              (loserArrangement.fouled ? " (opponent fouled)" : " (" + CATEGORY_NAME[winnerArrangement.evaluated[row].category] + ")") + ".",
            fresh: true,
          });
        }
      }
    }
    state.phase = "scored";
    state.gameOver = true;
    state.log.push({ text: "Final: " + state.seats.map((s, i) => s.name + " " + (state.scores[i] >= 0 ? "+" : "") + state.scores[i]).join(", ") + ".", fresh: true });
  }

  // --------------------------------------------------------------------- AI

  function aiArrange(hand) {
    let back = null;
    for (const combo of kCombinations(hand, 5)) {
      const evald = evaluateHand(combo);
      if (!back || compareHandStrength(evald, back.evald) > 0) back = { cards: combo, evald };
    }
    const remaining8 = hand.filter((c) => !back.cards.some((b) => b.id === c.id));

    let bestValid = null;
    let bestFallback = null;
    for (const middleCandidate of kCombinations(remaining8, 5)) {
      const frontCandidate = remaining8.filter((c) => !middleCandidate.some((m) => m.id === c.id));
      const middleEval = evaluateHand(middleCandidate);
      const frontEval = evaluateHand(frontCandidate);
      const valid = compareHandStrength(frontEval, middleEval) <= 0;
      if (valid && (!bestValid || compareHandStrength(middleEval, bestValid.middleEval) > 0)) {
        bestValid = { middle: middleCandidate, front: frontCandidate, middleEval, frontEval };
      }
      if (!valid && (!bestFallback || compareHandStrength(frontEval, bestFallback.frontEval) < 0)) {
        bestFallback = { middle: middleCandidate, front: frontCandidate, middleEval, frontEval };
      }
    }
    const chosen = bestValid || bestFallback;
    return { front: chosen.front, middle: chosen.middle, back: back.cards };
  }

  const api = {
    CATEGORY_NAME,
    evaluateHand, compareHandStrength, isValidArrangement,
    createGame, submitArrangement,
    aiArrange,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CHINESE_POKER = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
