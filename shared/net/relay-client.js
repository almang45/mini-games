// Browser side of online play: creates rooms on the relay (relay/) and keeps one WebSocket
// session alive through drops, sleeps and network changes.
// No DOM - <script> (global MINI_NET) or require() in Node.
(function (root) {
  "use strict";

  const DEFAULT_RELAY_URL = "https://mini-games-relay.almang45-395.workers.dev";

  // Mirrors relay/js/protocol.js; shared/js/test/net-contract.test.js keeps the two in step.
  const PROTOCOL_VERSION = 1;
  const CODE_LENGTH = 5;
  const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
  const PING = '{"t":"ping"}';
  const CLOSE = Object.freeze({
    BAD_MESSAGE: 4000,
    HELLO_TIMEOUT: 4001,
    FORBIDDEN: 4003,
    ROOM_GONE: 4004,
    WRONG_GAME: 4005,
    RATE_LIMITED: 4008,
    ROOM_FULL: 4009,
    REPLACED: 4010,
    LEFT: 4011,
    TOO_LARGE: 4013,
    VERSION: 4026,
  });
  // Closes another attempt can't fix. Every other close, including a plain network drop, is retried.
  const FATAL = new Set([
    CLOSE.BAD_MESSAGE, CLOSE.FORBIDDEN, CLOSE.ROOM_GONE, CLOSE.WRONG_GAME, CLOSE.ROOM_FULL,
    CLOSE.REPLACED, CLOSE.LEFT, CLOSE.TOO_LARGE, CLOSE.VERSION,
  ]);

  const HEARTBEAT_MS = 20000;
  const DEAD_AFTER_MS = 45000;
  const BACKOFF_BASE_MS = 500;
  const BACKOFF_MAX_MS = 10000;
  const RATE_LIMITED_DELAY_MS = 30000;

  class NetError extends Error {
    constructor(code, message, cause) {
      super(message, cause ? { cause } : undefined);
      this.name = "NetError";
      this.code = code;
    }
  }

  const trimSlash = (url) => String(url).replace(/\/+$/, "");

  function normalizeCode(input) {
    return String(input || "").toUpperCase().replace(/[\s-]/g, "");
  }

  const isValidCode = (code) => CODE_PATTERN.test(code);

  function socketUrl(baseUrl, code) {
    return trimSlash(baseUrl).replace(/^http/, "ws") + "/rooms/" + code + "/ws";
  }

  // Only a page served from this machine may point at another relay (`wrangler dev`), so a
  // shared link can't send players' games through someone else's server.
  function relayUrl(location) {
    if (location && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      const override = new URLSearchParams(location.search).get("relay");
      if (override && /^https?:\/\//.test(override)) return trimSlash(override);
    }
    return DEFAULT_RELAY_URL;
  }

  // Exponential with jitter, so two phones that dropped together don't retry in lockstep.
  function backoffDelay(attempt, random) {
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, attempt));
    return Math.round(ceiling * (0.5 + random() / 2));
  }

  async function createRoom({ baseUrl, game, seats, fetchImpl }) {
    const doFetch = fetchImpl || ((...args) => root.fetch(...args));
    let res;
    try {
      // text/plain keeps this a "simple" request, so the browser skips the CORS preflight round trip.
      res = await doFetch(trimSlash(baseUrl) + "/rooms", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ game, seats }),
      });
    } catch (error) {
      throw new NetError("unreachable", "Couldn't reach the online server.", error);
    }
    if (res.status === 429) throw new NetError("rate_limited", "Too many new rooms - wait a minute and try again.");
    if (!res.ok) throw new NetError("create_failed", "The online server couldn't create a room (" + res.status + ").");
    const body = await res.json();
    if (!isValidCode(body.code) || typeof body.token !== "string") {
      throw new NetError("create_failed", "The online server sent an unexpected answer.");
    }
    return { code: body.code, token: body.token, seat: body.seat };
  }

  const defaultTimers = () => ({
    setTimeout: (fn, ms) => root.setTimeout(fn, ms),
    clearTimeout: (id) => root.clearTimeout(id),
    setInterval: (fn, ms) => root.setInterval(fn, ms),
    clearInterval: (id) => root.clearInterval(id),
    now: () => Date.now(),
  });

  // Events: "status" (connecting | open | reconnecting | closed), "welcome", "peer", "message",
  // "closed" ({code, reason}, only for closes that won't be retried).
  class RelaySession {
    constructor({ baseUrl, code, game, token, WebSocketImpl, timers, random }) {
      this.baseUrl = baseUrl;
      this.code = code;
      this.game = game;
      this.token = token || null;
      this.WebSocketImpl = WebSocketImpl || root.WebSocket;
      this.timers = timers || defaultTimers();
      this.random = random || Math.random;
      this.status = "idle";
      this.seat = null;
      this.seats = 0;
      this.present = [];
      this.attempt = 0;
      this.ws = null;
      this.retryTimer = null;
      this.heartbeat = null;
      this.lastSeen = 0;
      this.listeners = {};
    }

    on(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
      return this;
    }

    emit(type, payload) {
      for (const fn of this.listeners[type] || []) {
        try {
          fn(payload);
        } catch (error) {
          // One broken listener must not stop the socket handler or the other listeners.
          console.error("mini-net: '" + type + "' listener failed", error);
        }
      }
    }

    setStatus(status) {
      if (this.status === status) return;
      this.status = status;
      this.emit("status", status);
    }

    get everyonePresent() {
      return this.status === "open" && this.seats > 0 && this.present.length === this.seats;
    }

    start() {
      if (this.status === "idle") this.connect();
      return this;
    }

    connect() {
      this.stopTimers();
      this.setStatus(this.seat === null ? "connecting" : "reconnecting");
      const ws = new this.WebSocketImpl(socketUrl(this.baseUrl, this.code));
      this.ws = ws;
      // Events from a socket that was already replaced are stale and ignored.
      ws.onopen = () => {
        if (ws !== this.ws) return;
        this.lastSeen = this.timers.now();
        const hello = { t: "hello", v: PROTOCOL_VERSION, game: this.game };
        if (this.token) hello.token = this.token;
        ws.send(JSON.stringify(hello));
        this.heartbeat = this.timers.setInterval(() => this.beat(), HEARTBEAT_MS);
      };
      ws.onmessage = (event) => {
        if (ws !== this.ws) return;
        this.lastSeen = this.timers.now();
        this.onFrame(event.data);
      };
      ws.onclose = (event) => {
        if (ws !== this.ws) return;
        this.ws = null;
        this.onClosed(event.code, event.reason);
      };
      // No onerror: a failed socket always fires close next, and that is where retries happen.
    }

    onFrame(raw) {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (error) {
        console.error("mini-net: unreadable frame from the relay", error);
        return;
      }
      switch (msg.t) {
        case "welcome":
          this.attempt = 0;
          this.seat = msg.seat;
          this.seats = msg.seats;
          this.token = msg.token;
          this.present = msg.present.slice();
          this.setStatus("open");
          this.emit("welcome", { seat: msg.seat, seats: msg.seats, token: msg.token, present: this.present.slice() });
          break;
        case "peer":
          this.present = this.present.filter((seat) => seat !== msg.seat);
          if (msg.state === "joined") this.present = this.present.concat(msg.seat).sort((a, b) => a - b);
          this.emit("peer", { seat: msg.seat, state: msg.state });
          break;
        case "msg":
          this.emit("message", { from: msg.from, data: msg.data });
          break;
        case "pong":
          break;
        default:
          console.warn("mini-net: unknown frame type", msg.t);
      }
    }

    onClosed(code, reason) {
      this.stopTimers();
      if (this.status === "closed") return;
      if (FATAL.has(code)) {
        this.setStatus("closed");
        this.emit("closed", { code, reason });
        return;
      }
      this.present = this.seat === null ? [] : [this.seat];
      this.setStatus("reconnecting");
      const delay = code === CLOSE.RATE_LIMITED ? RATE_LIMITED_DELAY_MS : backoffDelay(this.attempt++, this.random);
      this.retryTimer = this.timers.setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, delay);
    }

    // The relay answers pings without waking up; silence this long means the socket is dead even
    // if the browser hasn't noticed (common after a phone sleeps or switches network).
    beat() {
      const ws = this.ws;
      if (!ws) return;
      if (this.timers.now() - this.lastSeen > DEAD_AFTER_MS) {
        this.ws = null;
        this.closeQuietly(ws, 4000, "heartbeat_timeout");
        this.onClosed(1006, "heartbeat_timeout");
        return;
      }
      ws.send(PING);
    }

    // Call when the page becomes visible or the network returns: retry now instead of waiting out the backoff.
    nudge() {
      if (this.status === "reconnecting" && this.retryTimer !== null) {
        this.attempt = 0;
        this.connect();
      }
    }

    send(data, to) {
      if (this.status !== "open" || !this.ws) return false;
      this.ws.send(JSON.stringify(to === undefined ? { t: "msg", data } : { t: "msg", to, data }));
      return true;
    }

    // Gives the seat up for good. close() only disconnects this tab.
    leave() {
      if (this.ws && this.status === "open") this.ws.send(JSON.stringify({ t: "leave" }));
      this.close();
    }

    close() {
      this.setStatus("closed");
      this.stopTimers();
      const ws = this.ws;
      this.ws = null;
      if (ws) this.closeQuietly(ws, 1000, "client_closed");
    }

    closeQuietly(ws, code, reason) {
      try {
        ws.close(code, reason);
      } catch (error) {
        console.warn("mini-net: closing the socket failed", error);
      }
    }

    stopTimers() {
      if (this.retryTimer !== null) this.timers.clearTimeout(this.retryTimer);
      if (this.heartbeat !== null) this.timers.clearInterval(this.heartbeat);
      this.retryTimer = null;
      this.heartbeat = null;
    }
  }

  // Seat tokens live in sessionStorage: one per tab, kept across a reload, gone with the tab.
  const seatKey = (game, code) => "mini-net:" + game + ":" + code;

  function saveSeat(storage, game, code, token) {
    try {
      storage.setItem(seatKey(game, code), token);
    } catch (error) {
      console.warn("mini-net: couldn't remember the seat; a reload will join as a new player", error);
    }
  }

  function loadSeat(storage, game, code) {
    try {
      return storage.getItem(seatKey(game, code));
    } catch (error) {
      console.warn("mini-net: couldn't read the saved seat", error);
      return null;
    }
  }

  function forgetSeat(storage, game, code) {
    try {
      storage.removeItem(seatKey(game, code));
    } catch (error) {
      console.warn("mini-net: couldn't forget the saved seat", error);
    }
  }

  const api = {
    DEFAULT_RELAY_URL, PROTOCOL_VERSION, CODE_LENGTH, CODE_PATTERN, PING, CLOSE, FATAL,
    HEARTBEAT_MS, DEAD_AFTER_MS, BACKOFF_MAX_MS,
    NetError, RelaySession,
    normalizeCode, isValidCode, socketUrl, relayUrl, backoffDelay, createRoom,
    saveSeat, loadSeat, forgetSeat,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MINI_NET = Object.assign(root.MINI_NET || {}, api);
  }
})(typeof window !== "undefined" ? window : globalThis);
