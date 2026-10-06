const assert = require("assert");
const W = require("../wordgrid.js");
const { buildLexicon } = require("../lexicon.js");
const lex = buildLexicon(require("../words.js"));

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

const rack = (letters) => letters.split("").map((l) => W.tile(l));

// A game with chosen racks and words already on the board.
function game(racks, words) {
  const s = W.createGame(["human", "human"], { lexicon: lex, rng: makeRng(1) });
  s.racks = racks.map(rack);
  (words || []).forEach(([text, row, col, across]) => text.split("").forEach((l, i) => {
    s.board[across ? row : row + i][across ? col + i : col] = { letter: l, blank: false };
  }));
  return s;
}

// Lays `text` from the rack, starting at (row, col); letters already on the
// board are skipped over, lowercase letters are blanks.
function lay(s, seat, text, row, col, across) {
  const pool = s.racks[seat].slice();
  const out = [];
  text.split("").forEach((ch, i) => {
    const r = across ? row : row + i, c = across ? col + i : col;
    if (s.board[r][c]) return;
    const blank = ch === ch.toLowerCase();
    const t = pool.splice(pool.findIndex((x) => x.letter === (blank ? "?" : ch)), 1)[0];
    out.push({ row: r, col: c, tileId: t.id, letter: ch.toUpperCase() });
  });
  return out;
}

// ---- lexicon ---------------------------------------------------------------------

(function lexiconTests() {
  ok("168,551 playable words", lex.wordCount === 168551);
  ok("finds words, any case", lex.isWord("quixotic") && lex.isWord("AA") && lex.isWord("Zymurgy"));
  ok("rejects non-words and fragments", !lex.isWord("xyzzy") && !lex.isWord("qui") && !lex.isWord("") && !lex.isWord("a"));
  assert.throws(() => buildLexicon("B\nA"), /sorted/);
})();

// ---- tiles and board ---------------------------------------------------------------

(function setupTests() {
  const bag = W.buildBag();
  ok("100 tiles", bag.length === 100);
  ok("12 Es, 2 blanks, one each of J Q X Z", bag.filter((t) => t.letter === "E").length === 12 &&
    bag.filter((t) => t.letter === "?").length === 2 && ["J", "Q", "X", "Z"].every((l) => bag.filter((t) => t.letter === l).length === 1));
  ok("tile values add up to 187", bag.reduce((s, t) => s + W.value(t.letter), 0) === 187);
  let symmetric = true;
  for (let r = 0; r < W.SIZE; r++) for (let c = 0; c < W.SIZE; c++) {
    const p = W.premium(r, c);
    [[c, r], [14 - r, c], [r, 14 - c], [14 - c, 14 - r]].forEach(([a, b]) => { if (W.premium(a, b) !== p) symmetric = false; });
  }
  ok("the premium layout is symmetric every way", symmetric);
  ok("the centre doubles the word", W.premium(7, 7) === "D");
  ok("corners triple it", W.premium(0, 0) === "T" && W.premium(14, 14) === "T");

  assert.throws(() => W.createGame(["human"], { lexicon: lex }), /two-player/);
  assert.throws(() => W.createGame(["human", "ai"]), /lexicon/);
  const s = W.createGame(["human", "ai"], { lexicon: lex, rng: makeRng(2) });
  ok("seven tiles each, 86 in the bag", s.racks.every((r) => r.length === 7) && s.bag.length === 86);
})();

// ---- placing tiles -------------------------------------------------------------------

(function firstMoveTests() {
  const s = game(["CATSXQZ", "AEIOUNR"]);
  const off = lay(s, 0, "CAT", 0, 0, true);
  ok("first word must cover the centre", /centre/.test(W.evaluate(s, 0, off).error));
  ok("and be two letters or more", /two letters/.test(W.evaluate(s, 0, lay(s, 0, "C", 7, 7, true)).error));
  ok("words are checked", /isn't in the word list/.test(W.evaluate(s, 0, lay(s, 0, "TCA", 7, 6, true)).error));
  const res = W.evaluate(s, 0, lay(s, 0, "CAT", 7, 6, true));
  // C3 A1 T1 = 5, doubled by the centre.
  ok("CAT over the centre scores 10", res.ok && res.score === 10, res);
  W.play(s, 0, lay(s, 0, "CAT", 7, 6, true));
  ok("score, refill and turn", s.seats[0].score === 10 && s.racks[0].length === 7 && s.turn === 1 && s.bag.length === 83);
  assert.throws(() => W.play(s, 0, []), /not your turn/);
})();

(function shapeTests() {
  const s = game(["SATIRED", "AEIOUNR"], [["CAT", 7, 6, true]]);
  const diag = [{ row: 8, col: 8, tileId: s.racks[0][0].id, letter: "S" }, { row: 9, col: 9, tileId: s.racks[0][1].id, letter: "A" }];
  ok("one row or column", /one row or one column/.test(W.evaluate(s, 0, diag).error));
  const gap = [{ row: 9, col: 6, tileId: s.racks[0][0].id, letter: "S" }, { row: 11, col: 6, tileId: s.racks[0][1].id, letter: "A" }];
  ok("no gaps", /unbroken/.test(W.evaluate(s, 0, gap).error));
  ok("must join the board", /join/.test(W.evaluate(s, 0, lay(s, 0, "SAT", 0, 0, true)).error));
  ok("only your own tiles", /isn't on your rack/.test(W.evaluate(s, 0, [{ row: 8, col: 6, tileId: "nope", letter: "A" }]).error));
  ok("a tile is its own letter", /own letter/.test(W.evaluate(s, 0, [{ row: 8, col: 6, tileId: s.racks[0][0].id, letter: "Q" }]).error));
  ok("no square twice", /taken/.test(W.evaluate(s, 0, [{ row: 7, col: 7, tileId: s.racks[0][0].id, letter: "S" }]).error));
})();

(function scoringTests() {
  // CAT across the centre row; play S at the end: CATS, 1+3+1+1 = 6, (7,9) is plain.
  const s = game(["SATIRED", "AEIOUNR"], [["CAT", 7, 6, true]]);
  ok("hooking an S: CATS 6", W.evaluate(s, 0, lay(s, 0, "CATS", 7, 6, true)).score === 6);
  // ATE down from the A of CAT: T (8,7) and E (9,7) plain; A already there, no premium.
  ok("a word through a board tile: 3", W.evaluate(s, 0, lay(s, 0, "ATE", 7, 7, false)).score === 3);
  // A blank scores nothing.
  const b = game(["?ATIRED", "AEIOUNR"], [["CAT", 7, 6, true]]);
  ok("a blank S scores 0: CATs 5", W.evaluate(b, 0, lay(b, 0, "CATs", 7, 6, true)).score === 5);
  // AT under the T of CAT also makes TA down. (8,8) doubles the letter for
  // both words it's part of: AT = 2+1, TA = 1+2.
  const cross = game(["SATIRED", "AEIOUNR"], [["CAT", 7, 6, true]]);
  const twoWords = W.evaluate(cross, 0, lay(cross, 0, "AT", 8, 8, true));
  ok("(8,8) is a double letter", W.premium(8, 8) === "d" && W.premium(8, 9) === null);
  ok("a parallel play scores every word it makes", twoWords.ok && twoWords.words.map((w) => w.word).sort().join() === "AT,TA" && twoWords.score === 6, twoWords);
  const bad = W.evaluate(cross, 0, lay(cross, 0, "AT", 8, 6, true));
  ok("and every one must be a word (CA isn't)", !bad.ok && /CA isn't/.test(bad.error));
  // All seven: TIRADES in row 7, columns 1-7. The R is on a double letter
  // (7,3) and the S on the centre: (1+1+2+1+2+1+1) x 2 + 50 = 68.
  const bingo = game(["SATIRED", "AEIOUNR"]);
  const all = W.evaluate(bingo, 0, lay(bingo, 0, "TIRADES", 7, 1, true));
  ok("all seven tiles: +50", all.ok && all.score === 68, all);
})();

// ---- exchanging, passing, ending -----------------------------------------------------

(function exchangeTests() {
  const s = game(["QQVVWWX", "AEIOUNR"]);
  const before = s.racks[0].map((t) => t.id);
  W.exchange(s, 0, before.slice(0, 3));
  ok("three new tiles, bag the same size", s.racks[0].length === 7 && s.bag.length === 86 && s.racks[0].filter((t) => before.includes(t.id)).length === 4);
  ok("turn passes", s.turn === 1);
  s.bag = s.bag.slice(0, 6);
  assert.throws(() => W.exchange(s, 1, [s.racks[1][0].id]), /at least 7/);
})();

(function passEndTests() {
  const s = game(["QZ", "AE"]);
  [0, 1, 0, 1].forEach((seat) => W.pass(s, seat));
  ok("two passes each end the game", s.gameOver);
  ok("each loses what's left", s.seats[0].score === -20 && s.seats[1].score === -2 && s.winner === 1);
})();

(function goOutTests() {
  const s = game(["AT", "QZE"], [["CAT", 7, 6, true]]);
  s.bag = [];
  W.play(s, 0, lay(s, 0, "AT", 8, 8, true));
  ok("going out ends it", s.gameOver && s.racks[0].length === 0);
  ok("and takes the other rack's value", s.seats[0].score === s.lastMove.score + 21 && s.seats[1].score === -21);
})();

// ---- move generation against brute force ------------------------------------------------

const keyOf = (pl) => pl.map((p) => p.row + "," + p.col + p.letter).sort().join("|");

// Every way to lay the rack along any line (blanks as every letter).
function bruteForce(s, seat) {
  const found = new Map();
  const tiles = s.racks[seat];
  for (const across of [true, false]) for (let fixed = 0; fixed < W.SIZE; fixed++) for (let start = 0; start < W.SIZE; start++) {
    if (across ? s.board[fixed][start] : s.board[start][fixed]) continue;
    const empties = [];
    for (let k = start; k < W.SIZE && empties.length < tiles.length; k++) {
      const r = across ? fixed : k, c = across ? k : fixed;
      if (!s.board[r][c]) empties.push([r, c]);
    }
    for (let n = 1; n <= empties.length; n++) {
      const assign = (i, used, pl) => {
        if (i === n) { const res = W.evaluate(s, seat, pl); if (res.ok) found.set(keyOf(pl), res.score); return; }
        tiles.forEach((t, ti) => {
          if (used.has(ti)) return;
          used.add(ti);
          (t.letter === "?" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("") : [t.letter]).forEach((L) =>
            assign(i + 1, used, pl.concat([{ row: empties[i][0], col: empties[i][1], tileId: t.id, letter: L }])));
          used.delete(ti);
        });
      };
      assign(0, new Set(), []);
    }
  }
  return found;
}

(function generatorTests() {
  let positions = 0, moves = 0, same = true;
  for (let g = 0; g < 2; g++) {
    const s = W.createGame(["ai", "ai"], { lexicon: lex, rng: makeRng(300 + g) });
    for (let turn = 0; turn < 6 && !s.gameOver; turn++) {
      const seat = s.turn;
      const saved = s.racks[seat];
      s.racks[seat] = saved.filter((t) => t.letter !== "?").slice(0, 3).concat(turn === 3 ? [W.tile("?")] : []);
      const gen = new Map(W.generateMoves(s, seat).map((m) => [keyOf(m.placements), m.score]));
      const ref = bruteForce(s, seat);
      positions++; moves += ref.size;
      if (gen.size !== ref.size || [...ref].some(([k, v]) => gen.get(k) !== v)) same = false;
      s.racks[seat] = saved;
      W.stepAI(s, seat, "hard");
    }
  }
  ok("the generator finds exactly the legal moves (" + moves + " over " + positions + " positions), with their scores", same);
})();

// ---- AI games ------------------------------------------------------------------------------

function tileCount(s) {
  return s.bag.length + s.racks.reduce((a, r) => a + r.length, 0) + s.board.reduce((a, row) => a + row.filter(Boolean).length, 0);
}

function playOut(seed, levels) {
  const s = W.createGame(["ai", "ai"], { lexicon: lex, rng: makeRng(seed) });
  let turns = 0;
  let kept = true;
  while (!s.gameOver) {
    if (++turns > 200) throw new Error("game did not finish");
    W.stepAI(s, s.turn, levels[s.turn]);
    kept = kept && tileCount(s) === 100;
  }
  ok("game " + seed + ": all 100 tiles accounted for every turn", kept);
  return s;
}

(function aiTests() {
  let hardWins = 0;
  const games = 6;
  for (let g = 0; g < games; g++) {
    const hard = g % 2;
    const s = playOut(500 + g, hard ? ["easy", "hard"] : ["hard", "easy"]);
    if (s.winner === hard) hardWins++;
  }
  ok("Hard beats Easy (" + hardWins + "/" + games + ")", hardWins >= games - 1);
})();

console.log("wordgrid.test.js: " + passed + " assertions passed");
