// Shisen-Sho board logic: the tile grid, the "at most two turns" connection
// rule, hints, and reshuffles. No DOM - loadable via <script> (global SHISEN)
// or require() in Node for testing.
(function (root) {
  "use strict";

  const ROWS = 8;
  const COLS = 18;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // Standard 144-tile set. `key` is the only thing matching reads, so any
  // flower pairs with any flower and any season with any season - the same
  // convention as Mahjong Solitaire. `img` names the artwork in shared/assets/tiles/.
  function buildDeck() {
    const deck = [];
    const add = (key, img, copies) => { for (let i = 0; i < copies; i++) deck.push({ key, img }); };
    ["wind-east", "wind-south", "wind-west", "wind-north", "dragon-red", "dragon-green", "dragon-white"]
      .forEach((img) => add(img, img, 4));
    ["man", "sou", "pin"].forEach((suit) => { for (let n = 1; n <= 9; n++) add(suit + n, suit + n, 4); });
    ["flower-plum", "flower-orchid", "flower-bamboo", "flower-chrysanthemum"].forEach((img) => add("flower", img, 1));
    ["season-spring", "season-summer", "season-autumn", "season-winter"].forEach((img) => add("season", img, 1));
    return deck;
  }

  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const PLAYOUTS = 20;
  const MAX_DEALS = 200;

  // (ROWS+2) x (COLS+2) with an always-empty outer ring, so paths may route
  // around the edge of the board. Tiles are {key, img}; empty cells are null.
  function randomGrid(rng) {
    const deck = shuffle(buildDeck(), rng);
    return Array.from({ length: ROWS + 2 }, (_, r) =>
      Array.from({ length: COLS + 2 }, (_, c) => (r >= 1 && r <= ROWS && c >= 1 && c <= COLS ? deck.pop() : null)));
  }

  // Deals until a random playout clears the board, so every deal comes with a known winning
  // line. Most deals pass on the first try; after MAX_DEALS (never seen) the last deal is used without one.
  function dealWinnable(rng) {
    const rand = rng || Math.random;
    for (let deal = 1; ; deal++) {
      const grid = randomGrid(rand);
      const line = winningLine(grid, rand);
      if (line || deal === MAX_DEALS) return { grid, line };
    }
  }

  const createGrid = (rng) => dealWinnable(rng).grid;

  function forEachTile(grid, fn) {
    grid.forEach((row, r) => row.forEach((tile, c) => { if (tile) fn(tile, r, c); }));
  }

  function tilesLeft(grid) {
    let n = 0;
    forEachTile(grid, () => { n++; });
    return n;
  }

  // Cells strictly between a and b, which must share a row or column.
  function clearBetween(grid, a, b) {
    if (a.r === b.r) {
      for (let c = Math.min(a.c, b.c) + 1; c < Math.max(a.c, b.c); c++) if (grid[a.r][c]) return false;
      return true;
    }
    if (a.c === b.c) {
      for (let r = Math.min(a.r, b.r) + 1; r < Math.max(a.r, b.r); r++) if (grid[r][a.c]) return false;
      return true;
    }
    return false;
  }

  // From p, reach b with at most one turn. Returns the corner used (p itself
  // for a straight line), or null.
  function oneTurn(grid, p, b) {
    for (const corner of [{ r: b.r, c: p.c }, { r: p.r, c: b.c }]) {
      const isP = corner.r === p.r && corner.c === p.c;
      const isB = corner.r === b.r && corner.c === b.c;
      if (isB) continue;
      if ((isP || !grid[corner.r][corner.c]) && clearBetween(grid, p, corner) && clearBetween(grid, corner, b)) return corner;
    }
    return null;
  }

  function dedupe(points) {
    return points.filter((p, i) => i === 0 || p.r !== points[i - 1].r || p.c !== points[i - 1].c);
  }

  // Shisen-Sho's rule: two tiles connect when a line of at most three straight
  // segments (two turns) joins them through empty cells. Returns the path's
  // points from a to b (turns included), or null.
  function findPath(grid, a, b) {
    if (a.r === b.r && a.c === b.c) return null;
    const corner = oneTurn(grid, a, b);
    if (corner) return dedupe([a, corner, b]);
    for (const [dr, dc] of DIRS) {
      for (let r = a.r + dr, c = a.c + dc; grid[r] && c >= 0 && c < grid[r].length && !grid[r][c]; r += dr, c += dc) {
        const second = oneTurn(grid, { r, c }, b);
        if (second) return dedupe([a, { r, c }, second, b]);
      }
    }
    return null;
  }

  function canMatch(grid, a, b) {
    const ta = grid[a.r][a.c], tb = grid[b.r][b.c];
    return !!ta && !!tb && ta.key === tb.key && findPath(grid, a, b);
  }

  // Any connectable matching pair, searching only within same-key groups.
  // With rng the search order is random, so repeated playouts try different lines.
  function findMove(grid, rng) {
    const byKey = new Map();
    forEachTile(grid, (tile, r, c) => byKey.set(tile.key, (byKey.get(tile.key) || []).concat({ r, c })));
    const groups = [...byKey.values()];
    if (rng) shuffle(groups, rng).forEach((cells) => shuffle(cells, rng));
    for (const cells of groups) {
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const path = findPath(grid, cells[i], cells[j]);
          if (path) return { a: cells[i], b: cells[j], path };
        }
      }
    }
    return null;
  }

  function removePair(grid, a, b) {
    const removed = { a: { r: a.r, c: a.c, tile: grid[a.r][a.c] }, b: { r: b.r, c: b.c, tile: grid[b.r][b.c] } };
    grid[a.r][a.c] = null;
    grid[b.r][b.c] = null;
    return removed;
  }

  function restorePair(grid, removed) {
    grid[removed.a.r][removed.a.c] = removed.a.tile;
    grid[removed.b.r][removed.b.c] = removed.b.tile;
  }

  // The removal order from the first of PLAYOUTS random greedy playouts that clears
  // the board, as [{a, b}]. Null means none did, not that the position is lost.
  function winningLine(grid, rng) {
    for (let attempt = 0; attempt < PLAYOUTS; attempt++) {
      const copy = grid.map((row) => row.slice());
      const line = [];
      for (let move = findMove(copy, rng); move; move = findMove(copy, rng)) {
        removePair(copy, move.a, move.b);
        line.push({ a: move.a, b: move.b });
      }
      if (tilesLeft(copy) === 0) return line;
    }
    return null;
  }

  // Re-deals the remaining faces over the same occupied cells, preferring an
  // arrangement known to be winnable and settling for one with a move.
  function shuffleRemaining(grid, rng) {
    const rand = rng || Math.random;
    const cells = [];
    forEachTile(grid, (tile, r, c) => cells.push({ r, c, tile }));
    if (cells.length === 0) return true;
    const faces = cells.map((cell) => cell.tile);
    let fallback = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      shuffle(faces, rand);
      cells.forEach(({ r, c }, i) => { grid[r][c] = faces[i]; });
      if (!findMove(grid)) continue;
      if (attempt < 30 && winningLine(grid, rand)) return true;
      if (!fallback) fallback = faces.slice();
    }
    if (!fallback) return false;
    cells.forEach(({ r, c }, i) => { grid[r][c] = fallback[i]; });
    return true;
  }

  const api = {
    ROWS, COLS, buildDeck, createGrid, dealWinnable, winningLine, tilesLeft, findPath, canMatch, findMove,
    removePair, restorePair, shuffleRemaining,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SHISEN = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
