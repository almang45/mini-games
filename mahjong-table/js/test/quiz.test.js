const assert = require("assert");
const tiles = require("../tiles.js");
const scoreRiichi = require("../score-riichi.js");
const quiz = require("../quiz.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// mulberry32, so failures reproduce
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- payment labels follow the guide's "dealer / non-dealer" order ---
ok("non-dealer ron", quiz.paymentLabel(scoreRiichi.computeScore(3, 30, false, "ron"), false, "ron") === "3900");
ok("non-dealer tsumo", quiz.paymentLabel(scoreRiichi.computeScore(3, 30, false, "tsumo"), false, "tsumo") === "2000 / 1000");
ok("dealer tsumo", quiz.paymentLabel(scoreRiichi.computeScore(2, 30, true, "tsumo"), true, "tsumo") === "1000 all");

// --- arithmetic steps ---
{
  const steps = quiz.paymentSteps(3, 30, false, "ron");
  ok("3 han 30 fu base", steps[0] === "Base points: 30 fu × 2^5 = 960", steps);
  ok("ron rounds up", steps[1] === "Non-dealer ron: the discarder pays base × 4 = 3840 → 3900", steps);
  ok("4 han 40 fu caps", quiz.paymentSteps(4, 40, true, "tsumo")[0] === "Base points: 40 fu × 2^6 = 2560, capped at mangan (2000)");
  ok("limit hands name the limit", quiz.paymentSteps(6, 30, false, "tsumo")[0] === "Haneman: base points 3000");
  ok("non-dealer tsumo split", quiz.paymentSteps(1, 30, false, "tsumo")[1] === "Tsumo: the dealer pays base × 2 = 480 → 500; the other two pay base = 240 → 300");
  ok("dealer tsumo exact", quiz.paymentSteps(5, 0, true, "tsumo")[1] === "Dealer tsumo: all three pay base × 2 = 4000");
}

// --- choices ---
{
  const yakuman = quiz.buildChoices(13, 0, false, "ron", makeRng(1));
  ok("yakuman still gets four distinct choices", new Set(yakuman.choices).size === 4 && yakuman.choices.includes("32000"), yakuman);
  const chiitoi = quiz.buildChoices(2, 25, false, "ron", makeRng(2));
  ok("seven pairs answer is 1600", chiitoi.answer === "1600" && chiitoi.choices.includes("1600"), chiitoi);
  ok("ron choices never use 20 fu", !quiz.buildChoices(1, 30, false, "ron", makeRng(3)).choices.includes("700"));
}

// --- dealt questions are real, consistent wins ---
{
  const rng = makeRng(20260914);
  const seen = { open: 0, chiitoi: 0, tsumo: 0, dealer: 0, riichi: 0, belowMangan: 0, yakumanOrLimit: 0 };
  const N = 400;
  for (let i = 0; i < N; i++) {
    const q = quiz.dealQuestion(rng);
    const full = q.concealedCounts.slice();
    q.openMelds.forEach((m) => m.tiles.forEach((k) => full[k]++));
    const tileTotal = full.reduce((a, b) => a + b, 0);
    if (!(tileTotal === 14 && full.every((c) => c >= 0 && c <= 4))) ok("14 tiles, at most 4 of a kind #" + i, false, q);
    if (full[q.doraIndicator] >= 4) ok("dora indicator is an unseen tile #" + i, false, q);
    if (q.concealedCounts[q.winTile] < 1) ok("win tile is in the concealed hand #" + i, false, q);
    if (q.riichi && q.openMelds.length) ok("open hands never riichi #" + i, false, q);
    if (q.isDealer !== (q.seatWind === 27)) ok("dealer sits East #" + i, false, q);
    const s = scoreRiichi.computeScore(q.result.han, q.result.fu, q.isDealer, q.winBy);
    if (s.total !== q.score.total) ok("score matches the formula #" + i, false, q);
    if (q.choices.length !== 4 || new Set(q.choices).size !== 4 || !q.choices.includes(q.answer)) ok("four distinct choices incl. the answer #" + i, false, q);
    if (q.answer !== quiz.paymentLabel(q.score, q.isDealer, q.winBy)) ok("answer label matches the score #" + i, false, q);
    const rawFu = q.result.fuItems.reduce((a, item) => a + item.fu, 0);
    const fuOk = q.result.isYakuman ? q.result.fu === 0 : rawFu === 25 ? q.result.fu === 25 : q.result.fu === Math.ceil(rawFu / 10) * 10;
    if (!fuOk) ok("fu items add up to the fu #" + i, false, q.result);
    if (q.winBy === "ron" && q.openMelds.length && q.result.fu < 30) ok("open ron is at least 30 fu #" + i, false, q.result);
    passed += 11;
    if (q.openMelds.length) seen.open++;
    if (q.result.fuItems.some((item) => item.label.startsWith("Chiitoitsu"))) seen.chiitoi++;
    if (q.winBy === "tsumo") seen.tsumo++;
    if (q.isDealer) seen.dealer++;
    if (q.riichi) seen.riichi++;
    if (q.result.han < 5 && q.score.total < (q.isDealer ? 12000 : 8000)) seen.belowMangan++;
    else seen.yakumanOrLimit++;
  }
  ok("some hands are open", seen.open > N * 0.05, seen);
  ok("some hands are seven pairs", seen.chiitoi > 0, seen);
  ok("tsumo and ron both show up", seen.tsumo > N * 0.3 && seen.tsumo < N * 0.7, seen);
  ok("dealer wins show up", seen.dealer > N * 0.1, seen);
  ok("riichi shows up", seen.riichi > N * 0.2, seen);
  ok("most questions are below mangan, where fu matters", seen.belowMangan > N * 0.5, seen);
  console.log("distribution:", JSON.stringify(seen));
}

console.log("quiz.test.js: " + passed + " assertions passed");
