const assert = require("assert");
const { TurnSync, RECOVER_MS, SYNC_RETRY_MS, MAX_SYNC_FAILURES, REPLY_BURST } = require("../../net/turn-sync.js");
const C4 = require("../../../connect-four/js/connect-four.js");

let passed = 0;
// Kept before console.error is captured below, so a failure still reaches the CI log.
const realError = console.error.bind(console);
function ok(label, cond, extra) {
  if (!cond) realError("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// Emptied at the start of every block (see fresh()), so one block's warning can't pass another's check.
let warnings = [];
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
  let id = 0, last = null;
  return {
    setTimeout: (fn, ms) => { pending.set(++id, fn); last = ms; return id; },
    clearTimeout: (t) => pending.delete(t),
    lastDelay: () => last,
    fireAll() { const fns = [...pending.values()]; pending.clear(); fns.forEach((fn) => fn()); },
    count: () => pending.size,
  };
}

// The same adapter the Connect Four page uses.
function player(hub, seat, timers, persist) {
  const p = { state: C4.createGame(), events: [] };
  p.adapter = C4.createOnlineAdapter({ getState: () => p.state, setState: (next) => { p.state = next; } });
  Object.defineProperty(p, "hostColor", { get: () => p.adapter.hostColor });
  p.session = hub.join(seat);
  p.sync = new TurnSync({ session: p.session, adapter: p.adapter, timers, persist, onChange: (e) => {
    p.events.push(e);
    if (e.type === "need-round") p.sync.newRound({ hostColor: C4.RED });
  } });
  p.board = () => p.state.board.join("");
  return p;
}

function memoryStore() {
  let saved = null;
  return { load: () => saved && JSON.parse(saved), save: (snap) => { saved = JSON.stringify(snap); } };
}

function pair() {
  warnings = [];
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

// ---- review fixes -------------------------------------------------------------------------

{
  // Both sides apply the move, then disagree: the host must still redraw the board it now has.
  const { host, guest } = pair();
  host.sync.play(3);
  host.state.board[0] = C4.RED; // a corrupted host position
  const before = host.events.length;
  guest.sync.play(3);
  ok("a hash mismatch on the host is reported", warnings.some((w) => w.includes("hash_mismatch")));
  ok("and the host page is told to redraw", host.events.slice(before).some((e) => e.type === "state"));
}

{
  // A recovering host is the only one that takes a guest's record, so each bad config goes to one.
  for (const config of [null, 7, {}, { hostColor: 9 }]) {
    const { hub, guest, timers } = pair();
    hub.disconnect(0);
    const reloaded = player(hub, 0, timers);
    guest.sync.config = null; // so the guest's own answer doesn't settle the recovery first
    hub.connect(0);
    warnings = [];
    reloaded.session.emit("message", { from: 1, data: { k: "state", round: 4, config, moves: [] } });
    ok("a recovering host refuses config " + JSON.stringify(config),
      reloaded.sync.round === 1 && reloaded.sync.config.hostColor === C4.RED && warnings.some((w) => w.includes("invalid config")));
  }
  const { guest } = pair();
  guest.session.emit("message", { from: 0, data: { k: "state", round: 5, config: null, moves: [] } });
  ok("nor replaces the guest's", guest.sync.round === 1 && warnings.some((w) => w.includes("invalid config")));
}

{
  // The host's record doesn't replay here (a stale page against a new rule, say): back off, then stop.
  const { hub, host, guest, timers } = pair();
  const bad = { k: "state", round: 1, config: { hostColor: C4.RED }, moves: [99] };
  const asked = () => hub.log.filter((m) => m.from === 1 && m.data.k === "sync").length;
  const start = asked();
  guest.session.emit("message", { from: 0, data: bad });
  ok("a failed replay doesn't ask again at once", asked() === start && timers.lastDelay() === SYNC_RETRY_MS);
  host.sync.moves = [99]; // make the host keep answering with the bad record
  host.sync.round = 1;
  for (let i = 1; i < MAX_SYNC_FAILURES; i++) {
    timers.fireAll();
  }
  ok("each retry waits longer", timers.lastDelay() === SYNC_RETRY_MS * 2);
  ok("then the guest gives up and says so", guest.sync.desynced && guest.events.some((e) => e.type === "desync"));
  ok("and stops asking", timers.count() === 0);
}

{
  const { hub, guest, timers } = pair();
  hub.disconnect(0);
  const reloaded = player(hub, 0, timers);
  guest.sync.config = null; // a guest with nothing to hand back
  hub.connect(0);
  ok("a reloaded host waits for recovery", timers.count() === 1);
  reloaded.session.status = "closed";
  reloaded.session.emit("status", "closed");
  ok("closing the session stops the recovery timer", timers.count() === 0);
}

{
  // A host with a saved copy restores it and ignores whatever a guest offers.
  const hub = new Hub(2);
  warnings = [];
  const timers = fakeTimers();
  const store = memoryStore();
  const host = player(hub, 0, timers, store);
  const guest = player(hub, 1, timers);
  hub.connect(0);
  hub.connect(1);
  host.sync.play(3);
  guest.sync.play(3);
  ok("the host saves its record as play goes on", store.load().moves.length === 2);
  hub.disconnect(0);
  guest.state.board[0] = C4.YELLOW;
  guest.sync.moves.push(0); // a guest that would hand back a different game
  const reloaded = player(hub, 0, timers, store);
  hub.connect(0);
  ok("a reloaded host restores its own copy", reloaded.sync.started && reloaded.sync.moves.length === 2);
  ok("without asking the guest", !hub.log.some((m) => m.from === 0 && m.data.k === "recover"));
  ok("and puts the guest back on it", guest.sync.moves.length === 2 && guest.board() === reloaded.board());
}

{
  // A guest floods the host with sync requests: the host answers a few, not all of them.
  const { hub, host } = pair();
  host.sync.play(3);
  const before = hub.log.filter((m) => m.from === 0).length;
  for (let i = 0; i < 40; i++) host.session.emit("message", { from: 1, data: { k: "sync" } });
  const sent = hub.log.filter((m) => m.from === 0).length - before;
  ok("a sync flood gets a bounded answer", sent > 0 && sent <= REPLY_BURST, sent);
  ok("and is logged", warnings.some((w) => w.includes("too many requests from seat 1")));
}

{
  // Two guests hand a reloaded host different games: it trusts neither and starts over.
  warnings = [];
  const hub = new Hub(3);
  const timers = fakeTimers();
  const host = player(hub, 0, timers);
  const a = player(hub, 1, timers);
  const b = player(hub, 2, timers);
  hub.connect(0);
  hub.connect(1);
  hub.connect(2);
  host.sync.play(3);
  b.sync.moves.push(0); // b would hand back a different game
  hub.disconnect(0);
  const reloaded = player(hub, 0, timers);
  hub.connect(0);
  ok("disagreeing guests aren't trusted", reloaded.sync.moves.length === 0 && warnings.some((w) => w.includes("disagree")));
  ok("so the host starts a new round", reloaded.sync.started && a.sync.moves.length === 0);
}

{
  // Two guests with the same game: the host waits for both, then takes it.
  warnings = [];
  const hub = new Hub(3);
  const timers = fakeTimers();
  const host = player(hub, 0, timers);
  player(hub, 1, timers);
  player(hub, 2, timers);
  hub.connect(0);
  hub.connect(1);
  hub.connect(2);
  host.sync.play(3);
  hub.disconnect(0);
  const reloaded = player(hub, 0, timers);
  hub.connect(0);
  ok("agreeing guests hand the game back", reloaded.sync.moves.length === 1 && timers.count() === 0);
}

{
  // The reloaded host drops and returns while still waiting: only the newest wait may end recovery.
  const { hub, guest, timers } = pair();
  hub.disconnect(0);
  const reloaded = player(hub, 0, timers);
  guest.sync.config = null;
  hub.connect(0);
  reloaded.session.emit("welcome", {});
  ok("a second welcome replaces the recovery wait", timers.count() === 1);
}

{
  // A good record after a failed one cancels the pending retry.
  const { host, guest, timers } = pair();
  guest.session.emit("message", { from: 0, data: { k: "state", round: 1, config: { hostColor: C4.RED }, moves: [99] } });
  ok("a failed replay arms a retry", timers.count() === 1);
  guest.session.emit("message", { from: 0, data: host.sync.snapshot() });
  ok("a good record cancels it", timers.count() === 0 && guest.sync.syncFailures === 0);
}

ok("the recovery wait is short", RECOVER_MS <= 3000);

console.log("net turn-sync: " + passed + " checks passed");
