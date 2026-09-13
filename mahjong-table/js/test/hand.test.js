const assert = require("assert");
const tiles = require("../tiles.js");
const hand = require("../hand.js");

function countsFromNotations(list) {
  const c = new Array(34).fill(0);
  for (const n of list) c[tiles.notationToIndex(n)]++;
  return c;
}

let passed = 0;
function ok(label, cond) {
  assert.ok(cond, label);
  passed++;
}

// --- deck sanity ---
{
  const wall = tiles.buildWall();
  ok("wall has 136 tiles", wall.length === 136);
  const counts = new Array(34).fill(0);
  for (const t of wall) counts[t.kind]++;
  ok("each kind has 4 copies", counts.every((c) => c === 4));
}

// --- isCompleteStandard: simple valid hand ---
{
  const c = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
    "1s", "2s", "3s", "5p", "5p",
  ]);
  ok("valid run-heavy hand is complete", hand.isCompleteStandard(c, 4));
}

// --- isCompleteStandard: invalid hand ---
{
  const c = countsFromNotations([
    "1m", "2m", "4m", "5m", "7m", "8m", "9m",
    "1s", "2s", "3s", "5p", "5p", "1z", "2z",
  ]);
  ok("scattered hand is not complete", !hand.isCompleteStandard(c, 4));
}

// --- decomposeConcealed enumerates multiple shapes for an ambiguous hand ---
{
  // 222333444 m -> could be read as three triplets, or as three identical runs 234x3
  const c = countsFromNotations([
    "2m", "2m", "2m", "3m", "3m", "3m", "4m", "4m", "4m",
    "1s", "1s", "1s", "9p", "9p",
  ]);
  const decomps = hand.decomposeConcealed(c, 4);
  ok("ambiguous hand has >= 2 decompositions", decomps.length >= 2);
}

// --- chiitoitsu ---
{
  const c = countsFromNotations([
    "1m", "1m", "3m", "3m", "5s", "5s", "7s", "7s",
    "2p", "2p", "1z", "1z", "5z", "5z",
  ]);
  ok("seven distinct pairs is chiitoi", hand.isChiitoi(c));
  ok("chiitoi shanten of complete chiitoi hand minus context is -1 equivalent (0 pairs short)",
    hand.chiitoiShanten(c) === -1); // 14-tile hand fed to the "shanten" formula reads as "beyond tenpai"
}
{
  // four-of-a-kind cannot count as two pairs for chiitoi
  const c = countsFromNotations([
    "1m", "1m", "1m", "1m", "3m", "3m", "5s", "5s", "7s", "7s",
    "2p", "2p", "1z", "1z",
  ]);
  ok("quad does not satisfy chiitoi", !hand.isChiitoi(c));
}

// --- kokushi ---
{
  const c = countsFromNotations([
    "1m", "9m", "1s", "9s", "1p", "9p",
    "1z", "2z", "3z", "4z", "5z", "6z", "7z", "7z",
  ]);
  ok("thirteen orphans + pair is kokushi", hand.isKokushi(c));
  ok("kokushi shanten of complete kokushi hand is -1", hand.kokushiShanten(c) === -1);
}

// --- shanten: hand-picked tenpai / shanten examples ---
{
  // 123m 456m 789m 123s + lone 5p -> tanki wait on 5p, tenpai (shanten 0)
  const c = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
    "1s", "2s", "3s", "5p",
  ]);
  ok("4 sets + lone tile is tenpai (tanki)", hand.standardShanten(c, 4) === 0);
}
{
  // 123m 456m 789m 1s2s + 4p5p -> two ryanmen-ish partials, no pair reserved: 1-shanten
  const c = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
    "1s", "2s", "4p", "5p",
  ]);
  ok("3 sets + 2 open partials, no pair is 1-shanten", hand.standardShanten(c, 4) === 1);
}
{
  // 123m 456m 789m + pair 5s5s + isolated 1p 9z -> 1-shanten (per worked derivation)
  const c = countsFromNotations([
    "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m",
    "5s", "5s", "1p", "7z",
  ]);
  ok("3 sets + pair + 2 isolated tiles is 1-shanten", hand.standardShanten(c, 4) === 1);
}
{
  // 6 pairs + 1 isolated kind -> chiitoi tenpai
  const c = countsFromNotations([
    "1m", "1m", "3m", "3m", "5s", "5s", "7s", "7s",
    "2p", "2p", "1z", "1z", "6z",
  ]);
  ok("6 pairs + 1 single is chiitoi-tenpai", hand.chiitoiShanten(c) === 0);
  ok("overall shanten picks up chiitoi tenpai", hand.shanten(c, { allowChiitoi: true }) === 0);
}
{
  // 12 of 13 kokushi kinds present, one paired -> kokushi tenpai
  const c = countsFromNotations([
    "1m", "9m", "1s", "9s", "1p", "9p",
    "1z", "2z", "3z", "4z", "5z", "6z", "6z",
  ]);
  ok("12/13 orphans + 1 pair is kokushi-tenpai", hand.kokushiShanten(c) === 0);
}

// --- BIG automated oracle test ---
// Property: removing any single tile from a valid complete standard hand must
// yield a tenpai (shanten === 0) 13-tile hand, by definition of tenpai.
{
  function randomCompleteHand(rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const counts = new Array(34).fill(0);
      let ok2 = true;
      for (let s = 0; s < 4; s++) {
        if (rng() < 0.5) {
          const k = Math.floor(rng() * 34);
          counts[k] += 3;
        } else {
          const suit = ["m", "s", "p"][Math.floor(rng() * 3)];
          const start = 1 + Math.floor(rng() * 7);
          const base = tiles.indexOf(suit, start);
          counts[base]++; counts[base + 1]++; counts[base + 2]++;
        }
      }
      const pairK = Math.floor(rng() * 34);
      counts[pairK] += 2;
      if (counts.every((c) => c <= 4)) {
        ok2 = hand.isCompleteStandard(counts, 4);
        if (ok2) return counts;
      }
    }
    return null;
  }

  let seed = 42;
  function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000000) / 1000000; }

  let trials = 0, checked = 0;
  for (let i = 0; i < 400; i++) {
    const hand14 = randomCompleteHand(rng);
    if (!hand14) continue;
    trials++;
    assert.ok(hand.isCompleteStandard(hand14, 4), "constructed hand must be complete");
    for (let k = 0; k < 34; k++) {
      if (hand14[k] === 0) continue;
      const reduced = hand14.slice();
      reduced[k]--;
      const sh = hand.standardShanten(reduced, 4);
      assert.strictEqual(sh, 0, "removing tile " + tiles.indexToNotation(k) + " from a complete hand must be tenpai, got shanten=" + sh + " for hand " + hand14);
      checked++;
    }
  }
  ok("oracle test ran (" + trials + " hands, " + checked + " removals checked)", trials > 50 && checked > 300);
}

console.log("hand.test.js: " + passed + " assertions passed");
