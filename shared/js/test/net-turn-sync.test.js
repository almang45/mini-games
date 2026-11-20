const assert = require("assert");
const { TurnSync, RECOVER_MS } = require("../../net/turn-sync.js");
const C4 = require("../../../connect-four/js/connect-four.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

const warnings = [];
console.warn = (...args) => warnings.push(args.join(" "));
console.error = (...args) => warnings.push(args.join(" "));

// Stands in for the relay plus RelaySession: delivers synchronously, or holds frames while a seat is offline.
class Hub {
  constructor(seats) {
    this.seats = seats;
    this.sessions = [];
    this.log = [];
  }
  join(seat) {
    const hub = this;
    const session = {
      seat, seats: this.seats, status: "connecting", present: [], listeners: {}, online: false,
      on(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
      emit(type, payload) { for (const fn of this.listeners[type] || []) fn(payload); },
      get everyonePresent() { return this.status === "open" && this.present.length === this.seats; },
      send(data, to) {
        if (!this.online) return false;
        hub.log.push({ from: seat, to, data: JSON.parse(JSON.stringify(data)) });
        for (const other of hub.sessions) {
          if (other !== this && other.online && (to === undefined || other.seat === to)) {
            other.emit("message", { from: seat, data: JSON.parse(JSON.stringify(data)) });
          }
        }
        return true;
      },
    };
    this.sessions[seat] = session;
    return session;
  }
  connect(seat) {
    const session = this.sessions[seat];
    session.online = true;
    session.status = "open";
    const present = this.sessions.filter((s) => s && s.online).map((s) => s.seat).sort();
    for (const s of this.sessions) if (s && s.online) s.present = present.slice();
    session.emit("welcome", {});
    for (const s of this.sessions) if (s && s.online && s !== session) s.emit("peer", { seat, state: "joined" });
  }
  disconnect(seat) {
    const session = this.sessions[seat];
    session.online = false;
    session.status = "reconnecting";
    session.present = [seat];
    for (const s of this.sessions) {
      if (s && s.online) {
        s.present = s.present.filter((p) => p !== seat);
        s.emit("peer", { seat, state: "left" });
      }
    }
  }
}

function fakeTimers() {
  const pending = new Map();
  let id = 0;
  return {
    setTimeout: (fn) => { pending.set(++id, fn); return id; },
    clearTimeout: (t) => pending.delete(t),
    fireAll() { const fns = [...pending.values()]; pending.clear(); fns.forEach((fn) => fn()); },
    count: () => pending.size,
  };
}

// The Connect Four page's adapter, minus the DOM.
function player(hub, seat, timers) {
  const p = { state: C4.createGame(), hostColor: C4.RED, events: [] };
  const adapter = {
    reset(config) { p.hostColor = config.hostColor; p.state = C4.createGame(); },
    apply(col) { C4.play(p.state, col); },
    hash() { return p.state.board.join("") + "/" + p.state.turn + "/" + p.state.winner; },
    turnSeat() { return p.state.gameOver ? -1 : p.state.turn === p.hostColor ? 0 : 1; },
  };
  p.session = hub.join(seat);
  p.sync = new TurnSync({ session: p.session, adapter, timers, onChange: (e) => {
    p.events.push(e);
    if (e.type === "need-round") p.sync.newRound({ hostColor: C4.RED });
  } });
  p.board = () => p.state.board.join("");
  return p;
}

function pair() {
  const hub = new Hub(2);
  const timers = fakeTimers();
  const host = player(hub, 0, timers);
  const guest = player(hub, 1, timers);
  hub.connect(0);
  hub.connect(1);
  return { hub, host, guest, timers };
}

// ---- a game played across two devices ------------------------------------------------

{
  const { host, guest } = pair();
  ok("an alone host starts the first round itself", host.sync.started && host.sync.round === 1);
  ok("the guest gets the round when it joins", guest.sync.started && guest.sync.round === 1);
  ok("the host plays Red first", host.sync.canMove() && !guest.sync.canMove());
  ok("the guest can't move out of turn", guest.sync.play(3) === false);
  host.sync.play(3);
  ok("the host's move reaches the guest", guest.board() === host.board() && guest.state.board[38] === C4.RED);
  ok("then it is the guest's turn", guest.sync.canMove() && !host.sync.canMove());
  guest.sync.play(3);
  ok("the guest's move reaches the host", host.board() === guest.board());
  for (const [who, col] of [[host, 4], [guest, 4], [host, 5], [guest, 5], [host, 6]]) who.sync.play(col);
  ok("a win ends the game on both devices", host.state.gameOver && guest.state.gameOver && host.state.winner === C4.RED);
  ok("nobody can move after the game ends", !host.sync.canMove() && !guest.sync.canMove());
  ok("remote moves are reported as remote", guest.events.some((e) => e.type === "move" && !e.local && e.seat === 0));
  ok("only the host may start a round", (() => { try { guest.sync.newRound({ hostColor: C4.RED }); return false; } catch { return true; } })());
  host.sync.newRound({ hostColor: C4.YELLOW });
  ok("a new round swaps colours on both devices", guest.sync.round === 2 && guest.hostColor === C4.YELLOW && guest.sync.canMove());
}

// ---- the relay drops a player ------------------------------------------------------------

{
  const { hub, host, guest } = pair();
  host.sync.play(0);
  hub.disconnect(1);
  ok("nobody moves while a player is away", !guest.sync.canMove() && !host.sync.canMove());
  hub.connect(1);
  ok("a returning guest catches up", guest.board() === host.board() && guest.sync.canMove());
}

{
  // The host moved while the guest's socket was half-dead and the frame was lost.
  const { hub, host, guest } = pair();
  guest.session.online = false;
  host.sync.play(2);
  guest.session.online = true;
  ok("a lost frame leaves the guest behind", guest.board() !== host.board());
  hub.disconnect(1);
  hub.connect(1);
  ok("reconnecting resyncs it", guest.board() === host.board());
}

// ---- disagreement always resolves to the host's record ----------------------------------------

{
  const { host, guest } = pair();
  host.sync.play(3);
  guest.state.board[0] = C4.YELLOW; // a corrupted guest position
  guest.sync.play(3);
  ok("a hash mismatch is noticed", warnings.some((w) => w.includes("hash_mismatch")));
  ok("and the host's record is sent back", guest.board() === host.board() && guest.state.board[0] === C4.EMPTY);
}

{
  const { host, guest } = pair();
  host.sync.play(3);
  guest.session.emit("message", { from: 0, data: { k: "move", round: 1, i: 5, move: 1, hash: "x" } });
  ok("a move out of order asks the host for its record", warnings.some((w) => w.includes("out_of_order")));
  ok("which puts the guest back in step", guest.board() === host.board());
  host.session.emit("message", { from: 1, data: { k: "move", round: 1, i: 1, move: 99, hash: "x" } });
  ok("an illegal guest move is refused by the host", warnings.some((w) => w.includes("illegal_move")) && host.sync.moves.length === 1);
  host.session.emit("message", { from: 1, data: { k: "state", round: 9, config: { hostColor: C4.RED }, moves: [0, 0, 0] } });
  ok("a guest can't overwrite the host's game", host.sync.round === 1 && host.sync.moves.length === 1);
  guest.session.emit("message", { from: 0, data: null });
  ok("an empty message is ignored with a warning", warnings.some((w) => w.includes("no body")));
}

// ---- a host that reloads ---------------------------------------------------------------------

{
  const { hub, host, guest, timers } = pair();
  host.sync.play(3);
  guest.sync.play(4);
  // The host's tab reloads: a fresh page, same seat, no game in memory.
  hub.disconnect(0);
  const reloaded = player(hub, 0, timers);
  hub.connect(0);
  ok("the reloaded host asks the guest for the game", hub.log.some((m) => m.from === 0 && m.data.k === "recover"));
  ok("and gets it back", reloaded.sync.started && reloaded.board() === guest.board() && reloaded.sync.moves.length === 2);
  ok("without waiting for the timeout", timers.count() === 0);
  ok("play carries on", reloaded.sync.canMove());
}

{
  const { hub, guest, timers } = pair();
  // Both reload: the guest has nothing to hand back either.
  hub.disconnect(0);
  hub.disconnect(1);
  const guest2 = player(hub, 1, timers);
  hub.connect(1);
  const host2 = player(hub, 0, timers);
  hub.connect(0);
  ok("with nothing to recover the host waits", !host2.sync.started && timers.count() === 1);
  timers.fireAll();
  ok("then starts a fresh round", host2.sync.started && guest2.sync.started && guest2.board() === host2.board());
  ok("the old guest object is untouched", guest.sync.started);
}

ok("the recovery wait is short", RECOVER_MS <= 3000);

console.log("net turn-sync: " + passed + " checks passed");
