const assert = require("assert");
const CARDS = require("../core/cards.js");
const L = require("../games/last-fuse.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const C = (kind) => L.card(kind);
const kinds = (cards) => cards.map((c) => c.kind).join();

// A game at the start of seat 0's turn with chosen hands and pile (top first).
function table(types, { hands, draw, rule } = {}) {
  const s = L.createGame(types, { rng: CARDS.makeRng(1), nopeRule: rule || "target" });
  s.hands = types.map((t, i) => ((hands && hands[i]) || []).slice());
  s.draw = (draw || [C("tabby"), C("tabby"), C("tabby")]).slice();
  s.discard = [];
  s.known = types.map(() => []);
  return s;
}
const humans = (n) => Array(n).fill("human");

// ---- setup ----------------------------------------------------------------------

(function setupTests() {
  for (const n of [2, 3, 4]) {
    const s = L.createGame(Array(n).fill("ai"), { rng: CARDS.makeRng(n) });
    ok(n + " seats: eight cards each, one a Defuse", s.hands.every((h) => h.length === 8 && h.filter((c) => c.kind === "defuse").length >= 1));
    ok(n + " seats: one Bomb fewer than players", L.bombsInPile(s) === n - 1);
    ok(n + " seats: no Bomb in any hand", s.hands.every((h) => !h.some((c) => c.kind === "bomb")));
    const all = s.draw.concat(...s.hands);
    ok(n + " seats: two spare Defuses in play", all.filter((c) => c.kind === "defuse").length === n + 2);
    ok(n + " seats: " + (47 + 2 * n) + " cards in play", all.length === 47 + 2 * n);
  }
  assert.throws(() => L.createGame(["human"]), /2-4/);
  ok("one human: anyone may Nope", L.createGame(["human", "ai", "ai"]).nopeRule === "anyone");
  ok("two humans: only the target", L.createGame(["human", "human", "ai"]).nopeRule === "target");
})();

// ---- drawing and Bombs ------------------------------------------------------------

(function drawTests() {
  const s = table(humans(3), { draw: [C("skip"), C("bomb")], hands: [[C("defuse")], [], []] });
  L.drawCard(s, 0);
  ok("a draw ends the turn", s.turn === 1 && s.hands[0].length === 2);
  assert.throws(() => L.drawCard(s, 0), /not this seat/);

  const d = table(humans(3), { draw: [C("bomb"), C("tabby"), C("tabby")], hands: [[C("defuse"), C("skip")], [], []] });
  L.drawCard(d, 0);
  ok("a Bomb with a Defuse: put it back", d.phase === "insert" && d.hands[0].length === 1 && L.actingSeat(d) === 0);
  assert.throws(() => L.insertBomb(d, 0, 9), /not a place/);
  L.insertBomb(d, 0, 0);
  ok("on top, and the turn passes", d.draw[0].kind === "bomb" && d.turn === 1);
  ok("the one who put it there knows", d.known[0][0] === d.draw[0].id && d.known[1].length === 0);
  L.drawCard(d, 1);
  ok("no Defuse: out", !d.alive[1] && d.out.join() === "1" && d.turn === 2);
  ok("its hand is discarded", d.hands[1].length === 0);

  const end = table(humans(2), { draw: [C("bomb")], hands: [[], []] });
  L.drawCard(end, 0);
  ok("last one standing wins", end.gameOver && end.winner === 1);
})();

// ---- Skip, Attack, Shuffle, See the Future -------------------------------------------

(function actionTests() {
  const skip = C("skip");
  const s = table(humans(3), { hands: [[skip], [], []] });
  L.playCard(s, 0, skip.id);
  ok("an untargeted card has no Nope window in target mode", s.phase === "play");
  ok("Skip ends the turn without drawing", s.turn === 1 && s.draw.length === 3);

  const att = C("attack"), att2 = C("attack");
  const a = table(humans(3), { hands: [[att], [att2], []] });
  L.playCard(a, 0, att.id);
  ok("Attack is aimed at the next player", a.phase === "respond" && L.actingSeat(a) === 1);
  L.respond(a, 1, false);
  ok("who now owes two turns", a.turn === 1 && a.turnsLeft === 2);
  L.playCard(a, 1, att2.id);
  L.respond(a, 2, false);
  ok("Attack while attacked: next owes the 2 left plus 2", a.turn === 2 && a.turnsLeft === 4);
  L.drawCard(a, 2);
  ok("each draw pays one", a.turn === 2 && a.turnsLeft === 3);

  const fut = C("future"), shuf = C("shuffle");
  const f = table(humans(2), { hands: [[fut, shuf], []], draw: [C("bomb"), C("skip"), C("tabby"), C("calico")] });
  L.playCard(f, 0, fut.id);
  ok("See the Future shows the top three", f.known[0].length === 3 && f.known[0][0] === f.draw[0].id);
  ok("and the AI reads it as certain", L.risk(f, 0) === 1);
  L.playCard(f, 0, shuf.id);
  ok("a shuffle wipes what anyone knew", f.known[0].length === 0);
})();

// ---- Favor, pairs, triples --------------------------------------------------------------

(function takeTests() {
  const fav = C("favor"), gift = C("nope");
  const s = table(humans(2), { hands: [[fav], [gift, C("tabby")]] });
  L.playCard(s, 0, fav.id, { target: 1 });
  L.respond(s, 1, false);
  ok("the Favor target chooses what to give", s.phase === "favor" && L.actingSeat(s) === 1);
  assert.throws(() => L.giveFavor(s, 0, gift.id), /not this seat/);
  L.giveFavor(s, 1, gift.id);
  ok("and it changes hands", s.hands[0].some((c) => c.id === gift.id) && s.phase === "play");

  const p1 = C("calico"), p2 = C("calico");
  const pair = table(humans(2), { hands: [[p1, p2, C("tabby")], [C("defuse")]] });
  assert.throws(() => L.playCard(pair, 0, p1.id, { target: 1, ids: [p1.id, pair.hands[0][2].id] }), /same cat/);
  assert.throws(() => L.playCard(pair, 0, p1.id, { target: 1 }), /same cat/);
  L.playCard(pair, 0, p1.id, { target: 1, ids: [p1.id, p2.id] });
  L.respond(pair, 1, false);
  ok("a pair takes a random card", pair.hands[0].some((c) => c.kind === "defuse") && pair.hands[1].length === 0);

  const t = [C("ginger"), C("ginger"), C("ginger")];
  const tri = table(humans(2), { hands: [t.slice(), [C("defuse"), C("skip")]] });
  L.playCard(tri, 0, t[0].id, { target: 1, ids: t.map((c) => c.id), name: "defuse" });
  L.respond(tri, 1, false);
  ok("a triple takes the named card", kinds(tri.hands[0]) === "defuse" && kinds(tri.hands[1]) === "skip");

  const miss = [C("ginger"), C("ginger"), C("ginger")];
  const none = table(humans(2), { hands: [miss.slice(), [C("skip")]] });
  L.playCard(none, 0, miss[0].id, { target: 1, ids: miss.map((c) => c.id), name: "defuse" });
  L.respond(none, 1, false);
  ok("or nothing if they don't have it", none.hands[0].length === 0 && none.hands[1].length === 1);

  assert.throws(() => L.playCard(table(humans(2), { hands: [[C("nope")], []] }), 0, "x"), /not in hand/);
  const n = table(humans(2), { hands: [[C("defuse")], []] });
  assert.throws(() => L.playCard(n, 0, n.hands[0][0].id), /on its own/);
})();

// ---- Nope ---------------------------------------------------------------------------------

(function targetNopeTests() {
  const fav = C("favor");
  const s = table(humans(3), { hands: [[fav, C("nope")], [C("nope"), C("defuse")], [C("nope")]] });
  L.playCard(s, 0, fav.id, { target: 1 });
  ok("target mode: only the target is asked", s.phase === "respond" && L.actingSeat(s) === 1);
  L.respond(s, 1, true);
  ok("then the player, back and forth", L.actingSeat(s) === 0);
  L.respond(s, 0, true);
  ok("the target again, Nope in hand or not", L.actingSeat(s) === 1);
  assert.throws(() => L.respond(s, 1, true), /no Nope/);
  L.respond(s, 1, false);
  ok("two Nopes: the Favor goes ahead", s.phase === "favor");
  ok("seat 3 was never asked", s.hands[2].length === 1);

  const once = table(humans(2), { hands: [[C("favor")], [C("nope"), C("defuse")]] });
  L.playCard(once, 0, once.hands[0][0].id, { target: 1 });
  L.respond(once, 1, true);
  L.respond(once, 0, false);
  ok("one Nope: nothing happens", once.phase === "play" && once.hands[1].length === 1);
})();

(function anyoneNopeTests() {
  // One human (seat 0) and two AIs. AIs answer on the spot; the human is
  // asked only with a Nope in hand.
  const att = C("attack");
  const s = table(["human", "ai", "ai"], { rule: "anyone", hands: [[att], [C("nope")], [C("nope")]], draw: [C("bomb"), C("tabby")] });
  s.known[1] = [s.draw[0].id]; // seat 2 knows a Bomb is on top: it will Nope the Attack
  L.playCard(s, 0, att.id);
  ok("the AI target Nopes on the spot, with no pause", s.phase === "play" && s.hands[1].length === 0);
  ok("so the Attack is cancelled", s.turn === 0 && s.turnsLeft === 1);

  const h = table(["ai", "human", "ai"], { rule: "anyone", hands: [[C("favor")], [C("nope"), C("defuse")], []] });
  L.playCard(h, 0, h.hands[0][0].id, { target: 1 });
  ok("a human holding a Nope is asked", h.phase === "respond" && L.actingSeat(h) === 1);
  L.respond(h, 1, false);
  ok("declining lets it through", h.phase === "favor");

  const quiet = table(["ai", "human", "ai"], { rule: "anyone", hands: [[C("favor")], [C("defuse")], []] });
  L.playCard(quiet, 0, quiet.hands[0][0].id, { target: 1 });
  ok("a human without one isn't asked", quiet.phase === "favor");
})();

// ---- AI ----------------------------------------------------------------------------------

(function aiTests() {
  const s = table(["ai", "ai"], { hands: [[C("skip"), C("tabby")], []], draw: [C("bomb"), C("tabby")] });
  s.known[0] = [s.draw[0].id];
  ok("skips a Bomb it knows is on top", L.aiChoosePlay(s, 0).type === "play" && s.hands[0].find((c) => c.id === L.aiChoosePlay(s, 0).id).kind === "skip");

  const look = table(["ai", "ai"], { hands: [[C("tabby"), C("tabby"), C("defuse")], [C("skip")]] });
  ok("with a Defuse and low risk it just draws", L.aiChoosePlay(look, 0).type === "draw");
  look.hands[0] = look.hands[0].filter((c) => c.kind !== "defuse");
  const m = L.aiChoosePlay(look, 0);
  ok("without one, a pair goes fishing", m.type === "play" && m.opt.ids.length === 2 && m.opt.target === 1);

  const give = table(["ai", "ai"], { hands: [[], [C("defuse"), C("tabby"), C("nope")]] });
  ok("gives away the least useful card", give.hands[1].find((c) => c.id === L.aiChooseFavor(give, 1)).kind === "tabby");

  const top = table(["ai", "ai", "ai"], { hands: [[], [], []] });
  ok("puts a Bomb back on top for the next player", L.aiInsertPosition(top, 0) === 0);
})();

// ---- full games -----------------------------------------------------------------------------

function cardsInPlay(s) { return s.draw.length + s.discard.length + s.hands.reduce((a, h) => a + h.length, 0) + (s.drawn ? 1 : 0); }

// A legal but random player.
function randomStep(s, seat, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  if (s.phase === "respond") return L.respond(s, seat, s.hands[seat].some((c) => c.kind === "nope") && rng() < 0.5);
  if (s.phase === "favor") return L.giveFavor(s, seat, pick(s.hands[seat]).id);
  if (s.phase === "insert") return L.insertBomb(s, seat, Math.floor(rng() * (s.draw.length + 1)));
  const others = s.seats.map((x, i) => i).filter((i) => i !== seat && s.alive[i]);
  const options = [];
  s.hands[seat].forEach((c) => {
    if (L.isCat(c.kind)) {
      const same = s.hands[seat].filter((x) => x.kind === c.kind).map((x) => x.id);
      if (same.length >= 2) options.push({ id: same[0], opt: { target: pick(others), ids: same.slice(0, 2) } });
      if (same.length >= 3) options.push({ id: same[0], opt: { target: pick(others), ids: same.slice(0, 3), name: pick(Object.keys(L.NAME)) } });
    } else if (!L.playError(s, seat, c, { target: pick(others) })) {
      options.push({ id: c.id, opt: { target: pick(others) } });
    }
  });
  if (!options.length || rng() < 0.4) return L.drawCard(s, seat);
  const m = pick(options);
  return L.playCard(s, seat, m.id, m.opt);
}

function playOut(s, policyFor) {
  const total = cardsInPlay(s);
  let steps = 0, kept = true;
  while (!s.gameOver) {
    if (++steps > 10000) throw new Error("game did not finish");
    const seat = L.actingSeat(s);
    policyFor(seat)(s, seat);
    kept = kept && cardsInPlay(s) === total;
  }
  ok("every card kept, " + s.seats.length + " seats, " + s.nopeRule, kept);
  return s;
}

for (const rule of ["anyone", "target"]) {
  for (const n of [2, 3, 4]) {
    for (let g = 0; g < 20; g++) playOut(L.createGame(Array(n).fill("ai"), { rng: CARDS.makeRng(100 * n + g), nopeRule: rule }), () => L.stepAI);
    for (let g = 0; g < 40; g++) {
      const rng = CARDS.makeRng(700 * n + g);
      playOut(L.createGame(Array(n).fill("ai"), { rng, nopeRule: rule }), () => (s, seat) => randomStep(s, seat, rng));
    }
  }
}

(function strengthTest() {
  let wins = 0;
  const games = 300;
  for (let g = 0; g < games; g++) {
    const base = g % 2;
    const rng = CARDS.makeRng(g + 9);
    const s = playOut(L.createGame(["ai", "ai"], { rng, nopeRule: "target" }), (seat) => (seat === base ? (x, y) => randomStep(x, y, rng) : L.stepAI));
    if (s.winner !== base) wins++;
  }
  ok("AI beats a random player (" + wins + "/" + games + ")", wins > games * 0.75);
})();

console.log("last-fuse.test.js: " + passed + " assertions passed");
