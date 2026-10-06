// End-to-end headless smoke test: loads the REAL index.html script bundle
// (core -> engines -> ui adapters -> app.js) into a Node + DOM-shim sandbox
// and drives full games through the actual controller (js/app.js), the same
// code path a browser click would take. Engine correctness is already
// covered by hearts/crazy-eights/president.test.js; this test exists purely
// to catch wiring bugs (bad ids, mismatched function signatures, null refs)
// in app.js and js/ui/*.js that those engine-only tests can't see.
"use strict";
const assert = require("assert");
const { createDocument } = require("./dom-shim.js");

global.document = createDocument();
global.window = global;
global.setTimeout = (fn) => { setImmediate(fn); return 0; };
global.clearTimeout = () => {};

const CARDS = require("../core/cards.js");
global.CARDS = CARDS;
require("../core/dom.js"); // self-registers global.DOM (browser-style export, no module.exports)
const HEARTS = require("../games/hearts.js"); global.HEARTS = HEARTS;
const CRAZY_EIGHTS = require("../games/crazy-eights.js"); global.CRAZY_EIGHTS = CRAZY_EIGHTS;
const PRESIDENT = require("../games/president.js"); global.PRESIDENT = PRESIDENT;
const BIG_TWO = require("../games/big-two.js"); global.BIG_TWO = BIG_TWO;
const CHINESE_POKER = require("../games/chinese-poker.js"); global.CHINESE_POKER = CHINESE_POKER;
const BLACKJACK = require("../games/blackjack.js"); global.BLACKJACK = BLACKJACK;
const SPADES = require("../games/spades.js"); global.SPADES = SPADES;
const GIN_RUMMY = require("../games/gin-rummy.js"); global.GIN_RUMMY = GIN_RUMMY;
const OH_HELL = require("../games/oh-hell.js"); global.OH_HELL = OH_HELL;
const EUCHRE = require("../games/euchre.js"); global.EUCHRE = EUCHRE;
const HOLDEM = require("../games/texas-holdem.js"); global.HOLDEM = HOLDEM;
const CRIBBAGE = require("../games/cribbage.js"); global.CRIBBAGE = CRIBBAGE;
const BUST_SEVEN = require("../games/bust-seven.js"); global.BUST_SEVEN = BUST_SEVEN;
const COLOR_CLASH = require("../games/color-clash.js"); global.COLOR_CLASH = COLOR_CLASH;
const PROPERTY_DEAL = require("../games/property-deal.js"); global.PROPERTY_DEAL = PROPERTY_DEAL;
require("../ui/hearts-ui.js");
require("../ui/crazy-eights-ui.js");
require("../ui/president-ui.js");
require("../ui/big-two-ui.js");
require("../ui/chinese-poker-ui.js");
require("../ui/blackjack-ui.js");
require("../ui/spades-ui.js");
require("../ui/gin-rummy-ui.js");
require("../ui/oh-hell-ui.js");
require("../ui/euchre-ui.js");
require("../ui/texas-holdem-ui.js");
require("../ui/cribbage-ui.js");
require("../ui/bust-seven-ui.js");
require("../ui/color-clash-ui.js");
require("../ui/property-deal-ui.js");
const app = require("../app.js");
global.document._fireDOMContentLoaded();

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

function tick() { return new Promise((resolve) => setImmediate(resolve)); }

async function waitForPause(maxTicks) {
  for (let i = 0; i < maxTicks; i++) {
    const state = app.getEngineState();
    const game = app.getCurrentGame();
    if (state.gameOver || game.isInterim(state)) return;
    const seat = game.actingSeat(state);
    if (seat == null || state.seats[seat].type === "human") return;
    await tick();
  }
  throw new Error("AI auto-play chain did not settle within " + maxTicks + " ticks");
}

function heartsHumanMove(state, seat) {
  if (state.round.phase === "passing") {
    HEARTS.aiChoosePass(state.round.hands[seat]).forEach((c) => app.playCard(seat, c));
    app.clickAction(app.getCurrentGame().actionButtons(state, seat)[0].label);
  } else {
    app.playCard(seat, HEARTS.aiChoosePlay(state, seat));
  }
}

function ceHumanMove(state, seat) {
  const legal = CRAZY_EIGHTS.getLegalPlays(state, seat);
  if (legal.length > 0) {
    const { card, declaredSuit } = CRAZY_EIGHTS.aiChoosePlay(state, seat);
    app.playCard(seat, card);
    if (app.isSuitModalShowing()) app.chooseSuit(declaredSuit);
  } else {
    app.clickAction("Draw Card");
  }
}

function presHumanMove(state, seat) {
  const combo = PRESIDENT.aiChoosePlay(state, seat);
  if (combo) {
    combo.forEach((c) => app.playCard(seat, c));
    app.clickAction("Play Selected");
  } else {
    app.clickAction("Pass");
  }
}

function bigTwoHumanMove(state, seat) {
  const combo = BIG_TWO.aiChoosePlay(state, seat);
  if (combo) {
    combo.forEach((c) => app.playCard(seat, c));
    app.clickAction("Play Selected");
  } else {
    app.clickAction("Pass");
  }
}

// The UI cycles a card null -> front -> middle -> back on each click, skipping
// any row that's already full. Clicking every dealt card exactly once, in
// hand order, therefore fills front (3) then middle (5) then back (5) - not
// necessarily the AI's preferred partition, but always a full, submittable
// arrangement, which is all this wiring smoke test needs.
function cpHumanMove(state, seat) {
  state.hands[seat].forEach((c) => app.playCard(seat, c));
  const label = app.getCurrentGame().actionButtons(state, seat)[0].label;
  app.clickAction(label);
}

function bjHumanMove(state, seat) {
  const action = BLACKJACK.aiChooseAction(state, seat);
  app.clickAction(action === "hit" ? "Hit" : action === "double" ? "Double Down" : "Stand");
}

// Bidding exercises the -/+ stepper once before submitting, so its label
// round-trip through actionButtons -> syncTable is covered too.
function spadesHumanMove(state, seat) {
  if (state.round.phase !== "bidding") {
    app.playCard(seat, SPADES.aiChoosePlay(state, seat));
    return;
  }
  const buttons = () => app.getCurrentGame().actionButtons(state, seat);
  if (!buttons().find((b) => b.label === "−").disabled) app.clickAction("−");
  app.clickAction(buttons().find((b) => b.primary).label);
}

function ginHumanMove(state, seat) {
  if (state.hand.phase === "draw") {
    const take = GIN_RUMMY.aiWantsDiscard(state, seat);
    app.clickAction(take ? "Take " + CARDS.cardLabel(GIN_RUMMY.topDiscard(state)) : "Draw from Stock");
    return;
  }
  const { card, deadwood } = GIN_RUMMY.aiChooseDiscard(state, seat);
  app.playCard(seat, card); // selects it
  const knock = GIN_RUMMY.aiShouldKnock(state, deadwood);
  app.clickAction(!knock ? "Discard " + CARDS.cardLabel(card) : deadwood === 0 ? "Gin!" : "Knock (" + deadwood + " deadwood)");
}

// Stepping down can land on the dealer's forbidden bid; stepping back up
// returns to the AI's own (always legal) estimate.
function ohHellHumanMove(state, seat) {
  if (state.round.phase !== "bidding") {
    app.playCard(seat, OH_HELL.aiChoosePlay(state, seat));
    return;
  }
  const buttons = () => app.getCurrentGame().actionButtons(state, seat);
  if (!buttons().find((b) => b.label === "−").disabled) app.clickAction("−");
  if (buttons().find((b) => b.primary).disabled) app.clickAction("+");
  app.clickAction(buttons().find((b) => b.primary).label);
}

function euchreHumanMove(state, seat) {
  const h = state.hand;
  if (h.phase === "playing") return app.playCard(seat, EUCHRE.aiChoosePlay(state, seat));
  if (h.phase === "discard") return app.playCard(seat, EUCHRE.aiChooseDiscard(h.hands[seat], h.trump));
  if (h.phase === "order") {
    const order = (seat === state.dealerSeat ? "Pick Up " : "Order Up ") + CARDS.cardLabel(h.upcard);
    return app.clickAction(EUCHRE.aiWantsOrder(state, seat) ? order : "Pass");
  }
  const suit = EUCHRE.aiChooseName(state, seat);
  return app.clickAction(suit ? "Name " + CARDS.suitName(suit) : "Pass");
}

// Raises go through the stepper once, then bet whatever it shows.
function holdemHumanMove(state, seat) {
  const action = HOLDEM.aiChooseAction(state, seat);
  const buttons = () => app.getCurrentGame().actionButtons(state, seat);
  if (action.type === "raise") {
    if (!buttons().find((b) => b.label === "+").disabled) app.clickAction("+");
    return app.clickAction(buttons().find((b) => /^(Bet|Raise to) /.test(b.label)).label);
  }
  return app.clickAction(action.type === "fold" ? "Fold" : buttons().find((b) => b.primary).label);
}

function cribbageHumanMove(state, seat) {
  if (state.hand.phase === "pegging") return app.playCard(seat, CRIBBAGE.aiChoosePeg(state, seat));
  CRIBBAGE.aiChooseDiscard(state, seat).forEach((c) => app.playCard(seat, c)); // selects both
  return app.clickAction("Send to Crib (2/2)");
}

// Open hands: no interstitial ever, and every seat's cards are drawn with
// the game's own faces.
function bustSevenHumanMove(state, seat) {
  ok("bust seven never asks to pass the device", !app.isInterstitialShowing());
  const faces = findAll(global.document.getElementById("tableWrap"), (n) => n.classList && n.classList.contains("b7-card"));
  ok("bust seven cards use its own faces", faces.length > 0);
  if (state.phase === "target") {
    // One button per legal target, in the same order.
    const buttons = app.getCurrentGame().actionButtons(state, seat);
    const index = state.pending.targets.indexOf(BUST_SEVEN.aiChooseTarget(state, seat));
    ok("AI picks a legal target", index !== -1, { targets: state.pending.targets });
    return app.clickAction(buttons[index].label);
  }
  return app.clickAction(BUST_SEVEN.aiShouldHit(state, seat) ? "Hit" : "Stay");
}

// Plays through the real buttons and card clicks: colour names after a
// Wild, Challenge / Draw 4 on a Wild Draw Four, Play / Keep after a draw.
function colorClashHumanMove(state, seat) {
  if (state.phase === "color") return app.clickAction(COLOR_CLASH.COLOR_NAME[COLOR_CLASH.aiChooseColor(state, seat)]);
  if (state.phase === "challenge") return app.clickAction(COLOR_CLASH.aiShouldChallenge(state, seat) ? "Challenge" : "Draw 4");
  if (state.phase === "drawn") return app.clickAction(state.drawn.kind === "wild4" ? "Keep" : "Play " + COLOR_CLASH.cardLabel(state.drawn));
  const faces = findAll(global.document.getElementById("tableWrap"), (n) => n.classList && n.classList.contains("cc-card"));
  ok("color clash hand uses its own faces", faces.length > 0);
  const card = COLOR_CLASH.aiChoosePlay(state, seat);
  return card ? app.playCard(seat, card) : app.clickAction("Draw Card");
}

// Plays the AI's move through the real UI: click the card to draft it, then
// the option buttons whose (partial) options match the AI's, step by step.
// Payments click the chips in the seat's own table area, then Pay.
function propertyDealHumanMove(state, seat) {
  const PD = PROPERTY_DEAL;
  const game = app.getCurrentGame();
  const wrap = global.document.getElementById("tableWrap");
  ok("every seat shows its table", findAll(wrap, (n) => n.classList && n.classList.contains("pd-tableau")).length === state.seats.length);
  if (state.phase === "respond") return app.clickAction(PD.aiShouldBlock(state, seat) ? "Block" : "Let it happen");
  if (state.phase === "pay") {
    const ids = new Set(PD.aiChoosePayment(state, seat));
    const chips = findAll(wrap, (n) => n.dataset && ids.has(n.dataset.id));
    ok("a chip for every card the payment uses", chips.length === ids.size);
    chips.forEach((chip) => chip.click());
    return app.clickAction(game.actionButtons(state, seat).find((b) => b.primary).label);
  }
  if (state.phase === "discard") return app.playCard(seat, state.hands[seat][0]);
  const move = PD.aiChoosePlay(state, seat);
  if (move.type === "end") return app.clickAction("End Turn");
  if (move.type === "move") {
    app.clickAction("Move a wild…");
    const btn = game.actionButtons(state, seat).find((b) => b.move && b.move.id === move.id && b.move.color === move.color);
    ok("the AI's wild move is in the menu", !!btn, move);
    return app.clickAction(btn.label);
  }
  app.playCard(seat, state.hands[seat].find((c) => c.id === move.id));
  const matches = (part) => !!part && Object.keys(part).every((k) => (k === "double" ? !!part[k] === !!move.opt[k] : part[k] === move.opt[k]));
  for (let step = 0; step < 3; step++) {
    const btn = game.actionButtons(state, seat).find((b) => matches(b.opt || b.step));
    ok("the AI's play is offered as a button", !!btn, move.opt);
    app.clickAction(btn.label);
    if (!btn.step) return undefined;
  }
  throw new Error("play dialogue did not finish");
}

function findAll(node, pred, out) {
  out = out || [];
  if (pred(node)) out.push(node);
  (node.children || []).forEach((c) => findAll(c, pred, out));
  return out;
}

const HUMAN_MOVE = {
  hearts: heartsHumanMove, "crazy-eights": ceHumanMove, president: presHumanMove,
  "big-two": bigTwoHumanMove, "chinese-poker": cpHumanMove, blackjack: bjHumanMove,
  spades: spadesHumanMove, "gin-rummy": ginHumanMove, "oh-hell": ohHellHumanMove,
  euchre: euchreHumanMove, "texas-holdem": holdemHumanMove, cribbage: cribbageHumanMove,
  "bust-seven": bustSevenHumanMove, "color-clash": colorClashHumanMove, "property-deal": propertyDealHumanMove,
};

async function driveGame({ maxHumanSteps = 1500, maxTicks = 4000 } = {}) {
  await waitForPause(maxTicks);
  let steps = 0;
  while (!app.getEngineState().gameOver) {
    if (++steps > maxHumanSteps) throw new Error("game did not complete within " + maxHumanSteps + " driver steps");
    const state = app.getEngineState();
    const game = app.getCurrentGame();
    if (game.isInterim(state)) {
      const viewer = app.getViewerSeat();
      app.clickAction(game.actionButtons(state, viewer != null ? viewer : 0)[0].label); // "Deal Next Round" / "Deal Next Hand"
    } else {
      const seat = game.actingSeat(state);
      if (seat == null) throw new Error("stuck: no acting seat, not interim, not gameOver");
      ok("acting seat is human on the driver's turn", state.seats[seat].type === "human", { seat });
      if (app.isInterstitialShowing()) app.confirmInterstitial();
      HUMAN_MOVE[game.key](state, seat);
    }
    await waitForPause(maxTicks);
  }
  return app.getEngineState();
}

function setupSeats(gameKey, seatTypes) {
  app.selectGame(gameKey);
  for (let i = 0; i < 4; i++) app.setSeat(i, seatTypes[i] || "off");
}

// A game with its own deck passes renderFace; everything else keeps the
// standard suit-and-rank face. Both must share the card frame's classes.
function cardRendererChecks() {
  const std = global.DOM.cardEl({ suit: "H", rank: 14 }, { small: true });
  ok("standard face: red suit class", std.classList.contains("card-red"));
  ok("standard face: corners and pip", std.children.length === 3);
  ok("standard face: frame keeps small", std.classList.contains("card-small"));

  const seen = [];
  const renderFace = (card, face) => { seen.push(card.id); face.classList.add("custom-face"); };
  const custom = global.DOM.cardEl({ id: "x7" }, { renderFace, selected: true });
  ok("custom face: renderer called with the card", seen.join() === "x7");
  ok("custom face: standard face not drawn", custom.children.length === 0 && !custom.classList.contains("card-black"));
  ok("custom face: frame keeps selected", custom.classList.contains("card-selected") && custom.classList.contains("custom-face"));
  global.DOM.cardEl({ id: "x8" }, { renderFace, faceDown: true });
  ok("custom face: face-down skips the renderer", seen.length === 1);

  const fan = global.document.createElement("div");
  global.DOM.renderFan(fan, [{ id: "a" }, { id: "b" }], { renderFace });
  ok("renderFan passes renderFace to every card", seen.slice(1).join() === "a,b" && fan.children.length === 2);
}

// Random games don't reliably reach every Property Deal dialogue, so these
// set up the table by hand and click through each one: a two-step rent,
// paying by chips across a hot-seat handoff, and a Block.
function propertyDealScripted() {
  const PD = PROPERTY_DEAL;
  const wrap = global.document.getElementById("tableWrap");
  const setup = (hands, banks, sets) => {
    setupSeats("property-deal", ["human", "human", "off", "off"]);
    app.startGame();
    const state = app.getEngineState();
    state.hands = hands;
    state.tables = [PD.emptyTable(), PD.emptyTable()];
    banks.forEach((b, i) => state.tables[i].bank.push(...b));
    Object.keys(sets).forEach((color) => state.tables[0].sets[color].cards.push(...sets[color]));
    state.turn = 0; state.plays = 0; state.phase = "play"; state.pending = null; state.ui = null;
    app.syncTable();
    if (app.isInterstitialShowing()) app.confirmInterstitial();
    return state;
  };
  const buttons = (state) => app.getCurrentGame().actionButtons(state, PD.actingSeat(state)).map((b) => b.label);

  const anyRent = PD.rent(PD.COLORS.slice(), 3);
  const five = PD.money(5);
  const rentState = setup([[anyRent], []], [[], [five, PD.money(1)]], { red: [PD.prop(["red"], 3), PD.prop(["red"], 3)] });
  app.playCard(0, anyRent);
  ok("scripted: drafting offers bank and rent", buttons(rentState).includes("Bank $3M") && buttons(rentState).includes("Rent: Red $3M"));
  app.clickAction("Rent: Red $3M");
  ok("scripted: an any-colour rent then asks who pays", buttons(rentState).includes("Charge Seat 2"));
  app.clickAction("Charge Seat 2");
  ok("scripted: the target is asked first, behind a handoff", rentState.phase === "respond" && app.isInterstitialShowing());
  app.confirmInterstitial();
  const respondButtons = app.getCurrentGame().actionButtons(rentState, 1);
  ok("scripted: without a Block the button is there but disabled", respondButtons[0].label === "Block" && respondButtons[0].disabled);
  app.clickAction("Let it happen");
  ok("scripted: then it pays, no second handoff", rentState.phase === "pay" && !app.isInterstitialShowing());
  const chips = findAll(wrap, (n) => n.dataset && n.dataset.id === five.id);
  ok("scripted: the payer's table shows a chip per card", chips.length === 1);
  ok("scripted: Pay waits for enough", app.getCurrentGame().actionButtons(rentState, 1)[0].disabled);
  chips[0].click();
  app.clickAction("Pay $5M of $3M");
  ok("scripted: paid, no change", PD.bankTotal(rentState.tables[0]) === 5 && PD.bankTotal(rentState.tables[1]) === 1);

  const debt = PD.action("debt");
  const blockState = setup([[debt], [PD.action("block")]], [[], [PD.money(10)]], {});
  app.playCard(0, debt);
  app.clickAction("Collect $5M from Seat 2");
  if (app.isInterstitialShowing()) app.confirmInterstitial();
  ok("scripted: the target may Block", buttons(blockState).join() === "Block,Let it happen");
  app.clickAction("Block");
  ok("scripted: the player gets to answer the Block", blockState.phase === "respond" && PD.actingSeat(blockState) === 0);
  if (app.isInterstitialShowing()) app.confirmInterstitial();
  app.clickAction("Let it happen");
  ok("scripted: Blocked, nothing paid", PD.bankTotal(blockState.tables[1]) === 10 && blockState.phase === "play");

  // Review: a two-colour wild and an any-colour wild in one set read the same.
  const steal = PD.action("steal");
  const labelState = setup([[steal], []], [[], []], {});
  labelState.tables[1].sets.red.cards.push(PD.prop(["red", "yellow"], 3), PD.prop(PD.COLORS.slice(), 0));
  app.syncTable();
  app.playCard(0, steal);
  const steals = buttons(labelState).filter((l) => l.startsWith("Steal"));
  ok("scripted: each wild is named for what it is", steals.join() === "Steal Seat 2's Red (Red/Yellow wild),Steal Seat 2's Red (any-colour wild)", steals);
  app.clickAction("Cancel");

  const anyWild = PD.prop(PD.COLORS.slice(), 0);
  const wildState = setup([[], []], [[], []], { red: [PD.prop(["red"], 3), anyWild] });
  ok("scripted: wild moves wait behind one button", buttons(wildState).join() === "End Turn,Move a wild…");
  app.clickAction("Move a wild…");
  ok("scripted: then list every colour, naming the wild", buttons(wildState).length === 10 && buttons(wildState).includes("Red (any-colour wild) → Dark Blue"));
  app.clickAction("Red (any-colour wild) → Green");
  ok("scripted: and the wild moves", wildState.tables[0].sets.green.cards[0] === anyWild && buttons(wildState)[0] === "End Turn");
}

async function run() {
  cardRendererChecks();

  // ---- vs-AI configs: one human at seat 0, AI filling the rest ----------
  const vsAiConfigs = [
    ["hearts", ["human", "ai", "ai", "ai"]],
    ["crazy-eights", ["human", "ai", "off", "off"]],
    ["crazy-eights", ["human", "ai", "ai", "ai"]],
    ["president", ["human", "ai", "ai", "off"]],
    ["president", ["human", "ai", "ai", "ai"]],
    ["big-two", ["human", "ai", "ai", "ai"]],
    ["chinese-poker", ["human", "ai", "ai", "ai"]],
    ["blackjack", ["human", "ai", "off", "off"]],
    ["blackjack", ["human", "ai", "ai", "ai"]],
    ["spades", ["human", "ai", "ai", "ai"]],
    ["gin-rummy", ["human", "ai", "off", "off"]],
    ["oh-hell", ["human", "ai", "ai", "off"]],
    ["oh-hell", ["human", "ai", "ai", "ai"]],
    ["euchre", ["human", "ai", "ai", "ai"]],
    ["texas-holdem", ["human", "ai", "off", "off"]],
    ["texas-holdem", ["human", "ai", "ai", "ai"]],
    ["cribbage", ["human", "ai", "off", "off"]],
    ["bust-seven", ["human", "ai", "off", "off"]],
    ["bust-seven", ["human", "ai", "ai", "ai"]],
    ["color-clash", ["human", "ai", "off", "off"]],
    ["color-clash", ["human", "ai", "ai", "ai"]],
    ["property-deal", ["human", "ai", "off", "off"]],
    ["property-deal", ["human", "ai", "ai", "ai"]],
  ];
  for (const [key, seats] of vsAiConfigs) {
    setupSeats(key, seats);
    app.startGame();
    ok(key + " " + seats.join(",") + ": engine created", app.getEngineState() !== null);
    const finalState = await driveGame();
    ok(key + " " + seats.join(",") + ": reached game over", finalState.gameOver === true);
    const standings = app.getCurrentGame().standings(finalState);
    ok(key + " " + seats.join(",") + ": standings cover every seat", standings.length === finalState.seats.length);
  }

  // ---- hot-seat configs: every seat human, interstitial handoff exercised ----
  // Every seat is human in hot-seat mode, so every single card play (not just
  // the AI-chain's pauses) costs a driver step - Hearts in particular can run
  // many rounds before someone crosses 100, so it gets a much larger budget.
  // The budgets only catch a game that never ends: Spades to 500 usually
  // takes under 2,500 steps but ran past 4,000 in 1 of 200 runs, so it gets
  // plenty of room.
  const hotseatConfigs = [
    ["hearts", ["human", "human", "human", "human"], 6000],
    ["crazy-eights", ["human", "human", "off", "off"], 1500],
    ["president", ["human", "human", "human", "off"], 1500],
    ["big-two", ["human", "human", "human", "human"], 1500],
    ["chinese-poker", ["human", "human", "human", "human"], 1500],
    ["blackjack", ["human", "human", "human", "human"], 1500],
    ["spades", ["human", "human", "human", "human"], 20000],
    ["gin-rummy", ["human", "human", "off", "off"], 3000],
    ["oh-hell", ["human", "human", "human", "human"], 1500],
    ["euchre", ["human", "human", "human", "human"], 3000],
    ["texas-holdem", ["human", "human", "human", "off"], 1500],
    ["cribbage", ["human", "human", "off", "off"], 1500],
    ["bust-seven", ["human", "human", "human", "off"], 1500],
    ["color-clash", ["human", "human", "human", "off"], 3000],
    ["property-deal", ["human", "human", "human", "off"], 3000],
  ];
  for (const [key, seats, maxHumanSteps] of hotseatConfigs) {
    setupSeats(key, seats);
    app.startGame();
    ok(key + " hotseat: more than one human seat", app.getHumanSeats().length > 1);
    const finalState = await driveGame({ maxHumanSteps });
    ok(key + " hotseat: reached game over", finalState.gameOver === true);
  }

  // ---- all-AI spectator run: nobody at the table but a human must still be
  // able to advance Hearts past its "Deal Next Round" gate. ------------------
  setupSeats("hearts", ["ai", "ai", "ai", "ai"]);
  app.startGame();
  const spectated = await driveGame();
  ok("all-AI hearts spectate: reached game over via manual round advances", spectated.gameOver === true);

  setupSeats("gin-rummy", ["ai", "ai", "off", "off"]);
  app.startGame();
  ok("all-AI gin spectate: reached game over via manual hand advances", (await driveGame()).gameOver === true);

  // ---- lobby: picking a 2-seat game trims AI seats before human ones ----------
  setupSeats("hearts", ["ai", "human", "ai", "human"]);
  app.selectGame("gin-rummy");
  app.startGame();
  ok("gin lobby keeps both humans when trimming 4 seats to 2", app.getEngineState().seats.map((s) => s.type).join() === "human,human");

  propertyDealScripted();

  console.log("ui-smoke.test.js: " + passed + " assertions passed");
}

run().catch((err) => { console.error(err); process.exit(1); });
