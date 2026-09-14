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

const HUMAN_MOVE = {
  hearts: heartsHumanMove, "crazy-eights": ceHumanMove, president: presHumanMove,
  "big-two": bigTwoHumanMove, "chinese-poker": cpHumanMove, blackjack: bjHumanMove,
  spades: spadesHumanMove, "gin-rummy": ginHumanMove, "oh-hell": ohHellHumanMove,
  euchre: euchreHumanMove,
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

async function run() {
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
  const hotseatConfigs = [
    ["hearts", ["human", "human", "human", "human"], 6000],
    ["crazy-eights", ["human", "human", "off", "off"], 1500],
    ["president", ["human", "human", "human", "off"], 1500],
    ["big-two", ["human", "human", "human", "human"], 1500],
    ["chinese-poker", ["human", "human", "human", "human"], 1500],
    ["blackjack", ["human", "human", "human", "human"], 1500],
    ["spades", ["human", "human", "human", "human"], 4000],
    ["gin-rummy", ["human", "human", "off", "off"], 3000],
    ["oh-hell", ["human", "human", "human", "human"], 1500],
    ["euchre", ["human", "human", "human", "human"], 3000],
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

  console.log("ui-smoke.test.js: " + passed + " assertions passed");
}

run().catch((err) => { console.error(err); process.exit(1); });
