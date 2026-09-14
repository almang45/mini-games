const assert = require("assert");
const S = require("../spider.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RANK = { A: 1, T: 10, J: 11, Q: 12, K: 13 };
let serial = 0;
// "9S" is face up, "(9S)" face down; columns list the buried card first.
function card(text) {
  const faceUp = !text.startsWith("(");
  const id = text.replace(/[()]/g, "");
  return { rank: RANK[id[0]] || Number(id[0]), suit: id[1], id: id + "x" + serial++, faceUp };
}
function game(columns, { stock = [], completed = [], suits = 4 } = {}) {
  return {
    suits,
    number: 0,
    columns: Array.from({ length: S.COLUMNS }, (_, i) => (columns[i] ? columns[i].split(" ").map(card) : [])),
    stock: stock.map(card),
    completed,
    moves: 0,
    score: S.START_SCORE,
    history: [],
  };
}
const faces = (col) => col.map((c) => (c.faceUp ? "" : "(") + c.rank + c.suit + (c.faceUp ? "" : ")")).join(" ");
const allCards = (s) => [...s.columns.flat(), ...s.stock];
const RUN_KING_TO_TWO = "KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S";

// ---- decks and deals ----
for (const suits of [1, 2, 4]) {
  const deck = S.buildDeck(suits);
  const perSuit = {};
  deck.forEach((c) => { perSuit[c.suit] = (perSuit[c.suit] || 0) + 1; });
  ok(suits + " suit(s): 104 cards split evenly across the suits", deck.length === 104 && Object.keys(perSuit).length === suits &&
    Object.values(perSuit).every((n) => n === 104 / suits), perSuit);
  ok(suits + " suit(s): ids are unique", new Set(deck.map((c) => c.id)).size === 104);

  const s = S.createGame(suits, 42);
  ok(suits + " suit(s): 6,6,6,6,5,5,5,5,5,5 dealt", s.columns.map((c) => c.length).join() === "6,6,6,6,5,5,5,5,5,5");
  ok(suits + " suit(s): only the bottom card of each column is face up",
    s.columns.every((col) => col.every((c, i) => c.faceUp === (i === col.length - 1))));
  ok(suits + " suit(s): 50 in the stock, five deals", s.stock.length === 50 && S.dealsLeft(s) === 5);
  ok(suits + " suit(s): the same number deals the same layout", JSON.stringify(S.createGame(suits, 42)) === JSON.stringify(s));
  ok(suits + " suit(s): a different number deals a different layout", JSON.stringify(S.createGame(suits, 43).columns) !== JSON.stringify(s.columns));
}
for (const [suits, number] of [[3, 1], [4, 0], [4, 1.5], [4, S.MAX_DEAL + 1]]) {
  assert.throws(() => S.createGame(suits, number), /Suits|Deal number/);
  passed++;
}

// ---- moving runs ----
{
  const s = game(["(4D) 9H 8S 7S", "9S", "8H", "", "TD 9C", "TC"]);
  ok("a same-suit run's length", S.runLength(s.columns[0]) === 2 && S.runLength(s.columns[4]) === 1);
  ok("a mixed-suit stack doesn't move as one", !S.canMove(s, 0, 3, 3));
  ok("any suit builds on one rank higher", !S.canMove(s, 0, 2, 2) && S.canMove(s, 2, 1, 1) && S.canMove(s, 0, 1, 2));
  ok("a run needs a card one above its lead", !S.canMove(s, 0, 1, 4));
  ok("an empty column takes any run", S.canMove(s, 0, 2, 3));
  ok("a card can't move onto its own column", !S.canMove(s, 1, 1, 1));
  ok("counts past the run are refused", !S.canMove(s, 1, 2, 3) && !S.canMove(s, 1, 0, 3));

  S.move(s, 0, 2, 3);
  ok("the run moves in order", faces(s.columns[3]) === "8S 7S" && faces(s.columns[0]) === "(4D) 9H");
  ok("a move costs a point", s.moves === 1 && s.score === S.START_SCORE - 1);
  S.move(s, 0, 1, 5);
  ok("uncovering a face-down card turns it up", faces(s.columns[0]) === "4D");
  assert.throws(() => S.move(s, 0, 1, 1), /Illegal/);
  ok("an illegal move leaves no history", s.history.length === 2);
  S.undo(s);
  ok("undo turns the card back down", faces(s.columns[0]) === "(4D) 9H");
  S.undo(s);
  ok("undo restores the first position and score", faces(s.columns[0]) === "(4D) 9H 8S 7S" && s.score === S.START_SCORE && !S.undo(s));
}

// ---- completing a suit ----
{
  const s = game(["(5C) " + RUN_KING_TO_TWO, "AS"]);
  S.move(s, 1, 1, 0);
  ok("an Ace finishing King-to-Ace clears the run", s.columns[0].length === 1 && s.completed.join() === "S", faces(s.columns[0]));
  ok("the card underneath turns up", faces(s.columns[0]) === "5C");
  ok("a suit is worth a bonus", s.score === S.START_SCORE - 1 + S.SUIT_BONUS);
  S.undo(s);
  ok("undo brings the run back", s.columns[0].length === 13 && s.completed.length === 0 && s.score === S.START_SCORE);
  ok("eight completed suits win", S.isWon(game([], { completed: [..."SSHHDDCC"] })) && !S.isWon(game([], { completed: [..."SSHHDDC"] })));
}

// ---- dealing from the stock ----
{
  const cols = Array.from({ length: 10 }, () => "KD");
  const stock = ["2C", "3C", "4C", "5C", "6C", "7C", "8C", "9C", "TC", "JC"];
  const s = game(cols, { stock });
  ok("dealing needs every column filled", S.canDeal(s));
  S.dealRow(s);
  ok("one face-up card lands on each column", s.columns.every((col) => col.length === 2 && col[1].faceUp) && s.stock.length === 0);
  ok("cards come off the top of the stock, left to right", faces(s.columns.map((c) => [c[1]]).flat()) === "11C 10C 9C 8C 7C 6C 5C 4C 3C 2C");
  assert.throws(() => S.dealRow(s), /stock is empty/);
  S.undo(s);
  ok("undo takes the row back into the stock", s.stock.length === 10 && s.columns.every((col) => col.length === 1));

  const gap = game(["KD", "", "KD"], { stock });
  ok("an empty column blocks the deal", !S.canDeal(gap));
  assert.throws(() => S.dealRow(gap), /empty column/);
  passed++;

  const finishing = game([...Array(9).fill("KD"), RUN_KING_TO_TWO], { stock: ["AS", ...stock.slice(1)] });
  S.dealRow(finishing);
  ok("a dealt Ace can complete a suit", finishing.completed.join() === "S" && finishing.columns[9].length === 0);
}

// ---- hints ----
{
  const s = game(["(3D) 6H", "7H", "7S", "(9C) 5S", "", "8D 7C", "4D", "8S"]);
  const all = S.hints(s);
  const best = all[0];
  ok("a same-suit build that uncovers a card is the top hint", best.from === 0 && best.to === 1 && best.count === 1, best);
  ok("every hint is legal", all.every((h) => S.canMove(s, h.from, h.count, h.to)));
  ok("shifting 7C off its 8D onto another suit's 8 isn't suggested", !all.some((h) => h.from === 5));
  ok("moving a whole column into an empty one isn't suggested", !all.some((h) => h.from === 1 && h.to === 4));
  ok("uncovering a card beats a plain build", all.find((h) => h.from === 3).priority > all.find((h) => h.from === 6).priority);

  const quick = game(["5H", "6S", "6H"]);
  ok("quick move prefers the same suit", S.quickMove(quick, 0, 1) === 2);
  ok("quick move finds nothing for a lone King among Kings", S.quickMove(game(["KH", "KS"].concat(Array(8).fill("KD"))), 0, 1) === null);
}

// ---- random play: 104 cards stay accounted for, every hint is legal, undo rewinds ----
for (const suits of [1, 2, 4]) {
  for (let g = 1; g <= 6; g++) {
    const rng = mulberry32(suits * 100 + g);
    const s = S.createGame(suits, g * 977);
    const start = JSON.stringify(s);
    let consistent = true, hintsLegal = true;
    for (let step = 0; step < 400 && !S.isWon(s); step++) {
      const options = S.hints(s);
      if (!options.every((h) => S.canMove(s, h.from, h.count, h.to))) hintsLegal = false;
      if (options.length && rng() < 0.9) {
        const pick = options[Math.floor(rng() * Math.min(3, options.length))];
        S.move(s, pick.from, pick.count, pick.to);
      } else if (S.canDeal(s)) {
        S.dealRow(s);
      } else if (!options.length) {
        break;
      }
      const onTable = allCards(s).length + s.completed.length * S.FULL_RUN;
      const ids = new Set(allCards(s).map((c) => c.id));
      if (onTable !== 104 || ids.size !== allCards(s).length || s.columns.some((col) => col.length && !col[col.length - 1].faceUp)) consistent = false;
    }
    ok(suits + " suit(s), game " + g + ": cards conserved and bottoms face up", consistent);
    ok(suits + " suit(s), game " + g + ": hints were always legal", hintsLegal);
    while (S.undo(s)) { /* rewind */ }
    ok(suits + " suit(s), game " + g + ": undo rewinds to the deal", JSON.stringify(s) === start);
  }
}

console.log("spider.test.js: " + passed + " assertions passed");
