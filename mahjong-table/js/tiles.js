// Tile model shared by every ruleset. No DOM dependency: loadable via <script> in the
// browser (attaches to global MJ) or via require() in Node for testing.
(function (root) {
  "use strict";

  // Kind index layout (34 kinds, 4 copies each = 136 tiles):
  //   0-8   : 1m-9m  (characters)
  //   9-17  : 1s-9s  (bamboo)
  //   18-26 : 1p-9p  (circles)
  //   27-30 : East, South, West, North (winds)
  //   31-33 : Haku (white), Hatsu (green), Chun (red) (dragons)
  const KIND_COUNT = 34;
  const SUIT_BASE = { m: 0, s: 9, p: 18 };
  const HONOR_BASE = 27;
  const HONOR_NAMES = ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"];
  const HONOR_GLYPH = ["\u{1F000}", "\u{1F001}", "\u{1F002}", "\u{1F003}", "\u{1F006}", "\u{1F005}", "\u{1F004}"];
  const SUIT_GLYPH_BASE = {
    m: 0x1f007, // 1F007..1F00F = 1-9 characters
    s: 0x1f010, // 1F010..1F018 = 1-9 bamboo
    p: 0x1f019, // 1F019..1F021 = 1-9 circles
  };

  function indexOf(suit, rank) {
    if (suit === "z") return HONOR_BASE + (rank - 1);
    return SUIT_BASE[suit] + (rank - 1);
  }

  function notationToIndex(n) {
    const rank = parseInt(n[0], 10);
    const suit = n[1];
    return indexOf(suit, rank);
  }

  function indexToNotation(i) {
    if (i >= HONOR_BASE) return (i - HONOR_BASE + 1) + "z";
    if (i >= SUIT_BASE.p) return (i - SUIT_BASE.p + 1) + "p";
    if (i >= SUIT_BASE.s) return (i - SUIT_BASE.s + 1) + "s";
    return (i - SUIT_BASE.m + 1) + "m";
  }

  function suitOf(i) {
    if (i >= HONOR_BASE) return "z";
    if (i >= SUIT_BASE.p) return "p";
    if (i >= SUIT_BASE.s) return "s";
    return "m";
  }

  function rankOf(i) {
    if (i >= HONOR_BASE) return i - HONOR_BASE + 1;
    if (i >= SUIT_BASE.p) return i - SUIT_BASE.p + 1;
    if (i >= SUIT_BASE.s) return i - SUIT_BASE.s + 1;
    return i - SUIT_BASE.m + 1;
  }

  function isHonor(i) { return i >= HONOR_BASE; }
  function isTerminal(i) { return !isHonor(i) && (rankOf(i) === 1 || rankOf(i) === 9); }
  function isTerminalOrHonor(i) { return isHonor(i) || isTerminal(i); }
  function isSimple(i) { return !isTerminalOrHonor(i); }
  function isDragon(i) { return i >= 31 && i <= 33; }
  function isWind(i) { return i >= 27 && i <= 30; }

  function glyphOf(i) {
    if (isHonor(i)) return HONOR_GLYPH[i - HONOR_BASE];
    const suit = suitOf(i);
    return String.fromCodePoint(SUIT_GLYPH_BASE[suit] + (rankOf(i) - 1));
  }

  // Filenames for the real tile artwork in shared/assets/tiles/ (CC BY-SA 4.0,
  // see that folder's CREDITS.md). Honor order matches HONOR_NAMES: the last
  // three are Haku/white, Hatsu/green, Chun/red - deliberately NOT numeric
  // order, since that's how the source artwork is labeled upstream.
  const HONOR_ASSET = ["wind-east", "wind-south", "wind-west", "wind-north", "dragon-white", "dragon-green", "dragon-red"];
  const SUIT_ASSET_PREFIX = { m: "man", s: "sou", p: "pin" };

  function assetOf(i) {
    if (isHonor(i)) return HONOR_ASSET[i - HONOR_BASE] + ".svg";
    return SUIT_ASSET_PREFIX[suitOf(i)] + rankOf(i) + ".svg";
  }

  function nameOf(i) {
    if (isHonor(i)) return HONOR_NAMES[i - HONOR_BASE];
    return rankOf(i) + " " + ({ m: "Characters", s: "Bamboo", p: "Circles" })[suitOf(i)];
  }

  // A "tile" as dealt/held is {kind, id} - id distinguishes the 4 physical copies
  // (needed for dora-indicator lookups and animations), kind is the 0-33 index.
  function buildWall() {
    const wall = [];
    let id = 0;
    for (let k = 0; k < KIND_COUNT; k++) {
      for (let c = 0; c < 4; c++) wall.push({ kind: k, id: id++ });
    }
    return wall;
  }

  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function countsFromKinds(kinds) {
    const counts = new Array(KIND_COUNT).fill(0);
    for (const k of kinds) counts[k]++;
    return counts;
  }

  function kindsFromCounts(counts) {
    const kinds = [];
    for (let i = 0; i < KIND_COUNT; i++) for (let c = 0; c < counts[i]; c++) kinds.push(i);
    return kinds;
  }

  function cloneCounts(counts) { return counts.slice(); }

  function totalCount(counts) { return counts.reduce((a, b) => a + b, 0); }

  // Next tile kind in "dora indicator -> dora" progression (wraps within suit/honor group).
  function nextDoraKind(indicatorKind) {
    if (isHonor(indicatorKind)) {
      const windCycle = [27, 28, 29, 30];
      const dragonCycle = [31, 32, 33];
      if (isWind(indicatorKind)) return windCycle[(windCycle.indexOf(indicatorKind) + 1) % 4];
      return dragonCycle[(dragonCycle.indexOf(indicatorKind) + 1) % 3];
    }
    const suit = suitOf(indicatorKind);
    const rank = rankOf(indicatorKind);
    const nextRank = rank === 9 ? 1 : rank + 1;
    return indexOf(suit, nextRank);
  }

  const api = {
    KIND_COUNT,
    HONOR_BASE,
    indexOf,
    notationToIndex,
    indexToNotation,
    suitOf,
    rankOf,
    isHonor,
    isTerminal,
    isTerminalOrHonor,
    isSimple,
    isDragon,
    isWind,
    glyphOf,
    assetOf,
    nameOf,
    buildWall,
    shuffle,
    countsFromKinds,
    kindsFromCounts,
    cloneCounts,
    totalCount,
    nextDoraKind,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MJ = Object.assign(root.MJ || {}, { tiles: api });
  }
})(typeof window !== "undefined" ? window : globalThis);
