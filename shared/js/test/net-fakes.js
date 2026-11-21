// Test doubles for shared/net, used by the turn-sync tests here and by games' online tests.
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

module.exports = { Hub, fakeTimers };
