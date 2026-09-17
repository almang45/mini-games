const assert = require("assert");
const S = require("../board.js");

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

const emptyGrid = () => Array.from({ length: S.ROWS + 2 }, () => Array(S.COLS + 2).fill(null));
const put = (grid, r, c, key) => { grid[r][c] = { key, img: key }; };
const pt = (r, c) => ({ r, c });
const same = (path, expected) => JSON.stringify(path) === JSON.stringify(expected);

// Independent check of the rule: axis-aligned segments, at most two turns,
// every cell passed through (endpoints excluded) empty.
function validPath(grid, path) {
  if (!path || path.length < 2 || path.length > 4) return false;
  const cells = [];
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1], q = path[i];
    if (p.r !== q.r && p.c !== q.c) return false;
    const dr = Math.sign(q.r - p.r), dc = Math.sign(q.c - p.c);
    for (let r = p.r + dr, c = p.c + dc; r !== q.r || c !== q.c; r += dr, c += dc) cells.push([r, c]);
    if (i < path.length - 1) cells.push([q.r, q.c]);
  }
  return cells.every(([r, c]) => grid[r] && c >= 0 && c < grid[r].length && !grid[r][c]);
}

// ---- deck and deal ----
{
  const deck = S.buildDeck();
  ok("144 tiles", deck.length === 144);
  const byKey = {};
  deck.forEach((t) => { byKey[t.key] = (byKey[t.key] || 0) + 1; });
  ok("36 match groups of exactly 4", Object.keys(byKey).length === 36 && Object.values(byKey).every((n) => n === 4), byKey);

  const grid = S.createGrid(mulberry32(1));
  ok("grid is padded by one empty ring", grid.length === S.ROWS + 2 && grid.every((row) => row.length === S.COLS + 2));
  ok("ring is empty", grid[0].every((t) => !t) && grid[S.ROWS + 1].every((t) => !t) && grid.every((row) => !row[0] && !row[S.COLS + 1]));
  ok("every inner cell holds a tile", S.tilesLeft(grid) === 144);
}

// ---- connection rule ----
{
  const g = emptyGrid();
  put(g, 1, 1, "a"); put(g, 1, 2, "a");
  ok("adjacent tiles connect directly", same(S.findPath(g, pt(1, 1), pt(1, 2)), [pt(1, 1), pt(1, 2)]));
  ok("a tile doesn't connect to itself", S.findPath(g, pt(1, 1), pt(1, 1)) === null);
}
{
  const g = emptyGrid();
  put(g, 1, 1, "a"); put(g, 3, 4, "a");
  ok("one turn through an empty corner", same(S.findPath(g, pt(1, 1), pt(3, 4)), [pt(1, 1), pt(3, 1), pt(3, 4)]));
  put(g, 3, 1, "x");
  ok("blocked corner falls back to the other corner", same(S.findPath(g, pt(1, 1), pt(3, 4)), [pt(1, 1), pt(1, 4), pt(3, 4)]));
}
{
  // Row 1 full between the pair: the only route is up into the outer ring and back down.
  const g = emptyGrid();
  put(g, 1, 1, "a"); put(g, 1, S.COLS, "a");
  for (let c = 2; c < S.COLS; c++) put(g, 1, c, "x");
  for (let c = 1; c <= S.COLS; c++) put(g, 2, c, "x");
  const path = S.findPath(g, pt(1, 1), pt(1, S.COLS));
  ok("two turns through the outer ring", same(path, [pt(1, 1), pt(0, 1), pt(0, S.COLS), pt(1, S.COLS)]), path);
}
{
  // a can only leave rightwards and b only from its left (the ring): 4 turns needed.
  const g = emptyGrid();
  put(g, 2, 2, "a"); put(g, 1, 2, "x"); put(g, 3, 2, "x"); put(g, 2, 1, "x");
  put(g, 5, 1, "a"); put(g, 4, 1, "x"); put(g, 6, 1, "x"); put(g, 5, 2, "x");
  ok("paths needing three or more turns are rejected", S.findPath(g, pt(2, 2), pt(5, 1)) === null);
  ok("canMatch agrees", !S.canMatch(g, pt(2, 2), pt(5, 1)));
}
{
  const g = emptyGrid();
  put(g, 1, 1, "a"); put(g, 1, 2, "b");
  ok("different faces never match", !S.canMatch(g, pt(1, 1), pt(1, 2)));
  put(g, 4, 4, "flower"); put(g, 4, 6, "flower");
  ok("same key matches", !!S.canMatch(g, pt(4, 4), pt(4, 6)));
}

// ---- hints, undo, reshuffle ----
{
  // 2x2 checkerboard in the corner: each pair's corners are the other pair's tiles.
  const g = emptyGrid();
  put(g, 1, 1, "a"); put(g, 1, 2, "b"); put(g, 2, 1, "b"); put(g, 2, 2, "a");
  ok("checkerboard corner is a dead end", S.findMove(g) === null);
  ok("shuffle finds a playable arrangement", S.shuffleRemaining(g, mulberry32(7)) && !!S.findMove(g));
  const keys = [g[1][1], g[1][2], g[2][1], g[2][2]].map((t) => t.key).sort().join();
  ok("shuffle keeps the same tiles in the same cells", keys === "a,a,b,b" && S.tilesLeft(g) === 4);

  const move = S.findMove(g);
  const removed = S.removePair(g, move.a, move.b);
  ok("removePair clears both cells", S.tilesLeft(g) === 2);
  S.restorePair(g, removed);
  ok("restorePair puts them back", S.tilesLeft(g) === 4 && g[move.a.r][move.a.c] === removed.a.tile);
}

// ---- full random games: every hint is a legal move, and hint+shuffle always clears the board ----
for (let seed = 1; seed <= 20; seed++) {
  const rng = mulberry32(seed);
  const grid = S.createGrid(rng);
  let moves = 0, shuffles = 0, allValid = true;
  while (S.tilesLeft(grid) > 0 && shuffles < 60) {
    const move = S.findMove(grid);
    if (!move) {
      ok("seed " + seed + ": shuffle succeeds", S.shuffleRemaining(grid, rng));
      shuffles++;
      continue;
    }
    const ends = same(move.path[0], move.a) && same(move.path[move.path.length - 1], move.b);
    if (!ends || !validPath(grid, move.path) || grid[move.a.r][move.a.c].key !== grid[move.b.r][move.b.c].key) allValid = false;
    S.removePair(grid, move.a, move.b);
    moves++;
  }
  ok("seed " + seed + ": every hint was a legal move", allValid);
  ok("seed " + seed + ": board cleared in 72 moves", S.tilesLeft(grid) === 0 && moves === 72, { moves, shuffles });
}

console.log("board.test.js: " + passed + " assertions passed");
