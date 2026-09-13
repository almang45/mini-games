const assert = require("assert");
const tiles = require("../tiles.js");
const yakuRiichi = require("../yaku-riichi.js");
const scoreRiichi = require("../score-riichi.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra || "");
  assert.ok(cond, label + (extra ? " -- " + JSON.stringify(extra) : ""));
  passed++;
}

function countsFromNotations(list) {
  const c = new Array(34).fill(0);
  for (const n of list) c[tiles.notationToIndex(n)]++;
  return c;
}
const EAST = tiles.indexOf("z", 1);

function hanNames(result) { return result.yaku.map((y) => y.name); }

// --- canonical point table sanity (formula validation) ---
{
  ok("30fu3han non-dealer ron = 3900", scoreRiichi.computeScore(3, 30, false, "ron").total === 3900);
  ok("30fu3han dealer ron = 5800", scoreRiichi.computeScore(3, 30, true, "ron").total === 5800);
  ok("40fu3han non-dealer ron = 5200", scoreRiichi.computeScore(3, 40, false, "ron").total === 5200);
  ok("30fu4han non-dealer ron = 7700", scoreRiichi.computeScore(4, 30, false, "ron").total === 7700);
  ok("mangan non-dealer ron = 8000", scoreRiichi.computeScore(5, 30, false, "ron").total === 8000);
  ok("mangan dealer ron = 12000", scoreRiichi.computeScore(5, 30, true, "ron").total === 12000);
  const manganTsumoNonDealer = scoreRiichi.computeScore(5, 30, false, "tsumo");
  ok("mangan non-dealer tsumo = 2000/4000", manganTsumoNonDealer.payments.dealerPays === 4000 && manganTsumoNonDealer.payments.eachPays === 2000);
  const manganTsumoDealer = scoreRiichi.computeScore(5, 30, true, "tsumo");
  ok("mangan dealer tsumo = 4000 all", manganTsumoDealer.payments.eachPays === 4000 && manganTsumoDealer.total === 12000);
  ok("yakuman non-dealer ron = 32000", scoreRiichi.computeScore(13, 0, false, "ron").total === 32000);
  ok("yakuman dealer ron = 48000", scoreRiichi.computeScore(13, 0, true, "ron").total === 48000);
}

// --- Riichi + Pinfu + Tanyao, ryanmen ron ---
{
  const concealedCounts = countsFromNotations([
    "2m", "3m", "4m", "4m", "5m", "6m", "6p", "7p", "8p",
    "5s", "5s", "2s", "3s", "4s",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [],
    winTile: tiles.indexOf("s", 2),
    winBy: "ron",
    seatWind: EAST,
    roundWind: EAST,
    flags: { riichi: true },
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("pinfu/tanyao/riichi hand is a valid win", !!result);
  ok("pinfu/tanyao/riichi han = 3", result.han === 3, result);
  ok("pinfu ron fu = 30", result.fu === 30, result);
  ok("includes Pinfu", hanNames(result).includes("Pinfu"), result);
  ok("includes Tanyao (All Simples)", hanNames(result).includes("Tanyao (All Simples)"), result);
  ok("includes Riichi", hanNames(result).includes("Riichi"), result);
}

// --- open Yakuhai-only hand (pon of Chun), tsumo ---
{
  const concealedCounts = countsFromNotations([
    "2m", "3m", "4m", "5p", "6p", "7p", "9s", "9s", "9s", "3p", "3p",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [{ type: "pon", tiles: [33, 33, 33], concealed: false }],
    winTile: tiles.indexOf("s", 9),
    winBy: "tsumo",
    seatWind: EAST,
    roundWind: EAST,
    flags: {},
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("open yakuhai hand is a valid win", !!result);
  ok("yakuhai-only han = 1", result.han === 1, result);
  ok("fu = 40 (20 base + 4 open-honor-pon + 8 concealed-terminal-triplet + 2 tsumo)", result.fu === 40, result);
  ok("no menzen tsumo on open hand", !hanNames(result).includes("Menzen Tsumo"), result);
}

// --- Toitoitsu + Sanankou (shanpon ron, one triplet opened by the ron tile) ---
{
  const concealedCounts = countsFromNotations([
    "3m", "3m", "3m", "5s", "5s", "5s", "7p", "7p", "7p", "2m", "2m", "2m", "9s", "9s",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [],
    winTile: tiles.indexOf("m", 2),
    winBy: "ron",
    seatWind: EAST,
    roundWind: EAST,
    flags: {},
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("toitoitsu/sanankou hand is a valid win", !!result);
  ok("toitoitsu+sanankou han = 4", result.han === 4, result);
  ok("fu = 50", result.fu === 50, result);
  ok("includes Toitoitsu", hanNames(result).includes("Toitoitsu (All Triplets)"), result);
  ok("includes Sanankou", hanNames(result).includes("Sanankou (Three Concealed Triplets)"), result);
  const sc = scoreRiichi.computeScore(result.han, result.fu, false, "ron");
  ok("4han50fu caps to mangan (8000)", sc.total === 8000, sc);
}

// --- Suuankou (four concealed triplets, tanki wait on the pair) — yakuman ---
{
  const concealedCounts = countsFromNotations([
    "3m", "3m", "3m", "5s", "5s", "5s", "7p", "7p", "7p", "2m", "2m", "2m", "9s", "9s",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [],
    winTile: tiles.indexOf("s", 9), // completes the pair (tanki), leaving all 4 triplets untouched
    winBy: "ron",
    seatWind: EAST,
    roundWind: EAST,
    flags: {},
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("suuankou tanki is a valid win", !!result);
  ok("suuankou is yakuman (han=13)", result.isYakuman && result.han === 13, result);
}

// --- Chiitoitsu ---
{
  const concealedCounts = countsFromNotations([
    "1m", "1m", "3m", "3m", "5s", "5s", "7s", "7s", "2p", "2p", "1z", "1z", "5z", "5z",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [],
    winTile: tiles.indexOf("z", 5),
    winBy: "ron",
    seatWind: EAST,
    roundWind: EAST,
    flags: { riichi: true },
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("chiitoitsu is a valid win", !!result);
  ok("chiitoitsu + riichi han = 3", result.han === 3, result);
  ok("chiitoitsu fu = 25", result.fu === 25, result);
}

// --- Kokushi Musou ---
{
  const concealedCounts = countsFromNotations([
    "1m", "9m", "1s", "9s", "1p", "9p", "1z", "2z", "3z", "4z", "5z", "6z", "7z", "7z",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("z", 7), winBy: "ron",
    seatWind: EAST, roundWind: EAST, flags: {}, doraIndicators: [], uraDoraIndicators: [],
  });
  ok("kokushi is a valid win", !!result);
  ok("kokushi is yakuman", result.isYakuman && result.han === 13, result);
}

// --- No-yaku hand must be rejected ---
{
  // open hand (chi called), all runs, non-yakuhai pair, but NO menzen (so no pinfu) and no other yaku
  const concealedCounts = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7p", "8p", "9p", "3s", "3s",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts,
    openMelds: [{ type: "chi", tiles: [tiles.indexOf("s", 4), tiles.indexOf("s", 5), tiles.indexOf("s", 6)], concealed: false }],
    winTile: tiles.indexOf("p", 9),
    winBy: "ron",
    seatWind: EAST,
    roundWind: EAST,
    flags: {},
    doraIndicators: [],
    uraDoraIndicators: [],
  });
  ok("shape-complete but yaku-less hand is rejected", result === null);
}

// --- dora counting ---
{
  // indicator 1m -> dora is 2m; hand holds three 2m
  const concealedCounts = countsFromNotations([
    "2m", "2m", "2m", "4p", "5p", "6p", "7s", "8s", "9s", "1z", "1z", "1z", "6z", "6z",
  ]);
  const result = yakuRiichi.evaluateWin({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("z", 6), winBy: "tsumo",
    seatWind: EAST, roundWind: EAST, flags: {}, doraIndicators: [tiles.indexOf("m", 1)], uraDoraIndicators: [],
  });
  ok("dora hand is a valid win (yakuhai east + tsumo)", !!result);
  const dora = result.yaku.find((y) => y.name === "Dora");
  ok("counts 3 dora from three 2m tiles", dora && dora.han === 3, result);
}

console.log("yaku-score.test.js: " + passed + " assertions passed");
