// Riichi scoring quiz: deals a random winning hand and situation, scores it with
// the table's own yaku/fu engine and point formula, and offers four payments to
// pick from. No DOM dependency - loadable via <script> (global MJ.quiz) or
// require() in Node.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./tiles.js"), require("./yaku-riichi.js"), require("./score-riichi.js"));
  } else {
    root.MJ = Object.assign(root.MJ || {}, { quiz: factory(root.MJ.tiles, root.MJ.yakuRiichi, root.MJ.scoreRiichi) });
  }
})(typeof window !== "undefined" ? window : globalThis, function (tiles, yakuRiichi, scoreRiichi) {
  "use strict";

  const EAST = 27;
  const CHOICE_COUNT = 4;
  const LIMIT_HAN = [5, 6, 8, 11, 13];

  const randInt = (rng, n) => Math.floor(rng() * n);

  function groupKinds(g) {
    return g.type === "run" ? [g.tile, g.tile + 1, g.tile + 2] : [g.tile, g.tile, g.tile];
  }

  // Four random groups and a pair, never more than four copies of a kind.
  function randomShape(rng) {
    for (;;) {
      const groups = [];
      for (let i = 0; i < 4; i++) {
        groups.push(rng() < 0.6
          ? { type: "run", tile: randInt(rng, 3) * 9 + randInt(rng, 7) }
          : { type: "triplet", tile: randInt(rng, tiles.KIND_COUNT) });
      }
      const counts = new Array(tiles.KIND_COUNT).fill(0);
      counts[randInt(rng, tiles.KIND_COUNT)] += 2;
      groups.forEach((g) => groupKinds(g).forEach((k) => counts[k]++));
      if (counts.every((c) => c <= 4)) return { groups, counts };
    }
  }

  function sevenPairs(rng) {
    const kinds = tiles.shuffle([...Array(tiles.KIND_COUNT).keys()], rng).slice(0, 7);
    return tiles.countsFromKinds(kinds.concat(kinds));
  }

  // Tsumo answers read "dealer pays / each non-dealer pays", as in guide.html's scoring table.
  function paymentLabel(score, isDealer, winBy) {
    const p = score.payments;
    if (winBy === "ron") return String(p.discarderPays);
    return isDealer ? p.eachPays + " all" : p.dealerPays + " / " + p.eachPays;
  }

  // Wrong answers are the nearest han/fu slips first, then limit hands when those run out.
  function buildChoices(han, fu, isDealer, winBy, rng) {
    const option = (h, f) => {
      const score = scoreRiichi.computeScore(h, f, isDealer, winBy);
      return { label: paymentLabel(score, isDealer, winBy), total: score.total };
    };
    const answer = option(han, fu);
    const fus = fu === 25 ? [25, 30, 40] : [fu - 10, fu, fu + 10, fu + 20].filter((f) => f >= (winBy === "ron" ? 30 : 20));
    const near = [];
    [han - 1, han, han + 1].filter((h) => h >= 1).forEach((h) => fus.forEach((f) => near.push(option(h, f))));
    const picked = [answer];
    const add = (o) => { if (picked.length < CHOICE_COUNT && !picked.some((p) => p.label === o.label)) picked.push(o); };
    tiles.shuffle(near, rng).forEach(add);
    LIMIT_HAN.forEach((h) => add(option(h, 0)));
    return { answer: answer.label, choices: picked.sort((a, b) => a.total - b.total).map((o) => o.label) };
  }

  function tryDeal(rng) {
    let counts, openMelds = [];
    if (rng() < 0.08) {
      counts = sevenPairs(rng);
    } else {
      const shape = randomShape(rng);
      counts = shape.counts;
      if (rng() < 0.35) {
        openMelds = tiles.shuffle(shape.groups.slice(), rng).slice(0, 1 + randInt(rng, 2))
          .map((g) => ({ type: g.type === "run" ? "chi" : "pon", tiles: groupKinds(g) }));
      }
    }
    const concealedCounts = counts.slice();
    openMelds.forEach((m) => m.tiles.forEach((k) => concealedCounts[k]--));
    const concealed = tiles.kindsFromCounts(concealedCounts);
    const unseen = [];
    counts.forEach((c, kind) => { for (let n = c; n < 4; n++) unseen.push(kind); });

    const deal = {
      concealedCounts,
      openMelds,
      winTile: concealed[randInt(rng, concealed.length)],
      winBy: rng() < 0.5 ? "tsumo" : "ron",
      seatWind: EAST + randInt(rng, 4),
      roundWind: EAST + (rng() < 0.7 ? 0 : 1),
      riichi: openMelds.length === 0 && rng() < 0.5,
      doraIndicator: unseen[randInt(rng, unseen.length)],
    };
    const result = yakuRiichi.evaluateWin({
      concealedCounts, openMelds, winTile: deal.winTile, winBy: deal.winBy, seatWind: deal.seatWind, roundWind: deal.roundWind,
      flags: { riichi: deal.riichi }, doraIndicators: [deal.doraIndicator], uraDoraIndicators: [],
    });
    if (!result) return null;
    deal.isDealer = deal.seatWind === EAST;
    deal.result = result;
    deal.score = scoreRiichi.computeScore(result.han, result.fu, deal.isDealer, deal.winBy);
    return Object.assign(deal, buildChoices(result.han, result.fu, deal.isDealer, deal.winBy, rng));
  }

  function dealQuestion(rng) {
    for (;;) {
      const deal = tryDeal(rng || Math.random);
      if (deal) return deal;
    }
  }

  // Plain-language arithmetic from han/fu to what each player pays.
  function paymentSteps(han, fu, isDealer, winBy) {
    const base = scoreRiichi.basePoints(han, fu);
    const limit = scoreRiichi.limitName(han);
    const raw = fu * Math.pow(2, han + 2);
    const round = (n) => n + (scoreRiichi.round100(n) === n ? "" : " → " + scoreRiichi.round100(n));
    const steps = [limit
      ? limit + ": base points " + base
      : "Base points: " + fu + " fu × 2^" + (han + 2) + " = " + raw + (raw > base ? ", capped at mangan (" + base + ")" : "")];
    if (winBy === "ron") {
      const multiplier = isDealer ? 6 : 4;
      steps.push((isDealer ? "Dealer" : "Non-dealer") + " ron: the discarder pays base × " + multiplier + " = " + round(base * multiplier));
    } else if (isDealer) {
      steps.push("Dealer tsumo: all three pay base × 2 = " + round(base * 2));
    } else {
      steps.push("Tsumo: the dealer pays base × 2 = " + round(base * 2) + "; the other two pay base = " + round(base));
    }
    return steps;
  }

  return { dealQuestion, paymentLabel, paymentSteps, buildChoices, CHOICE_COUNT };
});
