const assert = require("assert");
const F = require("../freecell.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const card = (id) => ({ rank: F.RANKS.indexOf(id[0]) + 1, suit: id[1], id });
const cards = (ids) => (ids ? ids.split(" ").map(card) : []);
// Cascades are listed buried card first, playable card last.
function game({ cascades = [], cells = [], foundations = {} }) {
  return {
    number: 0,
    cascades: Array.from({ length: F.CASCADE_COUNT }, (_, i) => cards(cascades[i])),
    cells: Array.from({ length: F.CELL_COUNT }, (_, i) => (cells[i] ? card(cells[i]) : null)),
    foundations: { C: 0, D: 0, H: 0, S: 0, ...foundations },
    moves: 0,
    history: [],
  };
}
const col = (index, count) => ({ type: "cascade", index, count: count || 1 });
const cell = (index) => ({ type: "cell", index });
const FOUNDATION = { type: "foundation" };

// ---- deals ----
{
  const rows = (cascades) => Array.from({ length: 7 }, (_, r) => cascades.map((c) => c[r]).filter(Boolean).map((c) => c.id).join(" ")).join(" / ");
  const d1 = rows(F.deal(1));
  ok("deal #1 matches Microsoft FreeCell", d1 === "JD 2D 9H JC 5D 7H 7C 5H / KD KC 9S 5S AD QC KH 3H / 2S KS 9D QD JS AS AH 3C / 4C 5C TS QH 4H AC 4D 7S / 3S TD 4S TH 8H 2C JH 7D / 6D 8S 8D QS 6C 3D 8C TC / 6S 9C 2H 6H", d1);
  const d617 = rows(F.deal(617));
  ok("deal #617 matches Microsoft FreeCell", d617 === "7D AD 5C 3S 5S 8C 2D AH / TD 7S QD AC 6D 8H AS KH / TH QC 3H 9D 6S 8D 3D TC / KD 5H 9S 3C 8S 7H 4D JS / 4C QS 9C 9H 7C 6H 2C 2S / 4S TS 2H 5D JC 6C JH QH / JD KS KC 4H", d617);
  for (const n of [1, 11982, 32000, F.MAX_DEAL]) {
    const cascades = F.deal(n);
    const ids = new Set(cascades.flat().map((c) => c.id));
    ok("deal #" + n + ": 52 distinct cards in 7,7,7,7,6,6,6,6", ids.size === 52 && cascades.map((c) => c.length).join() === "7,7,7,7,6,6,6,6");
  }
  for (const bad of [0, 1.5, F.MAX_DEAL + 1, "7"]) {
    assert.throws(() => F.createGame(bad), /Deal number/);
    passed++;
  }
}

// ---- move rules and the supermove limit ----
{
  const cascades = ["KS", "QH JS", "KD", "9D 5C", "AH", "3S", "JD TC 9H 8S", "QS"];
  const noSpace = game({ cascades, cells: ["2C", "3C", "4C", "6C"] });
  ok("no free space moves one card at a time", F.maxMovable(noSpace, false) === 1);
  ok("a 2-card run needs spare space", !F.canMove(noSpace, col(1, 2), col(0)));
  ok("mixed cards aren't a run", !F.canMove(noSpace, col(3, 2), col(0)));
  ok("full cells take nothing", !F.canMove(noSpace, col(4), cell(0)));
  ok("an ace goes home", F.canMove(noSpace, col(4), FOUNDATION));
  ok("a 3 can't skip the ace", !F.canMove(noSpace, col(5), FOUNDATION));

  const oneCell = game({ cascades, cells: ["2C", "3C", "4C"] });
  ok("one free cell carries a 2-card run", F.canMove(oneCell, col(1, 2), col(0)));
  ok("red can't go on red", !F.canMove(oneCell, col(1, 2), col(2)));
  ok("a run can't move onto its own column", !F.canMove(oneCell, col(1, 2), col(1)));
  ok("a free cell takes a single card", F.canMove(oneCell, col(3), cell(3)) && !F.canMove(oneCell, col(3, 2), cell(3)));

  const withEmpty = game({ cascades: ["KS", "QH JS", "KD", "9D 5C", "", "3S", "JD TC 9H 8S", "QS"], cells: ["2C", "3C", "4C"] });
  ok("free cell + empty column = 4 cards", F.maxMovable(withEmpty, false) === 4);
  ok("...but only 2 into that empty column", F.maxMovable(withEmpty, true) === 2);
  ok("a 4-card run fits onto a black queen", F.canMove(withEmpty, col(6, 4), col(7)));
  ok("a 4-card run doesn't fit into the empty column", !F.canMove(withEmpty, col(6, 4), col(4)));
  ok("a 2-card run does", F.canMove(withEmpty, col(6, 2), col(4)));
  ok("a count past the column's length is rejected", !F.canMove(withEmpty, col(0, 2), col(4)));
}

// ---- autoplay safety ----
{
  const s = game({ foundations: { C: 2, S: 1, D: 2, H: 2 } });
  ok("twos are always safe", F.isSafeToFoundation(s, card("2S")));
  ok("3H waits while a black 2 is still out", !F.isSafeToFoundation(s, card("3H")));
  s.foundations.S = 2;
  ok("3H is safe once both black 2s are home", F.isSafeToFoundation(s, card("3H")));
  ok("only the next rank qualifies", !F.isSafeToFoundation(s, card("4H")));
}

// ---- move, autoplay chain, undo ----
{
  const s = game({ cascades: ["2H AH 5S", "6H", "KC"] });
  const before = JSON.stringify(s);
  F.move(s, col(0), col(1));
  ok("moving 5S uncovers AH and 2H, which autoplay home", s.foundations.H === 2 && s.cascades[0].length === 0, s.foundations);
  ok("the move counts once", s.moves === 1 && s.cascades[1].map((c) => c.id).join() === "6H,5S");
  assert.throws(() => F.move(s, col(2), col(1)), /Illegal/);
  ok("an illegal move leaves history alone", s.history.length === 1);
  ok("undo rewinds the move and its autoplay together", F.undo(s) && JSON.stringify(s) === before);
  ok("nothing left to undo", !F.undo(s));
}

// ---- quick move preferences ----
{
  const home = game({ cascades: ["AS", "KH"] });
  ok("quick move sends an ace home", JSON.stringify(F.quickMove(home, col(0))) === JSON.stringify(FOUNDATION) && home.foundations.S === 1);

  const build = game({ cascades: ["3D", "4C", "9H"], foundations: { D: 1 } });
  ok("then prefers building on a column", JSON.stringify(F.quickMove(build, col(0))) === JSON.stringify({ type: "cascade", index: 1 }));

  const park = game({ cascades: ["3D", "9H", "8H"] });
  ok("then a free cell before an empty column", JSON.stringify(F.quickMove(park, col(0))) === JSON.stringify(cell(0)));

  const run = game({ cascades: ["5C 4H", "9H"] });
  ok("a run falls back to an empty column", JSON.stringify(F.quickMove(run, col(0, 2))) === JSON.stringify({ type: "cascade", index: 2 }));

  const stuck = game({ cascades: ["3D", "9H", "8H", "7H", "6H", "5H", "4H", "2S"], cells: ["TC", "JC", "QC", "KC"] });
  ok("no destination returns null and changes nothing", F.quickMove(stuck, col(0)) === null && stuck.moves === 0);

  const fromCell = game({ cascades: ["3D", "9H", "8H", "7H", "6H", "5H", "4H", "2S"], cells: ["TC"] });
  ok("a free-cell card isn't shuffled to another cell", F.quickMove(fromCell, cell(0)) === null);
}

ok("four full foundations win", F.isWon(game({ foundations: { C: 13, D: 13, H: 13, S: 13 } })) && !F.isWon(game({ foundations: { C: 13, D: 13, H: 13, S: 12 } })));

// ---- random play: cards are conserved and undo rewinds everything ----
function legalMoves(s) {
  const sources = [
    ...s.cells.flatMap((c, index) => (c ? [cell(index)] : [])),
    ...s.cascades.flatMap((cards, index) => cards.map((_, k) => col(index, cards.length - k))),
  ];
  const targets = [FOUNDATION, ...s.cells.map((_, i) => cell(i)), ...s.cascades.map((_, i) => col(i))];
  return sources.flatMap((from) => targets.filter((to) => F.canMove(s, from, to)).map((to) => ({ from, to })));
}

for (let n = 1; n <= 30; n++) {
  const rng = mulberry32(n);
  const s = F.createGame(n * 97);
  const start = JSON.stringify(s);
  let consistent = true;
  for (let step = 0; step < 150 && !F.isWon(s); step++) {
    const moves = legalMoves(s);
    if (moves.length === 0) break;
    const { from, to } = moves[Math.floor(rng() * moves.length)];
    F.move(s, from, to);
    const inPlay = [...s.cascades.flat(), ...s.cells.filter(Boolean)];
    const home = Object.values(s.foundations).reduce((a, b) => a + b, 0);
    if (inPlay.length + home !== 52 || new Set(inPlay.map((c) => c.id)).size !== inPlay.length ||
        inPlay.some((c) => c.rank <= s.foundations[c.suit])) consistent = false;
  }
  ok("deal #" + n * 97 + ": 52 cards stay accounted for", consistent);
  while (F.undo(s)) { /* rewind to the deal */ }
  ok("deal #" + n * 97 + ": undo rewinds to the deal", JSON.stringify(s) === start);
}

// ---- solver ----
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (s) => s.cascades.map((c) => c.map((x) => x.id).join(" ")).sort().join("|") + "/" + s.cells.filter(Boolean).map((c) => c.id).sort().join(" ");
function after(s, { from, to }) {
  const copy = game({});
  copy.cascades = s.cascades.map((c) => c.slice());
  copy.cells = s.cells.slice();
  copy.foundations = { ...s.foundations };
  F.move(copy, from, to);
  return copy;
}

for (const n of [1, 2, 3, 617, 1941]) {
  const s = F.createGame(n);
  const found = F.solve(s);
  ok("deal #" + n + " is solved", found.result === "solved" && found.moves.length > 0, found.result);
  found.moves.forEach(({ from, to }) => F.move(s, from, to));
  ok("deal #" + n + ": replaying the solution through move() wins", F.isWon(s));
}
ok("deal #11982, the famous impossible one, is proven unsolvable", F.solve(F.createGame(11982)).result === "unsolvable");
ok("a tiny budget gives up rather than guessing", F.solve(F.createGame(1), 50).result === "gave-up");
ok("a won game needs no moves", same(F.solve(game({ foundations: { C: 13, D: 13, H: 13, S: 13 } })), { result: "solved", moves: [] }));

{
  const stuck = game({ cascades: ["3D", "9H", "8H", "7H", "6H", "5H", "4H", "2D"], cells: ["TC", "JC", "QC", "KC"] });
  ok("no candidate moves in a dead position", F.candidateMoves(stuck).length === 0);
  ok("a dead position is unsolvable", F.solve(stuck).result === "unsolvable");
  const almost = game({ cascades: ["KH"], foundations: { C: 13, D: 13, H: 12, S: 13 } });
  ok("one card from home: a one-move solution", same(F.solve(almost).moves, [{ from: col(0), to: FOUNDATION }]));
}

// The generator must only offer legal moves, and must reach every position a legal move
// reaches, bar the pointless ones (cell to cell, a whole column into an empty column).
for (let n = 1; n <= 12; n++) {
  const rng = mulberry32(1000 + n);
  const s = F.createGame(n * 131);
  let legal = true, complete = true;
  for (let step = 0; step < 60 && !F.isWon(s); step++) {
    const candidates = F.candidateMoves(s);
    if (!candidates.every(({ from, to }) => F.canMove(s, from, to))) legal = false;
    const reached = new Set(candidates.map((m) => keyOf(after(s, m))));
    const useful = legalMoves(s).filter(({ from, to }) => !(from.type === "cell" && to.type === "cell") &&
      !(to.type === "cascade" && s.cascades[to.index].length === 0 && from.type === "cascade" && from.count === s.cascades[from.index].length));
    if (!useful.every((m) => reached.has(keyOf(after(s, m))))) complete = false;
    if (useful.length === 0) break;
    const pick = useful[Math.floor(rng() * useful.length)];
    F.move(s, pick.from, pick.to);
  }
  ok("deal #" + n * 131 + ": candidate moves are all legal", legal);
  ok("deal #" + n * 131 + ": candidate moves miss no useful position", complete);
}

console.log("freecell.test.js: " + passed + " assertions passed");
