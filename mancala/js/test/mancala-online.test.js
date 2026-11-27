// Mancala over shared/net/turn-sync.js on two devices.
const assert = require("assert");
const M = require("../mancala.js");
const { checkTwoSeatGame } = require("../../../shared/js/test/net-two-seat.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

{
  let state = null;
  let resets = 0;
  const adapter = M.createOnlineAdapter({ getState: () => state, setState: (next) => { state = next; }, onReset: () => resets++ });
  ok("only a real side is a valid config", adapter.isValidConfig({ hostSide: M.NORTH })
    && !adapter.isValidConfig(null) && !adapter.isValidConfig({}) && !adapter.isValidConfig({ hostSide: 2 })
    && !adapter.isValidConfig({ hostSide: M.NORTH, pad: "x" }));
  adapter.reset({ hostSide: M.NORTH });
  ok("reset starts a fresh game and clears the page", state.turn === M.SOUTH && resets === 1);
  ok("the host plays the configured side", adapter.seatSide(0) === M.NORTH && adapter.seatSide(1) === M.SOUTH);
  ok("South moves first, so the guest starts", adapter.turnSeat() === 1);
  const before = adapter.hash();
  adapter.apply(0); // 4 seeds from pit 0 end in pit 4: no extra turn
  ok("a move changes the hash and the turn", adapter.hash() !== before && adapter.turnSeat() === 0);
  for (const bad of [0, 6, 13, 14, -1, "8", 8.5, null]) {
    ok("refuses " + JSON.stringify(bad), (() => { try { adapter.apply(bad); return false; } catch { return true; } })());
  }
}

checkTwoSeatGame(ok, {
  createAdapter: M.createOnlineAdapter,
  configs: [{ hostSide: M.SOUTH }, { hostSide: M.NORTH }],
  pick: (state) => M.chooseMove(state.board, state.turn, "easy", () => 0.3),
  badMoves: (state) => [M.STORE[state.turn], M.PIT_INDICES[M.opponent(state.turn)][0], "2", { pit: 2 }],
});

console.log("mancala-online.test.js: " + passed + " assertions passed");
