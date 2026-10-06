const assert = require("assert");
const D = require("../dots-boxes.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// mulberry32, as the other games' tests use, so random games are repeatable.
function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { P1, P2 } = D;

// A game with the given lines already drawn (by nobody in particular), P1 to move.
function drawn(w, h, lines) {
  const s = D.createGame(w, h);
  lines.forEach((l) => { s.lines[l] = P2; });
  return s;
}

// ---- rules -----------------------------------------------------------------------

(function geometryTests() {
  const g = D.geometry(4, 3);
  ok("4x3 boxes: 4 rows of 4 lines across, 3 rows of 5 down", g.lineCount === 4 * 4 + 3 * 5 && g.boxCount === 12);
  ok("edge lines touch one box, inner lines two", g.lineBoxes[g.hLine(0, 0)].length === 1 && g.lineBoxes[g.hLine(1, 0)].length === 2 &&
    g.lineBoxes[g.vLine(0, 0)].length === 1 && g.lineBoxes[g.vLine(0, 1)].length === 2);
  ok("info maps back", ["h", "v"].every((dir) => {
    const l = dir === "h" ? g.hLine(2, 3) : g.vLine(1, 4);
    const i = g.info(l);
    return i.dir === dir && (dir === "h" ? i.r === 2 && i.c === 3 : i.r === 1 && i.c === 4);
  }));
  assert.throws(() => D.createGame(0, 3), /out of range/);
})();

(function playTests() {
  const s = D.createGame(2, 1);
  const g = D.geometry(2, 1);
  D.play(s, g.hLine(0, 0));
  ok("no box: the turn passes", s.turn === P2);
  assert.throws(() => D.play(s, g.hLine(0, 0)), /illegal/);
  assert.throws(() => D.play(s, 99), /illegal/);
  D.play(s, g.hLine(1, 0));
  D.play(s, g.vLine(0, 0));
  ok("three sides drawn, P2 to move", s.turn === P2 && s.score[P2] === 0);
  ok("the fourth side is a capture", D.captures(g, s.lines, g.vLine(0, 1)) && !D.isSafe(g, s.lines, g.vLine(0, 1)));
  ok("completing a box scores it and moves again", D.play(s, g.vLine(0, 1)) === 1 && s.boxes[0] === P2 && s.score[P2] === 1 && s.turn === P2);
  ok("undo takes it back", D.undo(s) && s.boxes[0] === 0 && s.score[P2] === 0 && s.turn === P2);

  // One line finishing two boxes.
  const two = drawn(2, 1, [0, 1, 2, 3, 4, 6]);
  ok("one line, two boxes", D.play(two, 5) === 2 && two.score[P1] === 2 && two.gameOver && two.winner === P1);
  assert.throws(() => D.play(two, 0), /over/);
  ok("undo reopens the game", D.undo(two) && !two.gameOver && two.winner === null && two.score[P1] === 0);

  // Each player sets up a box for the other; the middle line then takes both.
  const g2 = D.geometry(2, 1);
  const both = D.createGame(2, 1);
  [g2.hLine(0, 0), g2.hLine(1, 1), g2.hLine(1, 0), g2.vLine(0, 2), g2.vLine(0, 0), g2.hLine(0, 1)].forEach((l) => D.play(both, l));
  ok("the middle line finishes both", both.turn === P1 && D.play(both, g2.vLine(0, 1)) === 2 && both.winner === P1);
})();

// ---- chains ------------------------------------------------------------------------

(function chainTests() {
  const V = (spec) => D.chainValue(spec.map((x) => ({ loop: x[0] === "L", size: +x.slice(1) })));
  ok("opening a lone 3-chain loses 3", V(["C3"]) === -3);
  ok("a 2-chain loses 2", V(["C2"]) === -2);
  ok("a 4-loop loses 4", V(["L4"]) === -4);
  ok("two 1-chains: even", V(["C1", "C1"]) === 0);
  ok("two 3-chains: the controller keeps control, net 2", V(["C3", "C3"]) === -2);
  ok("three 3-chains: net 1", V(["C3", "C3", "C3"]) === -1);
  ok("order doesn't matter", V(["C3", "L4", "C1"]) === V(["C1", "C3", "L4"]));

  // 3x1 with every top and bottom drawn: one chain of three, open at both ends.
  const g = D.geometry(3, 1);
  const strip = drawn(3, 1, [0, 1, 2, 3, 4, 5]).lines;
  const c = D.components(g, strip);
  ok("a strip is one 3-chain", c.length === 1 && !c[0].loop && c[0].size === 3, c);
  ok("...opened at an end", [g.vLine(0, 0), g.vLine(0, 3)].includes(c[0].open));

  const g2 = D.geometry(2, 2);
  const ring = drawn(2, 2, [g2.hLine(0, 0), g2.hLine(0, 1), g2.hLine(2, 0), g2.hLine(2, 1), g2.vLine(0, 0), g2.vLine(1, 0), g2.vLine(0, 2), g2.vLine(1, 2)]).lines;
  const r = D.components(g2, ring);
  ok("a 2x2 with the outside drawn is a 4-loop", r.length === 1 && r[0].loop && r[0].size === 4, r);

  const g3 = D.geometry(2, 1);
  const pair = drawn(2, 1, [g3.hLine(0, 0), g3.hLine(0, 1), g3.hLine(1, 0), g3.hLine(1, 1)]);
  const p = D.components(g3, pair.lines);
  ok("a 2-chain is opened in the middle", p.length === 1 && p[0].size === 2 && p[0].open === g3.vLine(0, 1));
  ok("hard gives the 2-chain away in the middle", D.chooseMove(pair, "hard", makeRng(1)) === g3.vLine(0, 1));
})();

// ---- AI ---------------------------------------------------------------------------

(function aiTests() {
  // 5x1: box 0 is three-sided, into box 1 whose far side is its top edge: the
  // last two of a chain. Boxes 2-4 make a 3-chain.
  const g = D.geometry(5, 1);
  const lines = [];
  for (let c = 0; c < 5; c++) {
    if (c !== 1) lines.push(g.hLine(0, c));
    if (c !== 2) lines.push(g.hLine(1, c));
  }
  lines.push(g.vLine(0, 0), g.vLine(0, 2));
  const s = drawn(5, 1, lines);
  ok("set-up: only one capture, and no safe move", D.captures(g, s.lines, g.vLine(0, 1)) &&
    s.lines.every((x, l) => x || !D.isSafe(g, s.lines, l)));
  ok("medium takes the boxes", D.chooseMove(s, "medium", makeRng(1)) === g.vLine(0, 1));
  ok("hard hands the last two over to keep control", D.chooseMove(s, "hard", makeRng(1)) === g.hLine(0, 1));

  // The same, but the rest is a 2-chain (boxes 2-3; box 4 closed): declining
  // gains nothing, so take.
  const short = [];
  for (let c = 0; c < 5; c++) {
    if (c !== 1) short.push(g.hLine(0, c));
    if (c !== 2 && c !== 3) short.push(g.hLine(1, c));
  }
  short.push(g.vLine(0, 0), g.vLine(0, 2), g.vLine(0, 4), g.vLine(0, 5));
  const t = drawn(5, 1, short);
  ok("set-up: the rest is one 2-chain", JSON.stringify(D.components(g, t.lines.map((x, l) => (l === g.vLine(0, 1) || l === g.hLine(0, 1) ? 1 : x))).map((c) => c.size)) === "[2]");
  ok("with only a 2-chain left, hard takes", D.chooseMove(t, "hard", makeRng(1)) === g.vLine(0, 1));

  // With safe moves left, nobody gives a box away.
  const open = D.createGame(4, 4);
  const g4 = D.geometry(4, 4);
  for (const level of ["medium", "hard"]) {
    const m = D.chooseMove(open, level, makeRng(2));
    ok(level + " opens with a safe line", D.isSafe(g4, open.lines, m));
  }
})();

function playOut(w, h, levels, seed) {
  const rng = makeRng(seed);
  const s = D.createGame(w, h);
  let moves = 0;
  while (!s.gameOver) {
    if (++moves > 1000) throw new Error("game did not finish");
    D.play(s, D.chooseMove(s, levels[s.turn === P1 ? 0 : 1], rng));
  }
  ok(w + "x" + h + " game " + seed + ": every box owned, scores add up",
    s.boxes.every((b) => b) && s.score[P1] + s.score[P2] === w * h && s.lines.every((x) => x));
  return s;
}

(function gamesTest() {
  const tally = (w, h, a, b, games, seed) => {
    let wins = 0;
    for (let k = 0; k < games; k++) {
      const flip = k % 2;
      const s = playOut(w, h, flip ? [b, a] : [a, b], seed + k);
      if (s.winner === (flip ? P2 : P1)) wins++;
    }
    return wins;
  };
  const hm = tally(4, 4, "hard", "medium", 20, 700);
  ok("Hard beats Medium on 4x4 (" + hm + "/20)", hm >= 12);
  const hm3 = tally(3, 3, "hard", "medium", 20, 800);
  ok("Hard beats Medium on 3x3 (" + hm3 + "/20)", hm3 >= 12);
  const me = tally(4, 4, "medium", "easy", 20, 900);
  ok("Medium beats Easy (" + me + "/20)", me >= 12);
  playOut(6, 6, ["hard", "hard"], 1);
  playOut(5, 3, ["easy", "hard"], 2);
})();

console.log("dots-boxes.test.js: " + passed + " assertions passed");
