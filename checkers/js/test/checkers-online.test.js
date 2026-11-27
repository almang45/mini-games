// Checkers over shared/net/turn-sync.js on two devices.
const assert = require("assert");
const C = require("../checkers.js");
const { checkTwoSeatGame } = require("../../../shared/js/test/net-two-seat.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// What a page sends: the chosen move without its captures, which the receiver works out.
const wire = (move) => ({ from: move.from, path: move.path });

{
  let state = null;
  let resets = 0;
  const adapter = C.createOnlineAdapter({ getState: () => state, setState: (next) => { state = next; }, onReset: () => resets++ });
  ok("only a real colour is a valid config", adapter.isValidConfig({ hostColor: C.WHITE })
    && !adapter.isValidConfig(null) && !adapter.isValidConfig({}) && !adapter.isValidConfig({ hostColor: 2 })
    && !adapter.isValidConfig({ hostColor: C.WHITE, pad: "x" }));
  adapter.reset({ hostColor: C.WHITE });
  ok("reset starts a fresh game and clears the page", state.turn === C.BLACK && resets === 1);
  ok("the host plays the configured colour", adapter.seatColor(0) === C.WHITE && adapter.seatColor(1) === C.BLACK);
  ok("Black moves first, so the guest starts", adapter.turnSeat() === 1);
  const before = adapter.hash();
  const first = C.legalMoves(state.board, state.turn)[0];
  adapter.apply(wire(first));
  ok("a move changes the hash and the turn", adapter.hash() !== before && adapter.turnSeat() === 0);
  ok("the receiver works out the move in full", Array.isArray(state.lastMove.captures));
  const legal = wire(C.legalMoves(state.board, state.turn)[0]);
  const bad = [
    null, 5, "x", {}, { from: legal.from }, { from: legal.from, path: [] },
    { from: legal.from, path: legal.path, captures: [] }, { from: "1", path: legal.path },
    { from: legal.from, path: [64] }, { from: legal.from, path: [legal.path[0] + 0.5] },
    { from: legal.from, path: new Array(13).fill(legal.path[0]) }, { from: first.from, path: first.path },
  ];
  for (const move of bad) {
    ok("refuses " + JSON.stringify(move), (() => { try { adapter.apply(move); return false; } catch { return true; } })());
  }
  ok("a refused move leaves the game alone", state.turn === C.WHITE && state.history.length === 1);
}

checkTwoSeatGame(ok, {
  createAdapter: C.createOnlineAdapter,
  configs: [{ hostColor: C.BLACK }, { hostColor: C.WHITE }],
  // Random play, so the two rounds differ and each ends in a win or the no-progress draw.
  pick: (() => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return (state) => {
      const moves = C.legalMoves(state.board, state.turn);
      return wire(moves[Math.floor(rand() * moves.length)]);
    };
  })(),
  badMoves: (state) => {
    const enemy = state.board.findIndex((v) => C.side(v) === -state.turn);
    return [{ from: enemy, path: [enemy] }, { from: 0, path: [1] }, "11-15", { from: 40, path: [33], captures: [] }];
  },
});

console.log("checkers-online.test.js: " + passed + " assertions passed");
