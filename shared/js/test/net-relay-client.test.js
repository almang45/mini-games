const assert = require("assert");
const NET = require("../../net/relay-client.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

// Manual clock: timers only fire when the test advances time.
function fakeTimers() {
  let now = 0, nextId = 1;
  const pending = new Map();
  const add = (fn, ms, every) => { const id = nextId++; pending.set(id, { fn, at: now + ms, every }); return id; };
  return {
    setTimeout: (fn, ms) => add(fn, ms, 0),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: (id) => pending.delete(id),
    clearInterval: (id) => pending.delete(id),
    now: () => now,
    pendingCount: () => pending.size,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of pending) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at += t.every;
        else pending.delete(id);
        t.fn();
      }
      now = end;
    },
  };
}

const sockets = [];
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closedWith = null;
    sockets.push(this);
  }
  send(frame) { this.sent.push(frame); }
  close(code, reason) { this.closedWith = { code, reason }; }
  // Test helpers acting as the relay.
  open() { this.onopen(); }
  push(body) { this.onmessage({ data: JSON.stringify(body) }); }
  drop(code, reason = "") { this.onclose({ code, reason }); }
  hello() { return JSON.parse(this.sent[0]); }
}
const lastSocket = () => sockets[sockets.length - 1];

function newSession(extra) {
  const timers = fakeTimers();
  const session = new NET.RelaySession({
    baseUrl: "https://relay.test/", code: "K7QX3", game: "connect-four",
    WebSocketImpl: FakeWebSocket, timers, random: () => 0.5, ...extra,
  });
  const events = [];
  for (const type of ["status", "welcome", "peer", "message", "closed"]) session.on(type, (p) => events.push([type, p]));
  return { session, timers, events };
}

// ---- codes and URLs ---------------------------------------------------------------

ok("codes are upper-cased and stripped", NET.normalizeCode(" k7q-x3 ") === "K7QX3");
ok("a valid code passes", NET.isValidCode("K7QX3"));
ok("look-alike characters are not codes", !NET.isValidCode("K7QO3") && !NET.isValidCode("K7Q13"));
ok("https becomes wss", NET.socketUrl("https://relay.test/", "K7QX3") === "wss://relay.test/rooms/K7QX3/ws");
ok("http becomes ws for local dev", NET.socketUrl("http://localhost:8787", "K7QX3") === "ws://localhost:8787/rooms/K7QX3/ws");
ok("the deployed site always uses the default relay",
  NET.relayUrl({ hostname: "almang45.github.io", search: "?relay=https://evil.example" }) === NET.DEFAULT_RELAY_URL);
ok("localhost may point at a local relay",
  NET.relayUrl({ hostname: "localhost", search: "?relay=http://localhost:8787/" }) === "http://localhost:8787");
ok("backoff grows and is capped", NET.backoffDelay(0, () => 1) === 500 && NET.backoffDelay(20, () => 1) === NET.BACKOFF_MAX_MS);
ok("backoff is jittered down to half", NET.backoffDelay(3, () => 0) === 2000);

// ---- createRoom ------------------------------------------------------------------

(async () => {
  {
    let seen = null;
    const room = await NET.createRoom({
      baseUrl: "https://relay.test/", game: "connect-four", seats: 2,
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return { ok: true, status: 201, json: async () => ({ code: "K7QX3", token: "abc", seat: 0 }) };
      },
    });
    ok("createRoom posts to /rooms", seen.url === "https://relay.test/rooms" && seen.init.method === "POST");
    ok("as a simple request, so no preflight", seen.init.headers["content-type"] === "text/plain");
    ok("createRoom returns the seat", room.code === "K7QX3" && room.token === "abc" && room.seat === 0);
  }
  const failing = [
    ["a network failure", async () => { throw new TypeError("Failed to fetch"); }, "unreachable"],
    ["a 429", async () => ({ ok: false, status: 429 }), "rate_limited"],
    ["a 502", async () => ({ ok: false, status: 502 }), "create_failed"],
    ["a malformed answer", async () => ({ ok: true, status: 201, json: async () => ({ code: "nope" }) }), "create_failed"],
  ];
  for (const [label, fetchImpl, code] of failing) {
    let error = null;
    try {
      await NET.createRoom({ baseUrl: "https://relay.test", game: "x", seats: 2, fetchImpl });
    } catch (e) {
      error = e;
    }
    ok(label + " becomes NetError " + code, error instanceof NET.NetError && error.code === code, error && error.code);
  }

  // ---- session: join, messages, presence ---------------------------------------------

  {
    const { session, events } = newSession();
    session.start();
    const ws = lastSocket();
    ok("connects to the room's socket", ws.url === "wss://relay.test/rooms/K7QX3/ws");
    ok("status starts as connecting", session.status === "connecting");
    ws.open();
    ok("hello carries version and game, no token for a new player",
      JSON.stringify(ws.hello()) === JSON.stringify({ t: "hello", v: NET.PROTOCOL_VERSION, game: "connect-four" }));
    ok("nothing is sent before the welcome", session.send({ k: 1 }) === false);
    ws.push({ t: "welcome", v: 1, seat: 1, token: "tok", game: "connect-four", seats: 2, present: [0, 1] });
    ok("welcome opens the session", session.status === "open" && session.seat === 1 && session.token === "tok");
    ok("everyone is present", session.everyonePresent);
    ok("send works once open", session.send({ k: "move" }) === true);
    ok("broadcast frames have no recipient", ws.sent[1] === JSON.stringify({ t: "msg", data: { k: "move" } }));
    session.send("hi", 0);
    ok("direct frames name the recipient", ws.sent[2] === JSON.stringify({ t: "msg", to: 0, data: "hi" }));
    ws.push({ t: "peer", seat: 0, state: "left" });
    ok("a peer leaving updates presence", !session.everyonePresent && JSON.stringify(session.present) === "[1]");
    ws.push({ t: "peer", seat: 0, state: "joined" });
    ok("and coming back restores it", session.everyonePresent);
    ws.push({ t: "msg", from: 0, data: { k: "move", col: 2 } });
    ok("messages are emitted with their sender", events.some(([t, p]) => t === "message" && p.from === 0 && p.data.col === 2));
    session.leave();
    ok("leave tells the relay", ws.sent[ws.sent.length - 1] === JSON.stringify({ t: "leave" }));
    ok("and closes locally", session.status === "closed" && ws.closedWith.code === 1000);
  }

  // ---- session: reconnects --------------------------------------------------------

  {
    const { session, timers, events } = newSession();
    session.start();
    let ws = lastSocket();
    ws.open();
    ws.push({ t: "welcome", v: 1, seat: 1, token: "tok", game: "connect-four", seats: 2, present: [0, 1] });
    const before = sockets.length;
    ws.drop(1006);
    ok("a network drop is retried, not fatal", session.status === "reconnecting" && !events.some(([t]) => t === "closed"));
    ok("while away, only this seat counts as present", JSON.stringify(session.present) === "[1]");
    timers.advance(374);
    ok("the retry waits out the backoff", sockets.length === before);
    timers.advance(1);
    ok("then reconnects", sockets.length === before + 1);
    ws = lastSocket();
    ws.open();
    ok("the reconnect resumes with the seat token", ws.hello().token === "tok");
    ws.drop(1006);
    timers.advance(10);
    session.nudge();
    ok("nudge skips the remaining backoff", sockets.length === before + 2);
    ws = lastSocket();
    ws.open();
    ws.push({ t: "welcome", v: 1, seat: 1, token: "tok", game: "connect-four", seats: 2, present: [0, 1] });
    ok("back to open", session.status === "open");

    // Heartbeat: pings while traffic flows, then gives up on a silent socket.
    timers.advance(NET.HEARTBEAT_MS);
    ok("a ping goes out on the heartbeat", ws.sent[ws.sent.length - 1] === NET.PING);
    const count = sockets.length;
    timers.advance(NET.DEAD_AFTER_MS);
    ok("a silent socket is dropped", ws.closedWith && ws.closedWith.reason === "heartbeat_timeout");
    ok("and replaced after the backoff", session.status === "reconnecting");
    timers.advance(NET.BACKOFF_MAX_MS);
    ok("with a new socket", sockets.length === count + 1);
  }

  for (const [name, code] of Object.entries(NET.CLOSE)) {
    const { session, timers, events } = newSession({ token: "tok" });
    session.start();
    const ws = lastSocket();
    ws.open();
    const count = sockets.length;
    ws.drop(code, "x");
    timers.advance(60000);
    const fatal = NET.FATAL.has(code);
    if (fatal) {
      ok(name + " ends the session for good", session.status === "closed" && sockets.length === count
        && events.some(([t, p]) => t === "closed" && p.code === code));
    } else {
      ok(name + " is retried", sockets.length === count + 1 && !events.some(([t]) => t === "closed"));
      session.close();
    }
  }

  {
    const { session, timers } = newSession();
    session.start();
    lastSocket().open();
    session.close();
    ok("close stops every timer", timers.pendingCount() === 0);
    const count = sockets.length;
    lastSocket().drop(1006);
    timers.advance(60000);
    ok("a closed session never reconnects", sockets.length === count);
  }

  {
    const { session } = newSession();
    session.on("welcome", () => { throw new Error("listener bug"); });
    let second = false;
    session.on("welcome", () => { second = true; });
    const originalError = console.error;
    console.error = () => {};
    session.start();
    lastSocket().open();
    lastSocket().push({ t: "welcome", v: 1, seat: 0, token: "t", game: "connect-four", seats: 2, present: [0] });
    console.error = originalError;
    ok("a throwing listener doesn't stop the others", second && session.status === "open");
  }

  // ---- seat storage ------------------------------------------------------------------

  {
    const map = new Map();
    const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
    NET.saveSeat(storage, "connect-four", "K7QX3", "tok");
    ok("a seat is remembered per game and room", NET.loadSeat(storage, "connect-four", "K7QX3") === "tok"
      && NET.loadSeat(storage, "reversi", "K7QX3") === null);
    NET.forgetSeat(storage, "connect-four", "K7QX3");
    ok("and forgotten", NET.loadSeat(storage, "connect-four", "K7QX3") === null);
    const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    NET.saveSeat(broken, "g", "K7QX3", "t");
    const loaded = NET.loadSeat(broken, "g", "K7QX3");
    NET.forgetSeat(broken, "g", "K7QX3");
    console.warn = originalWarn;
    ok("blocked storage degrades to no saved seat, with a warning each time", loaded === null && warnings.length === 3);
  }

  console.log("net relay-client: " + passed + " checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
