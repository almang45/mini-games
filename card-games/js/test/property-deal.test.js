const assert = require("assert");
const CARDS = require("../core/cards.js");
const P = require("../games/property-deal.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const prop = (color, value) => P.prop([color], value == null ? 2 : value);
const act = (type) => P.action(type);

// A game at the start of seat 0's turn with hand-built hands and tables.
function table(seatCount, { hands, sets, banks, drawPile } = {}) {
  const state = P.createGame(Array(seatCount).fill("human"), { rng: CARDS.makeRng(1) });
  state.hands = Array.from({ length: seatCount }, (_, i) => ((hands && hands[i]) || []).slice());
  state.tables = Array.from({ length: seatCount }, () => P.emptyTable());
  (sets || []).forEach((bySeat, i) => Object.keys(bySeat || {}).forEach((color) => { state.tables[i].sets[color].cards.push(...bySeat[color]); }));
  (banks || []).forEach((cards, i) => { if (cards) state.tables[i].bank.push(...cards); });
  state.drawPile = drawPile || Array.from({ length: 20 }, () => P.money(1));
  state.discard = [];
  state.turn = 0;
  state.plays = 0;
  state.phase = "play";
  state.pending = null;
  return state;
}

function cardCount(state) {
  let n = state.drawPile.length + state.discard.length + state.hands.reduce((a, h) => a + h.length, 0);
  state.tables.forEach((t) => {
    n += t.bank.length;
    P.COLORS.forEach((c) => { const set = t.sets[c]; n += set.cards.length + (set.house ? 1 : 0) + (set.hotel ? 1 : 0); });
  });
  return n;
}

// ---- deck ---------------------------------------------------------------------

(function deckTests() {
  const deck = P.buildDeck();
  const of = (pred) => deck.filter(pred);
  ok("106 cards", deck.length === 106);
  ok("20 money cards worth $57M", of((c) => c.kind === "money").length === 20 && of((c) => c.kind === "money").reduce((s, c) => s + c.value, 0) === 57);
  ok("28 plain properties", of((c) => c.kind === "prop" && !P.isWild(c)).length === 28);
  ok("11 wilds, two of any colour worth nothing", of(P.isWild).length === 11 && of((c) => c.kind === "prop" && P.isAnyColor(c) && c.value === 0).length === 2);
  ok("13 rent cards, 3 of any colour", of((c) => c.kind === "rent").length === 13 && of((c) => c.kind === "rent" && P.isAnyColor(c)).length === 3);
  ok("34 action cards", of((c) => c.kind === "action").length === 34);
  ok("ten Bonus Draws, three Blocks", of((c) => c.type === "bonusdraw").length === 10 && of((c) => c.type === "block").length === 3);
  for (const color of P.COLORS) {
    ok(color + ": plain cards fill exactly one set", of((c) => c.kind === "prop" && !P.isWild(c) && c.colors[0] === color).length === P.setSize(color));
  }
  ok("ids unique", new Set(deck.map((c) => c.id)).size === 106);
})();

(function createTests() {
  assert.throws(() => P.createGame(["human"]), /2-4/);
  assert.throws(() => P.createGame(Array(5).fill("ai")), /2-4/);
  const state = P.createGame(["human", "ai", "ai"], { rng: CARDS.makeRng(3) });
  ok("five each, and seat 1 has drawn 2", state.hands.map((h) => h.length).join() === "7,5,5");
  ok("the rest is the draw pile", state.drawPile.length === 106 - 17);
  ok("seat 1 to play", P.actingSeat(state) === 0 && state.phase === "play");
})();

// ---- table and rent ---------------------------------------------------------------

(function rentTests() {
  const t = P.emptyTable();
  ok("no cards, no rent", P.rentFor(t, "green") === 0);
  t.sets.green.cards.push(prop("green"), prop("green"));
  ok("two greens: 4", P.rentFor(t, "green") === 4);
  t.sets.green.cards.push(prop("green"));
  ok("full green: 7", P.rentFor(t, "green") === 7 && P.isFull(t, "green"));
  t.sets.green.house = act("house");
  t.sets.green.hotel = act("hotel");
  ok("house +3, hotel +4", P.rentFor(t, "green") === 14);
  t.sets.station.cards.push(...Array.from({ length: 5 }, () => prop("station")));
  ok("rent stops at a full set", P.rentFor(t, "station") === 4);
})();

// ---- playing cards -----------------------------------------------------------------

(function basicPlayTests() {
  const m5 = P.money(5), red = prop("red", 3), wild = P.prop(["red", "yellow"], 3), any = P.prop(P.COLORS.slice(), 0);
  const state = table(2, { hands: [[m5, red, wild, any, P.money(1)]] });
  assert.throws(() => P.playCard(state, 0, red.id, { as: "bank" }), /can't be banked/);
  assert.throws(() => P.playCard(state, 0, wild.id, { as: "prop", color: "green" }), /isn't/);
  assert.throws(() => P.playCard(state, 0, wild.id, { as: "prop" }), /colour/);
  assert.throws(() => P.playCard(state, 1, m5.id, { as: "bank" }), /turn/);
  P.playCard(state, 0, m5.id, { as: "bank" });
  P.playCard(state, 0, wild.id, { as: "prop", color: "yellow" });
  P.playCard(state, 0, any.id, { as: "prop", color: "darkblue" });
  ok("bank and table", P.bankTotal(state.tables[0]) === 5 && state.tables[0].sets.yellow.cards.length === 1);
  ok("an any-colour wild goes anywhere", state.tables[0].sets.darkblue.cards.length === 1);
  assert.throws(() => P.playCard(state, 0, red.id, { as: "prop", color: "red" }), /no plays left/);
  P.endTurn(state, 0);
  ok("turn passes, next seat draws 5 on an empty hand", state.turn === 1 && state.hands[1].length === 5);
})();

(function bonusDrawTests() {
  const card = act("bonusdraw");
  const state = table(2, { hands: [[card]] });
  P.playCard(state, 0, card.id, { as: "action" });
  ok("draws 2", state.hands[0].length === 2 && state.plays === 1);
})();

(function discardTests() {
  const hand = Array.from({ length: 9 }, () => P.money(1));
  const state = table(2, { hands: [hand] });
  P.endTurn(state, 0);
  ok("over seven: discard first", state.phase === "discard" && state.turn === 0);
  P.discardCard(state, 0, hand[0].id);
  ok("still eight", state.phase === "discard");
  P.discardCard(state, 0, hand[1].id);
  ok("seven: the turn passes", state.turn === 1 && state.discard.length === 2);
})();

(function reshuffleTests() {
  const state = table(2, { hands: [[], [P.money(1)]], drawPile: [] });
  state.discard = [P.money(2), P.money(3)];
  P.endTurn(state, 0);
  ok("an empty pile is refilled from the discards", state.hands[1].length === 3 && state.discard.length === 0);
})();

// ---- rent and payment ----------------------------------------------------------------

(function rentPlayTests() {
  const pair = P.rent(["red", "yellow"], 1);
  const state = table(3, {
    hands: [[pair, act("double")]],
    sets: [{ red: [prop("red", 3), prop("red", 3)] }],
    banks: [null, [P.money(1)], [P.money(10)]],
  });
  assert.throws(() => P.playCard(state, 0, pair.id, { as: "rent", color: "yellow" }), /no yellow/);
  P.playCard(state, 0, pair.id, { as: "rent", color: "red", double: true });
  ok("Double Rent uses a second play", state.plays === 2);
  ok("seat 2 has less than the $6M owed and pays everything", P.bankTotal(state.tables[1]) === 0);
  ok("seat 3 has more, so it chooses", state.phase === "pay" && P.actingSeat(state) === 2);
  assert.throws(() => P.pay(state, 2, []), /only \$0M/);
  P.pay(state, 2, [state.tables[2].bank[0].id]);
  ok("no change given", P.bankTotal(state.tables[0]) === 11 && state.phase === "play");

  const wildRent = P.rent(P.COLORS.slice(), 3);
  const one = table(3, { hands: [[wildRent]], sets: [{ red: [prop("red", 3)] }], banks: [null, [P.money(2)], [P.money(2)]] });
  assert.throws(() => P.playCard(one, 0, wildRent.id, { as: "rent", color: "red" }), /who pays/);
  P.playCard(one, 0, wildRent.id, { as: "rent", color: "red", target: 2 });
  ok("an any-colour rent charges one seat", P.bankTotal(one.tables[1]) === 2 && P.bankTotal(one.tables[2]) === 0);
})();

(function paymentTests() {
  const debt = act("debt");
  const green = [prop("green", 4), prop("green", 4), prop("green", 4)];
  const any = P.prop(P.COLORS.slice(), 0);
  const state = table(2, { hands: [[debt]], sets: [{}, { green, brown: [any] }], banks: [null, [P.money(1)]] });
  state.tables[1].sets.green.house = act("house");
  P.playCard(state, 0, debt.id, { as: "action", target: 1 });
  ok("properties count toward paying", state.phase === "pay");
  assert.throws(() => P.pay(state, 1, [any.id]), /can't pay with/);
  P.pay(state, 1, [green[0].id, state.tables[1].bank[0].id]);
  ok("a paid property joins the payee's set", state.tables[0].sets.green.cards.length === 1);
  ok("a broken set sends its house to the bank", !state.tables[1].sets.green.house && state.tables[1].bank.some((c) => c.type === "house"));
})();

(function birthdayTests() {
  const bday = act("birthday");
  const state = table(4, { hands: [[bday]], banks: [null, [P.money(1)], [P.money(2)], [P.money(5)]] });
  P.playCard(state, 0, bday.id, { as: "action" });
  ok("everyone else owes $2M, the short and exact pay without asking", state.phase === "pay" && P.actingSeat(state) === 3);
  P.pay(state, 3, [state.tables[3].bank[0].id]);
  ok("all collected", P.bankTotal(state.tables[0]) === 8 && state.phase === "play");
})();

// ---- Block -----------------------------------------------------------------------------

(function blockTests() {
  const steal = act("steal");
  const target = prop("red", 3);
  const state = table(2, { hands: [[steal, act("block")], [act("block")]], sets: [{}, { red: [target] }] });
  P.playCard(state, 0, steal.id, { as: "action", target: 1, theirId: target.id });
  ok("the target may Block", state.phase === "respond" && P.actingSeat(state) === 1);
  P.respond(state, 1, true);
  ok("then the player may Block back", P.actingSeat(state) === 0);
  P.respond(state, 0, true);
  ok("two Blocks: the Steal goes through", state.tables[0].sets.red.cards.length === 1 && state.phase === "play");
  ok("Blocks don't use plays", state.plays === 1);

  const once = table(2, { hands: [[act("steal")], [act("block")]], sets: [{}, { red: [prop("red", 3)] }] });
  const s2 = once.hands[0][0];
  P.playCard(once, 0, s2.id, { as: "action", target: 1, theirId: once.tables[1].sets.red.cards[0].id });
  P.respond(once, 1, true);
  ok("one Block and nobody to answer it: cancelled", once.tables[1].sets.red.cards.length === 1 && once.phase === "play");

  const accept = table(2, { hands: [[act("debt")], [act("block")]], banks: [null, [P.money(5)]] });
  P.playCard(accept, 0, accept.hands[0][0].id, { as: "action", target: 1 });
  assert.throws(() => P.respond(accept, 0, false), /response/);
  P.respond(accept, 1, false);
  ok("declining to Block pays up", P.bankTotal(accept.tables[0]) === 5);
})();

// ---- Steal, Swap, Set Grab, buildings ---------------------------------------------------

(function takeTests() {
  const reds = [prop("red", 3), prop("red", 3), prop("red", 3)];
  const blue = prop("darkblue", 4);
  const steal = act("steal");
  const state = table(2, { hands: [[steal, act("swap"), act("setgrab")]], sets: [{ brown: [prop("brown", 1)] }, { red: reds, darkblue: [blue] }] });
  assert.throws(() => P.playCard(state, 0, steal.id, { as: "action", target: 1, theirId: reds[0].id }), /can't be stolen/);
  P.playCard(state, 0, steal.id, { as: "action", target: 1, theirId: blue.id });
  ok("Steal takes a loose property", state.tables[0].sets.darkblue.cards.length === 1 && state.tables[1].sets.darkblue.cards.length === 0);

  const swap = state.hands[0].find((c) => c.type === "swap");
  assert.throws(() => P.playCard(state, 0, swap.id, { as: "action", target: 1, theirId: reds[0].id, myId: blue.id }), /can't be taken/);

  state.tables[1].sets.red.house = act("house");
  const grab = state.hands[0].find((c) => c.type === "setgrab");
  P.playCard(state, 0, grab.id, { as: "action", target: 1, color: "red" });
  ok("Set Grab takes the whole set and its house", state.tables[0].sets.red.cards.length === 3 && state.tables[0].sets.red.house);
  ok("leaving nothing behind", state.tables[1].sets.red.cards.length === 0 && !state.tables[1].sets.red.house);

  const sw = table(2, { hands: [[act("swap")]], sets: [{ brown: [prop("brown", 1)] }, { green: [prop("green", 4)] }] });
  P.playCard(sw, 0, sw.hands[0][0].id, { as: "action", target: 1, theirId: sw.tables[1].sets.green.cards[0].id, myId: sw.tables[0].sets.brown.cards[0].id });
  ok("Swap trades one each way", sw.tables[0].sets.green.cards.length === 1 && sw.tables[1].sets.brown.cards.length === 1);
})();

(function buildingTests() {
  const house = act("house"), hotel = act("hotel"), house2 = act("house");
  const state = table(2, { hands: [[hotel, house, house2]], sets: [{ green: [prop("green"), prop("green"), prop("green")], station: [prop("station"), prop("station"), prop("station"), prop("station")], red: [prop("red")] }] });
  assert.throws(() => P.playCard(state, 0, hotel.id, { as: "action", color: "green" }), /needs a full set with a house/);
  assert.throws(() => P.playCard(state, 0, house.id, { as: "action", color: "station" }), /not stations/);
  assert.throws(() => P.playCard(state, 0, house.id, { as: "action", color: "red" }), /full set/);
  P.playCard(state, 0, house.id, { as: "action", color: "green" });
  assert.throws(() => P.playCard(state, 0, house2.id, { as: "action", color: "green" }), /already has a house/);
  P.playCard(state, 0, hotel.id, { as: "action", color: "green" });
  ok("house then hotel", P.rentFor(state.tables[0], "green") === 14);
})();

// ---- wilds and winning --------------------------------------------------------------------

(function wildAndWinTests() {
  const wild = P.prop(["red", "yellow"], 3);
  const state = table(2, {
    hands: [[prop("brown", 1)]],
    sets: [{ green: [prop("green"), prop("green"), prop("green")], darkblue: [prop("darkblue"), prop("darkblue")], red: [wild], yellow: [prop("yellow"), prop("yellow")] }],
  });
  assert.throws(() => P.moveWild(state, 0, wild.id, "green"), /can't move/);
  ok("two full sets: not yet", !state.gameOver);
  P.moveWild(state, 0, wild.id, "yellow");
  ok("moving a wild into a third full set wins at once", state.gameOver && state.winner === 0);
  assert.throws(() => P.endTurn(state, 0), /over/);

  const built = table(2, { sets: [{ red: [wild, prop("red"), prop("red")] }] });
  built.tables[0].sets.red.house = act("house");
  assert.throws(() => P.moveWild(built, 0, wild.id, "yellow"), /buildings/);
})();

(function winOnStealTests() {
  const steal = act("steal");
  const red = prop("red", 3);
  const state = table(2, {
    hands: [[steal]],
    sets: [{ green: [prop("green"), prop("green"), prop("green")], darkblue: [prop("darkblue"), prop("darkblue")], red: [prop("red"), prop("red")] }, { red: [red] }],
  });
  P.playCard(state, 0, steal.id, { as: "action", target: 1, theirId: red.id });
  ok("a stolen card can win", state.gameOver && state.winner === 0);
})();

// ---- AI ---------------------------------------------------------------------------------

(function aiTests() {
  const brown = prop("brown", 1), red = prop("red", 3);
  const state = table(2, { hands: [[brown, red, P.money(5)]], sets: [{ red: [prop("red"), prop("red")] }] });
  const move = P.aiChoosePlay(state, 0);
  ok("plays the property that completes a set", move.id === red.id && move.opt.color === "red");

  const grab = act("setgrab");
  const g = table(2, { hands: [[grab, prop("brown", 1)]], sets: [{}, { green: [prop("green"), prop("green"), prop("green")] }] });
  const gm = P.aiChoosePlay(g, 0);
  ok("grabs a full set before anything else", gm.id === grab.id && gm.opt.color === "green");

  const pay = table(2, { hands: [[act("debt")]], banks: [null, [P.money(1), P.money(2), P.money(3), P.money(10)]] });
  pay.tables[1].sets.red.cards.push(prop("red", 3));
  P.playCard(pay, 0, pay.hands[0][0].id, { as: "action", target: 1 });
  const ids = P.aiChoosePayment(pay, 1);
  const total = ids.reduce((s, id) => s + P.locate(pay.tables[1], id).card.value, 0);
  ok("pays the $5M debt exactly from the bank", total === 5 && ids.every((id) => P.locate(pay.tables[1], id).where === "bank"));

  const block = table(2, { hands: [[act("setgrab")], [act("block")]], sets: [{}, { green: [prop("green"), prop("green"), prop("green")] }] });
  P.playCard(block, 0, block.hands[0][0].id, { as: "action", target: 1, color: "green" });
  ok("always Blocks a Set Grab", P.aiShouldBlock(block, 1));
})();

// ---- full games --------------------------------------------------------------------------

// Every legal play for the seat to move.
function allPlays(state, seat) {
  const out = [];
  const others = state.seats.map((s, i) => i).filter((i) => i !== seat);
  const tryOpt = (card, opt) => { if (!P.playError(state, seat, card, opt)) out.push({ id: card.id, opt }); };
  if (state.plays >= P.PLAYS_PER_TURN) return out;
  state.hands[seat].forEach((c) => {
    tryOpt(c, { as: "bank" });
    if (c.kind === "prop") c.colors.forEach((color) => tryOpt(c, { as: "prop", color }));
    if (c.kind === "rent") c.colors.forEach((color) => others.concat([undefined]).forEach((target) => [false, true].forEach((double) => tryOpt(c, { as: "rent", color, target, double }))));
    if (c.kind !== "action") return;
    tryOpt(c, { as: "action" });
    P.COLORS.forEach((color) => tryOpt(c, { as: "action", color }));
    others.forEach((target) => {
      tryOpt(c, { as: "action", target });
      P.COLORS.forEach((color) => tryOpt(c, { as: "action", target, color }));
      P.loosePropertyIds(state.tables[target]).forEach((theirId) => {
        tryOpt(c, { as: "action", target, theirId });
        P.loosePropertyIds(state.tables[seat]).forEach((myId) => tryOpt(c, { as: "action", target, theirId, myId }));
      });
    });
  });
  return out;
}

// A legal but random player: plays, Blocks, payments, wild moves, discards.
function randomStep(state, seat, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  if (state.phase === "respond") return P.respond(state, seat, rng() < 0.5);
  if (state.phase === "pay") {
    const ids = [];
    let total = 0;
    for (const x of P.payable(state.tables[seat]).sort(() => rng() - 0.5)) {
      if (total >= state.pending.effect.amount) break;
      ids.push(x.card.id);
      total += x.card.value;
    }
    return P.pay(state, seat, ids);
  }
  if (state.phase === "discard") return P.discardCard(state, seat, pick(state.hands[seat]).id);
  const t = state.tables[seat];
  const wildMoves = P.COLORS.flatMap((c) => (t.sets[c].house ? [] : t.sets[c].cards.filter(P.isWild).flatMap((card) => card.colors.filter((to) => to !== c).map((to) => [card.id, to]))));
  if (wildMoves.length && rng() < 0.1) return P.moveWild(state, seat, ...pick(wildMoves));
  const plays = allPlays(state, seat);
  if (!plays.length || rng() < 0.15) return P.endTurn(state, seat);
  const m = pick(plays);
  return P.playCard(state, seat, m.id, m.opt);
}

function playOut(state, policy) {
  let steps = 0;
  let sound = true;
  while (!state.gameOver) {
    if (++steps > 100000) throw new Error("game did not finish");
    const seat = P.actingSeat(state);
    policy(seat)(state, seat);
    sound = sound && cardCount(state) === 106 && state.tables.every((t) => P.COLORS.every((c) =>
      (!t.sets[c].house || P.isFull(t, c)) && (!t.sets[c].hotel || t.sets[c].house)));
  }
  ok("all 106 cards kept, and every building on a full set (with a house under a hotel)", sound);
  return state;
}

for (const n of [2, 3, 4]) {
  for (let g = 0; g < 25; g++) {
    const state = playOut(P.createGame(Array(n).fill("ai"), { rng: CARDS.makeRng(500 * n + g) }), () => P.stepAI);
    ok(n + " seats AI game " + g + ": won on three sets", P.fullColors(state.tables[state.winner]).length >= 3);
  }
  for (let g = 0; g < 60; g++) {
    const rng = CARDS.makeRng(900 * n + g);
    playOut(P.createGame(Array(n).fill("ai"), { rng }), () => (state, seat) => randomStep(state, seat, rng));
  }
}

(function strengthTest() {
  let wins = 0;
  const games = 100;
  for (let g = 0; g < games; g++) {
    const base = g % 2;
    const rng = CARDS.makeRng(g + 5);
    const state = playOut(P.createGame(["ai", "ai"], { rng }), (seat) => (seat === base ? (s, x) => randomStep(s, x, rng) : P.stepAI));
    if (state.winner !== base) wins++;
  }
  ok("AI beats a random legal player (" + wins + "/" + games + ")", wins > games * 0.9);
})();

console.log("property-deal.test.js: " + passed + " assertions passed");
