const assert = require("assert");
const B = require("../backgammon.js");

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
// An rng that rolls the given dice.
const loaded = (...dice) => { let k = 0; return () => (dice[k++ % dice.length] - 1) / 6 + 0.01; };

const { WHITE, BLACK, BAR, OFF } = B;

// A state with White to roll, built from relative points: { 6: 2, 25: 1 } is
// two on the 6-point and one on the bar; `off` is checkers borne off.
function setup(white, black, turn) {
  const s = B.createGame(makeRng(1));
  const p = { board: new Array(24).fill(0), bar: { [WHITE]: 0, [BLACK]: 0 }, off: { [WHITE]: 0, [BLACK]: 0 } };
  for (const [side, spec] of [[WHITE, white], [BLACK, black]]) {
    let n = 0;
    for (const [r, c] of Object.entries(spec)) {
      n += c;
      if (+r === BAR) p.bar[side] = c;
      else if (p.board[B.idx(side, +r)]) throw new Error("both sides on one point: " + side + "@" + r);
      else p.board[B.idx(side, +r)] = side * c;
    }
    p.off[side] = B.CHECKERS - n;
  }
  Object.assign(s, p, { turn: turn || WHITE, phase: "roll", dice: null, turns: [], done: [] });
  return s;
}
const rolled = (s, a, b) => { B.roll(s, loaded(a, b)); return s; };
const fmt = (t) => t.map((st) => st.from + "/" + st.to).join(" ");
const turnsOf = (s) => s.turns.map(fmt).sort();
const total = (s, side) => {
  let n = s.bar[side] + s.off[side];
  for (let r = 1; r <= 24; r++) n += B.countAt(s, side, r);
  return n;
};

// ---- setup ---------------------------------------------------------------------

(function setupTests() {
  const p = B.startPosition();
  ok("15 checkers each", total(p, WHITE) === 15 && total(p, BLACK) === 15);
  ok("167 pips each", B.pips(p, WHITE) === 167 && B.pips(p, BLACK) === 167);
  ok("the sides mirror each other", p.board.every((v, i) => v === -p.board[23 - i]));
  for (let seed = 1; seed <= 20; seed++) {
    const s = B.createGame(makeRng(seed));
    ok("opening " + seed + ": two different dice, the higher side moves", s.phase === "move" && s.dice[0] !== s.dice[1] &&
      (s.dice[0] > s.dice[1] ? WHITE : BLACK) === s.turn);
  }
})();

// ---- moving ------------------------------------------------------------------------

(function moveTests() {
  // Black's relative point x is White's 25-x: Black holds White's 9 and has a blot on White's 10.
  const s = rolled(setup({ 13: 2 }, { 16: 2, 15: 1 }), 4, 3);
  ok("a point held by two is closed", B.target(s, WHITE, 13, 4) === -1);
  ok("a blot can be hit", B.target(s, WHITE, 13, 3) === 10);
  B.move(s, 13, 10);
  ok("the hit checker goes to the bar", s.bar[BLACK] === 1 && B.countAt(s, WHITE, 10) === 1);
  ok("then the 4, which only the hitter can play", B.nextSteps(s).map((st) => st.from + "/" + st.to).join() === "10/6");
  ok("undo puts the hit checker back", B.undoStep(s) && s.bar[BLACK] === 0 && B.countAt(s, BLACK, 15) === 1 && B.countAt(s, WHITE, 13) === 2);
  assert.throws(() => B.move(s, 13, 9), /illegal/);
  ok("the turn needs both dice", !B.turnComplete(s));
  B.move(s, 13, 10);
  B.move(s, 10, 6);
  ok("...and then it's done", B.turnComplete(s));
  B.endTurn(s);
  ok("Black to roll", s.turn === BLACK && s.phase === "roll");
  assert.throws(() => B.move(s, 24, 20), /not the time/);

  const order = rolled(setup({ 13: 1, 8: 1 }, { 1: 2 }), 5, 2);
  ok("both orders of the dice are allowed", B.nextSteps(order).length === 4);

  const doubles = rolled(setup({ 13: 2 }, { 1: 2 }), 3, 3);
  ok("doubles move four times", doubles.turns.every((t) => t.length === 4 && t.every((st) => st.die === 3)));
})();

(function barTests() {
  const s = rolled(setup({ 25: 1, 13: 4 }, { 1: 2, 3: 2, 4: 2, 5: 2, 6: 2 }), 6, 2);
  ok("from the bar you must enter first", B.nextSteps(s).every((st) => st.from === BAR));
  ok("entry on the 6 is blocked, the 2 lands on 23", B.nextSteps(s).map((st) => st.to).join() === "23");
  ok("after entering, the 6 is free", s.turns.every((t) => t[0].from === BAR && t[0].to === 23 && t.length === 2));

  const shut = rolled(setup({ 25: 1, 13: 4 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }), 6, 2);
  ok("a closed board: no move, the turn passes", shut.turns.length === 0 && B.turnComplete(shut));
  B.endTurn(shut);
  ok("pass", shut.turn === BLACK);

  const two = rolled(setup({ 25: 2, 6: 3 }, { 1: 2 }), 4, 3);
  ok("two on the bar use both dice to enter", two.turns.every((t) => t.every((st) => st.from === BAR)));
})();

(function bearOffTests() {
  const s = rolled(setup({ 6: 1, 3: 1, 7: 1 }, { 1: 2 }), 6, 4);
  ok("no bearing off with a checker outside", s.turns.every((t) => t[0].to !== OFF) && s.turns.some((t) => t[1].to === OFF), turnsOf(s));

  const exact = rolled(setup({ 5: 2, 2: 1 }, { 1: 2 }), 5, 2);
  ok("bear off with the exact number", exact.turns.some((t) => fmt(t) === "5/0 2/0"));

  const over = rolled(setup({ 4: 1, 2: 1 }, { 1: 2 }), 6, 5);
  ok("an overshoot bears off the rearmost checker", turnsOf(over).every((t) => t.split(" ").every((m) => m.endsWith("/0"))));
  B.move(over, 4, 0);
  ok("then the lower one", B.nextSteps(over).length === 1 && B.nextSteps(over)[0].from === 2);

  const noOver = rolled(setup({ 5: 1, 2: 1 }, { 1: 2 }), 3, 1);
  ok("no overshoot while a checker sits further back", noOver.turns.every((t) => t.find((st) => st.die === 3).from !== 2), turnsOf(noOver));

  const last = rolled(setup({ 1: 1 }, { 1: 2 }), 2, 1);
  B.move(last, 1, 0);
  ok("bearing off the last checker wins", last.gameOver && last.winner === WHITE);
})();

(function maxDiceTests() {
  // Black holds White's 12, so the 1 can't be played first; 13/7/6 uses both.
  const both = rolled(setup({ 13: 1 }, { 13: 2 }), 6, 1);
  ok("you must use both dice when you can", both.turns.every((t) => t.length === 2), turnsOf(both));
  ok("...even if that fixes the order", turnsOf(both).join() === "13/7 7/6");

  // Either die can be played alone but not both (White's 2 is held): the larger must go.
  const big = rolled(setup({ 13: 1 }, { 23: 2 }), 6, 5);
  ok("only one die playable: the larger", big.turns.length === 1 && fmt(big.turns[0]) === "13/7", turnsOf(big));

  const small = rolled(setup({ 13: 1 }, { 18: 2, 23: 2 }), 6, 5);
  ok("...unless the larger can't move at all", small.turns.length === 1 && fmt(small.turns[0]) === "13/8", turnsOf(small));
})();

(function resultTests() {
  const single = setup({ 1: 1 }, { 3: 2 });
  single.off[BLACK] = 13;
  ok("a single game", B.resultOf(single, WHITE).points === 1);
  const gammon = setup({ 1: 1 }, { 10: 15 });
  ok("a gammon: none borne off", B.resultOf(gammon, WHITE).kind === "gammon");
  const bg = setup({ 1: 1 }, { 10: 14, 22: 1 });
  ok("a backgammon: one still in the winner's home board", B.resultOf(bg, WHITE).kind === "backgammon" && B.resultOf(bg, WHITE).points === 3);
})();

// ---- AI ------------------------------------------------------------------------------

(function hitChanceTests() {
  // White's blot on its 20 is Black's 5; a Black checker on 5+d shoots from d away.
  const at = (d) => B.hitChance(setup({ 20: 1 }, { [5 + d]: 1 }), WHITE, 20);
  ok("a direct shot 1 away: 11/36", Math.abs(at(1) - 11 / 36) < 1e-9);
  ok("6 away: 17/36", Math.abs(at(6) - 17 / 36) < 1e-9);
  ok("11 away: 2/36", Math.abs(at(11) - 2 / 36) < 1e-9);
  ok("past every shooter: safe", B.hitChance(setup({ 20: 1 }, { 3: 1 }), WHITE, 20) === 0);
  // White's 4 is Black's 21: 4 from the bar. Black's 23 is 2 away but stuck behind the bar checker.
  ok("with a checker on the bar, only it shoots", Math.abs(B.hitChance(setup({ 4: 1 }, { 25: 1, 23: 1 }), WHITE, 4) - 15 / 36) < 1e-9);
})();

(function openingTests() {
  const book = { "3-1": "8/5 6/5", "4-2": "8/4 6/4", "6-1": "13/7 8/7", "5-3": "8/3 6/3" };
  for (const level of ["medium", "hard"]) {
    for (const [roll, play] of Object.entries(book)) {
      const [a, b] = roll.split("-").map(Number);
      const s = rolled(setup({ 24: 2, 13: 5, 8: 3, 6: 5 }, { 24: 2, 13: 5, 8: 3, 6: 5 }), a, b);
      const t = B.chooseTurn(s, level, makeRng(3));
      ok(level + " plays the " + roll + " opening as " + play, fmt(t.slice().sort((x, y) => y.from - x.from)) === play, fmt(t));
    }
  }
})();

function playOut(levels, seed) {
  const rng = makeRng(seed);
  const s = B.createGame(rng);
  let turns = 0;
  while (!s.gameOver) {
    if (++turns > 1000) throw new Error("game did not finish");
    if (s.phase === "roll") B.roll(s, rng);
    const lv = levels[s.turn === WHITE ? 0 : 1];
    const t = lv === "random" ? (s.turns.length ? s.turns[Math.floor(rng() * s.turns.length)] : []) : B.chooseTurn(s, lv, rng);
    for (const st of t) if (!s.gameOver) B.move(s, st.from, st.to);
    if (!s.gameOver) B.endTurn(s);
    if (total(s, WHITE) !== 15 || total(s, BLACK) !== 15) throw new Error("checkers not conserved");
  }
  return s;
}

(function gamesTest() {
  let wins = 0;
  const games = 30;
  for (let g = 0; g < games; g++) {
    const flip = g % 2;
    const s = playOut(flip ? ["random", "medium"] : ["medium", "random"], 200 + g);
    if (s.winner === (flip ? BLACK : WHITE)) wins++;
  }
  ok("Medium beats random play (" + wins + "/" + games + "), 15 checkers a side throughout", wins >= 27);

  let hardWins = 0;
  for (let g = 0; g < 4; g++) if (playOut(g % 2 ? ["easy", "hard"] : ["hard", "easy"], 300 + g).winner === (g % 2 ? BLACK : WHITE)) hardWins++;
  ok("Hard plays out full games (" + hardWins + "/4 against Easy)", hardWins >= 2);
})();

console.log("backgammon.test.js: " + passed + " assertions passed");
