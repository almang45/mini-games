// Backgammon over shared/net/turn-sync.js on two devices.
const assert = require("assert");
const BG = require("../backgammon.js");
const { checkTwoSeatGame } = require("../../../shared/js/test/net-two-seat.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const config = (hostColor, opening, score = [0, 0]) => ({ hostColor, opening, score });

{
  let state = null;
  let resets = 0;
  const adapter = BG.createOnlineAdapter({ getState: () => state, setState: (next) => { state = next; }, onReset: () => resets++ });
  ok("a full config is valid", adapter.isValidConfig(config(BG.BLACK, [6, 1], [3, 2])));
  for (const bad of [null, {}, { hostColor: BG.WHITE }, config(2, [6, 1]), config(BG.WHITE, [3, 3]), config(BG.WHITE, [7, 1]),
    config(BG.WHITE, [6]), config(BG.WHITE, [6, 1], [-1, 0]), config(BG.WHITE, [6, 1], [0.5, 0]), config(BG.WHITE, [6, 1], [0]),
    { ...config(BG.WHITE, [6, 1]), pad: "x" }]) {
    ok("refuses the config " + JSON.stringify(bad), !adapter.isValidConfig(bad));
  }

  adapter.reset(config(BG.BLACK, [6, 1], [3, 2]));
  ok("reset starts a fresh game and clears the page", resets === 1 && state.phase === "move" && !state.done.length);
  ok("the opening dice are the ones sent", state.dice[0] === 6 && state.dice[1] === 1);
  ok("the higher opening die moves first: White, the guest here", state.turn === BG.WHITE && adapter.turnSeat() === 1);
  ok("the host plays the configured colour", adapter.seatColor(0) === BG.BLACK && adapter.seatColor(1) === BG.WHITE);
  ok("the match score comes with the round", adapter.score.join() === "3,2");

  ok("refuses a roll while moving", throws(() => adapter.apply({ roll: [3, 4] })));
  ok("refuses ending an unfinished turn", throws(() => adapter.apply({ end: true })));
  ok("refuses undo with nothing done", throws(() => adapter.apply({ undo: true })));
  const before = adapter.hash();
  const [first] = BG.nextSteps(state);
  adapter.apply({ step: [first.from, first.to] });
  ok("a step changes the hash", adapter.hash() !== before && state.done.length === 1);
  adapter.apply({ undo: true });
  ok("undo puts it back", adapter.hash() === before);
  while (!BG.turnComplete(state)) {
    const [st] = BG.nextSteps(state);
    adapter.apply({ step: [st.from, st.to] });
  }
  adapter.apply({ end: true });
  ok("ending the turn passes it to the host", adapter.turnSeat() === 0 && state.phase === "roll");
  adapter.apply({ roll: [4, 4] });
  ok("a roll plays the dice that were sent", state.dice.join() === "4,4" && BG.diceLeft(state).length === 4);
  const settled = adapter.hash();
  for (const bad of [null, "roll", { roll: [4, 4] }, { roll: [0, 3] }, { roll: [3, 9] }, { roll: [2] }, { step: [24] },
    { step: [26, 20] }, { step: ["24", "20"] }, { step: [1.5, 0] }, { step: [3, 1] }, { undo: 1 }, { end: "yes" },
    { roll: [1, 2], step: [24, 20] }, {}]) {
    ok("refuses " + JSON.stringify(bad), throws(() => adapter.apply(bad)) && adapter.hash() === settled);
  }
}

{
  const finished = { gameOver: true, winner: BG.WHITE, result: { points: 2 } };
  ok("a win adds its points to the winner's seat", BG.scoreAfter(finished, [1, 1], BG.BLACK).join() === "1,3"
    && BG.scoreAfter(finished, [1, 1], BG.WHITE).join() === "3,1");
  ok("a game in progress adds nothing", BG.scoreAfter({ gameOver: false }, [1, 1], BG.WHITE).join() === "1,1");
}

// Random play to the end: roll, a random legal step at a time, then end the turn.
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const die = () => 1 + Math.floor(rand() * 6);
checkTwoSeatGame(ok, {
  createAdapter: BG.createOnlineAdapter,
  // The first config has the host (White, on the higher die) moving first, which the out-of-turn check needs.
  configs: [config(BG.WHITE, [5, 2]), config(BG.BLACK, [1, 4], [2, 0])],
  pick: (state) => {
    if (state.phase === "roll") return { roll: [die(), die()] };
    if (BG.turnComplete(state)) return { end: true };
    const steps = BG.nextSteps(state);
    const st = steps[Math.floor(rand() * steps.length)];
    return { step: [st.from, st.to] };
  },
  badMoves: () => [{ roll: [3, 3] }, { end: true }, { undo: true }, { step: [1, 0] }, "end", { step: [24, 13], end: true }],
  maxSteps: 20000,
});

console.log("backgammon-online.test.js: " + passed + " assertions passed");
