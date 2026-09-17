const assert = require("assert");
const tiles = require("../tiles.js");
const trainer = require("../trainer.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const counts = (notations) => tiles.countsFromKinds(notations.split(" ").map(tiles.notationToIndex));
const idx = tiles.notationToIndex;

// 123m 456m 789m, a 1s pair, 5p6p and a stray East: cutting East is tenpai on
// a two-sided 4p/7p wait (8 tiles); cutting anything else stays 1-shanten.
{
  const results = trainer.analyzeDiscards(counts("1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 1s 5p 6p 1z"));
  const best = results[0];
  ok("East is the best cut", best.discard === idx("1z"), best);
  ok("tenpai on 4p/7p with 8 tiles", best.shanten === 0 && best.ukeire === 8 && best.waits.join() === [idx("4p"), idx("7p")].join(), best);
  const cut5p = results.find((r) => r.discard === idx("5p"));
  ok("cutting 5p leaves 1-shanten", cut5p.shanten === 1, cut5p);
  ok("only East counts as best", results.filter((r) => trainer.isBest(results, r)).length === 1);
  ok("every distinct tile in hand is analyzed once", results.length === 13);
}

// Six pairs + two singles: seven pairs (chiitoi) is tenpai after either cut,
// which the standard 4-sets shape alone would never rate that close.
{
  const results = trainer.analyzeDiscards(counts("1m 1m 3m 3m 5m 5m 7p 7p 9p 9p 2s 2s 4s 6z"));
  ok("chiitoi tenpai is recognized", results[0].shanten === 0, results[0]);
  ok("chiitoi tanki wait counts the 3 unseen copies", results[0].ukeire === 3, results[0]);
}

// A tile you hold all four of can't be waited on.
{
  const results = trainer.analyzeDiscards(counts("1m 1m 1m 1m 2m 3m 5p 6p 7p 2s 3s 4s 9s 9s"));
  ok("no result waits on a 5th copy", results.every((r) => r.waits.every((k) => k !== idx("1m"))));
}

for (let i = 0; i < 25; i++) {
  const deal = trainer.dealHand();
  const total = deal.counts.reduce((a, b) => a + b, 0);
  ok("deal " + i + ": 14 tiles incl. the drawn one", total === 14 && deal.counts[deal.drawn] > 0);
  ok("deal " + i + ": best discard is at most 2-shanten", deal.results[0].shanten <= 2);
  ok("deal " + i + ": a wrong answer exists", deal.results.some((r) => !trainer.isBest(deal.results, r)));
  ok("deal " + i + ": sorted by shanten then ukeire", deal.results.every((r, j) => j === 0 ||
    deal.results[j - 1].shanten < r.shanten || (deal.results[j - 1].shanten === r.shanten && deal.results[j - 1].ukeire >= r.ukeire)));
}

console.log("trainer.test.js: " + passed + " assertions passed");
