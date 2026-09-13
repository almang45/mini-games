const assert = require("assert");
const tiles = require("../tiles.js");
const scoreClassical = require("../score-classical.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra || "");
  assert.ok(cond, label);
  passed++;
}
function countsFromNotations(list) {
  const c = new Array(34).fill(0);
  for (const n of list) c[tiles.notationToIndex(n)]++;
  return c;
}
const EAST = tiles.indexOf("z", 1);

// --- chicken hand (no patterns) ---
{
  const concealedCounts = countsFromNotations([
    "2m", "3m", "4m", "5p", "6p", "7p", "2s", "3s", "4s", "3z", "3z", "3z", "9s", "9s",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("s", 4), winBy: "discard",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("chicken hand is valid", !!result);
  ok("chicken hand: concealed-hand double only (discard win)", result.doubles === 1, result);
  ok("chicken hand score = base*2", result.totalScore === 16, result);
}

// --- All Simples, self-drawn, non-dealer ---
{
  const concealedCounts = countsFromNotations([
    "2m", "3m", "4m", "5p", "6p", "7p", "2s", "3s", "4s", "5s", "6s", "7s", "3p", "3p",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("p", 3), winBy: "self-draw",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("all-simples hand valid", !!result);
  ok("has All Simples pattern", result.patterns.some((p) => p.name === "All Simples"), result);
  ok("has Self-Drawn pattern", result.patterns.some((p) => p.name === "Self-Drawn"), result);
}

// --- All Triplets ---
{
  const concealedCounts = countsFromNotations([
    "3m", "3m", "3m", "5s", "5s", "5s", "7p", "7p", "7p", "2m", "2m", "2m", "9s", "9s",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("m", 2), winBy: "discard",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("all-triplets hand valid", !!result);
  ok("has All Triplets pattern", result.patterns.some((p) => p.name === "All Triplets (Peng Peng Hu)"), result);
}

// --- Full Flush ---
{
  const concealedCounts = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "2m", "3m", "4m", "5m", "5m",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("m", 5), winBy: "discard",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("full flush hand valid", !!result);
  ok("has Full Flush pattern (3 doubles)", result.patterns.some((p) => p.name === "Full Flush" && p.doubles === 3), result);
}

// --- Seven Pairs ---
{
  const concealedCounts = countsFromNotations([
    "1m", "1m", "3m", "3m", "5s", "5s", "7s", "7s", "2p", "2p", "1z", "1z", "5z", "5z",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("z", 5), winBy: "self-draw",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("seven pairs valid", !!result);
  ok("seven pairs = 2 doubles + self-drawn 1 double = 3", result.doubles === 3, result);
}

// --- All Honors: instant limit ---
{
  const concealedCounts = countsFromNotations([
    "1z", "1z", "1z", "2z", "2z", "2z", "3z", "3z", "3z", "7z", "7z", "7z", "5z", "5z",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("z", 5), winBy: "discard",
    seatWind: EAST, roundWind: EAST, isDealer: false,
  });
  ok("all honors valid", !!result);
  ok("all honors is limit hand", result.isLimit && result.doubles === 8, result);
  ok("all honors score = base*256 = 2048", result.totalScore === 2048, result);
}

// --- Great Four Winds: instant limit, non-honor pair, dealer doubles payment ---
{
  const concealedCounts = countsFromNotations([
    "1z", "1z", "1z", "2z", "2z", "2z", "3z", "3z", "3z", "4z", "4z", "4z", "5m", "5m",
  ]);
  const result = scoreClassical.evaluateWinClassical({
    concealedCounts, openMelds: [], winTile: tiles.indexOf("m", 5), winBy: "discard",
    seatWind: EAST, roundWind: EAST, isDealer: true,
  });
  ok("great four winds valid", !!result);
  ok("named Great Four Winds (not All Honors, since pair is a simple)", result.patterns.some((p) => p.name === "Great Four Winds"), result);
  ok("dealer limit hand score doubled = 4096", result.totalScore === 4096, result);
}

console.log("score-classical.test.js: " + passed + " assertions passed");
