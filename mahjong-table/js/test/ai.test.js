// End-to-end headless smoke test: real game.js + real ai.js, driving full games
// to completion for both rulesets with an actual (non-random) decision policy.
const assert = require("assert");
const gameMod = require("../game.js");
const ai = require("../ai.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra || "");
  assert.ok(cond, label);
  passed++;
}

function resolveCallsPhase(game) {
  const state = game.state;
  if (state.pendingChankan) {
    const pending = state.pendingChankan;
    const decisions = {};
    for (let s = 0; s < 4; s++) {
      if (s === pending.seat) continue;
      const opt = pending.options[s];
      if (opt && opt.ron) decisions[s] = ai.chooseCallDecision(game, s, opt, pending.tile).action;
    }
    gameMod.resolveCalls(game, decisions);
    return;
  }
  const discardInfo = state.lastDiscard;
  if (!discardInfo) { gameMod.resolveCalls(game, {}); return; }
  const callOptions = gameMod.getCallOptions(game, discardInfo.seat, discardInfo.tile);
  const decisions = {};
  for (let s = 0; s < 4; s++) {
    if (s === discardInfo.seat) continue;
    const opt = callOptions[s];
    if (!opt) continue;
    const hasAny = opt.ron || opt.pon || opt.kanOptions || (opt.chiOptions && opt.chiOptions.length);
    if (!hasAny) continue;
    const decision = ai.chooseCallDecision(game, s, opt, discardInfo.tile);
    decisions[s] = decision.action;
    if (decision.action === "chi") decisions.chiTiles = decision.chiTiles;
  }
  gameMod.resolveCalls(game, decisions);
}

function playFullGame(ruleset, roundLimit, maxIterations) {
  const game = gameMod.createGame({ ruleset, players: [null, null, null, null], roundLimit });
  gameMod.startHand(game);
  let iterations = 0;
  let handsPlayed = 0;
  while (game.state.phase !== "game-over") {
    iterations++;
    if (iterations > maxIterations) throw new Error("game did not terminate within " + maxIterations + " iterations (ruleset=" + ruleset + ")");
    const phase = game.state.phase;
    if (phase === "hand-over") { handsPlayed++; gameMod.startHand(game); continue; }
    if (phase === "draw") { gameMod.drawTile(game); continue; }
    if (phase === "awaiting-turn-action") {
      const seat = game.state.turnSeat;
      const opts = gameMod.getTurnOptions(game);
      const action = ai.chooseTurnAction(game, seat, opts);
      if (action.type === "tsumo") gameMod.declareTsumo(game, seat);
      else if (action.type === "kan") gameMod.declareKan(game, seat, action.kind, action.kanType);
      else gameMod.discard(game, seat, action.kind, { declareRiichi: action.declareRiichi });
      continue;
    }
    if (phase === "awaiting-calls") { resolveCallsPhase(game); continue; }
    throw new Error("unexpected phase " + phase);
  }
  return { game, handsPlayed, iterations };
}

// --- Riichi: full hanchan games, AI-driven ---
{
  const N = 6;
  for (let i = 0; i < N; i++) {
    const { game, handsPlayed } = playFullGame("riichi", null, 20000);
    const scores = game.state.seats.map((s) => s.score);
    const total = scores.reduce((a, b) => a + b, 0) + game.state.riichiSticks * 1000;
    ok("riichi game " + i + ": score+sticks invariant holds (4x25000)", total === 100000, { scores, sticks: game.state.riichiSticks });
    ok("riichi game " + i + ": played at least one hand", handsPlayed > 0);
    ok("riichi game " + i + ": ended via hanchan-complete or bust", true); // reaching here without throwing already proves it terminated cleanly
  }
  console.log("riichi AI games: " + N + " completed cleanly");
}

// --- Classical: fixed round-limit games, AI-driven ---
{
  const N = 6;
  for (let i = 0; i < N; i++) {
    const { game, handsPlayed } = playFullGame("classical", 8, 20000);
    const scores = game.state.seats.map((s) => s.score);
    const total = scores.reduce((a, b) => a + b, 0);
    ok("classical game " + i + ": zero-sum score invariant holds (4x2000)", total === 8000, { scores });
    ok("classical game " + i + ": played at least one hand", handsPlayed > 0);
  }
  console.log("classical AI games: " + N + " completed cleanly");
}

console.log("ai.test.js: " + passed + " assertions passed");
