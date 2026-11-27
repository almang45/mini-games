// Reversi over shared/net/turn-sync.js on two devices.
const assert = require("assert");
const R = require("../reversi.js");
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
  const adapter = R.createOnlineAdapter({ getState: () => state, setState: (next) => { state = next; }, onReset: () => resets++ });
  ok("only a real colour is a valid config", adapter.isValidConfig({ hostColor: R.WHITE })
    && !adapter.isValidConfig(null) && !adapter.isValidConfig({}) && !adapter.isValidConfig({ hostColor: 3 })
    && !adapter.isValidConfig({ hostColor: R.WHITE, pad: "x" }));
  adapter.reset({ hostColor: R.WHITE });
  ok("reset starts a fresh game and clears the page", state.turn === R.BLACK && resets === 1);
  ok("the host plays the configured colour", adapter.seatColor(0) === R.WHITE && adapter.seatColor(1) === R.BLACK);
  ok("Black moves first, so the guest starts", adapter.turnSeat() === 1);
  const before = adapter.hash();
  adapter.apply(R.legalMoves(state.board, state.turn)[0]);
  ok("a move changes the hash and the turn", adapter.hash() !== before && adapter.turnSeat() === 0);
  for (const bad of [0, 64, -1, "19", 2.5, null]) {
    ok("refuses " + JSON.stringify(bad), (() => { try { adapter.apply(bad); return false; } catch { return true; } })());
  }
}

checkTwoSeatGame(ok, {
  createAdapter: R.createOnlineAdapter,
  configs: [{ hostColor: R.BLACK }, { hostColor: R.WHITE }],
  pick: (state) => R.chooseMove(state.board, state.turn, "easy", () => 0.3),
  badMoves: (state) => [0, 99, "19", { idx: 19 }, state.board.findIndex((v) => v !== R.EMPTY)],
});

console.log("reversi-online.test.js: " + passed + " assertions passed");
