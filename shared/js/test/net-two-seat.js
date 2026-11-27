// Shared checks for two-seat games over shared/net/turn-sync.js, used by each game's online test.
// The game supplies its adapter factory, round configs and a move picker; this plays whole games
// across two fake devices and checks they stay in step, swap sides and refuse foul play.
const { TurnSync } = require("../../net/turn-sync.js");
const { Hub, fakeTimers } = require("./net-fakes.js");

function twoSeatRoom({ createAdapter, firstConfig }) {
  const hub = new Hub(2);
  const timers = fakeTimers();
  const warnings = [];
  const players = [0, 1].map((seat) => {
    const p = { state: null };
    p.adapter = createAdapter({ getState: () => p.state, setState: (next) => { p.state = next; } });
    p.session = hub.join(seat);
    p.sync = new TurnSync({ session: p.session, adapter: p.adapter, timers, onChange: (e) => {
      if (e.type === "need-round") p.sync.newRound(firstConfig);
    } });
    return p;
  });
  return { hub, timers, players, warnings };
}

// ok(label, cond, extra) is the calling test's assertion. `pick(state)` returns a legal move for
// whoever is to move; `moveOf(state)` may differ per device, so it is always asked of the mover.
function checkTwoSeatGame(ok, { createAdapter, configs, pick, badMoves, maxSteps = 2000 }) {
  const captured = [];
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = (...args) => captured.push(args.join(" "));
  console.error = (...args) => captured.push(args.join(" "));
  try {
    const { hub, players } = twoSeatRoom({ createAdapter, firstConfig: configs[0] });
    const [host, guest] = players;
    hub.connect(0);
    ok("an alone host waits for the round to make sense", host.sync.started);
    hub.connect(1);
    ok("the guest gets the host's round", guest.sync.started && guest.adapter.hash() === host.adapter.hash());

    for (const [round, config] of configs.entries()) {
      if (round > 0) host.sync.newRound(config);
      let steps = 0;
      while (host.adapter.turnSeat() !== -1 && steps < maxSteps) {
        const mover = players[host.adapter.turnSeat()];
        const other = players[1 - host.adapter.turnSeat()];
        if (steps === 0) ok("round " + (round + 1) + ": the other device can't move", other.sync.play(pick(other.state)) === false);
        if (!mover.sync.play(pick(mover.state))) break;
        steps++;
        if (host.adapter.hash() !== guest.adapter.hash()) break;
      }
      ok("round " + (round + 1) + ": the game runs to the end", host.adapter.turnSeat() === -1, { steps });
      ok("round " + (round + 1) + ": both devices end on the same position", host.adapter.hash() === guest.adapter.hash());
    }
    ok("nobody resynced on the way", !captured.some((w) => w.includes("resync")), captured.slice(0, 3));

    // A modified page sends moves that aren't legal for it.
    // Delivered straight to the device that isn't moving, as if from the mover's device.
    host.sync.newRound(configs[0]);
    const mover = host.adapter.turnSeat();
    const receiver = players[1 - mover];
    const send = (from, move) => receiver.session.emit("message", {
      from, data: { k: "move", round: receiver.sync.round, i: receiver.sync.moves.length, move, hash: "x" },
    });
    for (const move of badMoves(players[mover].state)) {
      captured.length = 0;
      const before = receiver.adapter.hash();
      const count = receiver.sync.moves.length;
      send(mover, move);
      ok("refuses " + JSON.stringify(move).slice(0, 40), receiver.adapter.hash() === before
        && receiver.sync.moves.length === count && captured.length > 0);
    }
    // A move from the seat that isn't to move is refused even if it's legal for the mover.
    captured.length = 0;
    const before = host.adapter.hash();
    host.session.emit("message", { from: 1, data: { k: "move", round: host.sync.round, i: host.sync.moves.length, move: pick(host.state), hash: "x" } });
    if (mover === 0) ok("refuses a move out of turn", host.adapter.hash() === before && captured.some((w) => w.includes("out_of_order")));

    // A hostile host's bad config never reaches the guest's board.
    const guestBefore = guest.adapter.hash();
    guest.session.emit("message", { from: 0, data: { k: "state", round: 99, config: { bogus: true }, moves: [] } });
    ok("a guest keeps its game on a bad config", guest.adapter.hash() === guestBefore);
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

module.exports = { twoSeatRoom, checkTwoSeatGame };
