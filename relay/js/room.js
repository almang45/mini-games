// One Durable Object per room code. It hands out seats, forwards game messages between them
// and expires itself. It never reads the game data: every rule lives in the browser.
import {
  CLOSE, MAX_MESSAGE_CHARS, MAX_TOKEN_CHARS, PING, PONG, PROTOCOL_VERSION, SUPPORTED_VERSIONS,
} from "./protocol.js";
import { randomToken, sha256Hex } from "./ids.js";
import { json } from "./http.js";
import { log } from "./log.js";

export const IDLE_TTL_MS = 30 * 60 * 1000;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const HELLO_TIMEOUT_MS = 10 * 1000;
// Clients ping every 20 s. A seat silent this long belongs to a phone that vanished without a TCP close.
export const STALE_MS = 90 * 1000;
export const SWEEP_MS = 60 * 1000;
// A guest seat is free for a tokenless join only after it has been empty this long: past the
// client's reconnect window and the stale sweep, so a code holder can't grab a seat mid-reconnect.
export const RECLAIM_GRACE_MS = 3 * 60 * 1000;
// Per socket: bursts of 40 frames, 5 per second sustained. A turn-based game sends far less.
export const BUCKET_SIZE = 40;
const REFILL_PER_MS = 5 / 1000;
const OPEN = 1;
const CLOSED = 3;

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.meta = null;
    this.buckets = new WeakMap();
    this.lastFrame = new WeakMap();
    this.helloPending = new WeakSet();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.meta = (await ctx.storage.get("meta")) || null;
      // Rooms created before leftAt existed.
      if (this.meta && !Array.isArray(this.meta.leftAt)) this.meta.leftAt = new Array(this.meta.seats).fill(null);
    });
    if (typeof WebSocketRequestResponsePair === "function") {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    }
  }

  async fetch(request) {
    await this.ready;
    const { pathname } = new URL(request.url);
    if (pathname === "/init" && request.method === "POST") return this.init(await request.json());
    if (pathname === "/ws") return this.upgrade();
    return json({ error: "not_found" }, 404);
  }

  async init({ code, game, seats }) {
    if (this.meta) return json({ error: "exists" }, 409);
    const token = randomToken();
    const hash = await sha256Hex(token);
    // Checked again: the digest await lets another request in.
    if (this.meta) return json({ error: "exists" }, 409);
    const now = Date.now();
    const tokens = new Array(seats).fill(null);
    tokens[0] = hash;
    this.meta = { code, game, seats, tokens, leftAt: new Array(seats).fill(null), createdAt: now, idleSince: now };
    await this.save();
    await this.reschedule(now);
    log("info", "room_created", { room: code, game, seats });
    return json({ code, seat: 0, token, game, seats }, 201);
  }

  async upgrade() {
    const [client, server] = Object.values(new WebSocketPair());
    await this.accept(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Accepted even for an unknown room, so the browser gets a close code it can explain.
  async accept(ws) {
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ seat: null, at: Date.now(), closed: false });
    if (!this.meta) {
      this.closeSocket(ws, CLOSE.ROOM_GONE, "room_not_found");
      return;
    }
    await this.reschedule(Date.now());
  }

  async webSocketMessage(ws, raw) {
    await this.ready;
    if (typeof raw !== "string") return this.reject(ws, CLOSE.BAD_MESSAGE, "binary_frame");
    if (raw.length > MAX_MESSAGE_CHARS) return this.reject(ws, CLOSE.TOO_LARGE, "message_too_large");
    if (!this.takeToken(ws)) return this.reject(ws, CLOSE.RATE_LIMITED, "rate_limited");
    this.lastFrame.set(ws, Date.now());
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.reject(ws, CLOSE.BAD_MESSAGE, "invalid_json");
    }
    if (!msg || typeof msg !== "object") return this.reject(ws, CLOSE.BAD_MESSAGE, "not_an_object");
    const { seat } = this.attachment(ws);
    if (!Number.isInteger(seat)) {
      if (msg.t !== "hello") return this.reject(ws, CLOSE.BAD_MESSAGE, "hello_required");
      // A second hello while the first awaits its hash would claim a second seat.
      if (this.helloPending.has(ws)) return this.reject(ws, CLOSE.BAD_MESSAGE, "duplicate_hello");
      this.helloPending.add(ws);
      try {
        return await this.hello(ws, msg);
      } finally {
        this.helloPending.delete(ws);
      }
    }
    switch (msg.t) {
      case "msg": return this.relay(ws, seat, msg);
      case "leave": return this.leave(ws, seat);
      case "ping": return this.sendRaw(ws, PONG);
      default: return this.reject(ws, CLOSE.BAD_MESSAGE, "unknown_type");
    }
  }

  async hello(ws, msg) {
    if (!SUPPORTED_VERSIONS.includes(msg.v)) return this.reject(ws, CLOSE.VERSION, "unsupported_version");
    const { token } = msg;
    if (token !== undefined && (typeof token !== "string" || !token || token.length > MAX_TOKEN_CHARS)) {
      return this.reject(ws, CLOSE.BAD_MESSAGE, "bad_token");
    }
    // Hash first: nothing below awaits, so two sockets can never claim the same free seat.
    const fresh = token === undefined ? randomToken() : null;
    const hash = await sha256Hex(token ?? fresh);
    // The hello timeout may have closed this socket during the await.
    if (this.attachment(ws).closed) return;
    const { meta } = this;
    if (!meta) return this.reject(ws, CLOSE.ROOM_GONE, "room_not_found");
    if (msg.game !== meta.game) return this.reject(ws, CLOSE.WRONG_GAME, "wrong_game");
    let seat;
    if (fresh) {
      seat = meta.tokens.indexOf(null);
      if (seat < 0) seat = this.reclaimableSeat(Date.now());
      if (seat < 0) return this.reject(ws, CLOSE.ROOM_FULL, "room_full");
      if (meta.tokens[seat] !== null) log("info", "seat_reclaimed", { room: meta.code, seat });
      meta.tokens[seat] = hash;
    } else {
      seat = meta.tokens.indexOf(hash);
      if (seat < 0) return this.reject(ws, CLOSE.FORBIDDEN, "unknown_token");
    }
    // The newest socket wins: the older one is usually a phone that lost its network.
    for (const other of this.seatSockets(seat)) this.closeSocket(other, CLOSE.REPLACED, "replaced");
    meta.idleSince = null;
    meta.leftAt[seat] = null;
    ws.serializeAttachment({ seat, at: Date.now(), closed: false });
    this.send(ws, {
      t: "welcome", v: PROTOCOL_VERSION, seat, token: token ?? fresh,
      game: meta.game, seats: meta.seats, present: this.presentSeats(),
    });
    this.broadcast({ t: "peer", seat, state: "joined" }, ws);
    log("info", "seat_joined", { room: meta.code, seat, resumed: !fresh });
    await this.save();
    await this.reschedule(Date.now());
  }

  relay(ws, seat, msg) {
    const { meta } = this;
    if (!meta) return this.reject(ws, CLOSE.ROOM_GONE, "room_not_found");
    const { to } = msg;
    if (to !== undefined && !(Number.isInteger(to) && to >= 0 && to < meta.seats && to !== seat)) {
      return this.reject(ws, CLOSE.BAD_MESSAGE, "bad_recipient");
    }
    if (!("data" in msg)) return this.reject(ws, CLOSE.BAD_MESSAGE, "missing_data");
    const frame = JSON.stringify({ t: "msg", from: seat, data: msg.data });
    for (const peer of this.live(ws)) {
      if (to === undefined || peer.seat === to) this.sendRaw(peer.ws, frame);
    }
  }

  // Leaving gives the seat up for good. The host leaving ends the room: the host's browser runs the game.
  async leave(ws, seat) {
    const { meta } = this;
    if (!meta) return this.reject(ws, CLOSE.ROOM_GONE, "room_not_found");
    if (seat === 0) return this.expire("host_left");
    meta.tokens[seat] = null;
    meta.leftAt[seat] = null;
    this.closeSocket(ws, CLOSE.LEFT, "left");
    this.broadcast({ t: "peer", seat, state: "gone" });
    log("info", "seat_left", { room: meta.code, seat });
    await this.markIdleIfEmpty();
    await this.save();
  }

  async webSocketClose(ws, code, reason) {
    await this.ready;
    const { seat } = this.attachment(ws);
    if (ws.readyState !== CLOSED) {
      try {
        // 1005/1006 describe a close nobody sent and may not be sent back.
        ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
      } catch (error) {
        log("debug", "close_reply_failed", { room: this.meta?.code, error: String(error) });
      }
    }
    if (!this.meta) return;
    // Silent when the seat was given up ("gone" already sent) or a newer socket replaced this one.
    const held = Number.isInteger(seat) && this.meta.tokens[seat] !== null;
    const { announced } = this.attachment(ws);
    if (held && this.seatSockets(seat).every((other) => other === ws)) {
      this.markLeft(seat, Date.now());
      if (!announced) {
        this.broadcast({ t: "peer", seat, state: "left" }, ws);
        log("info", "seat_disconnected", { room: this.meta.code, seat, code });
      }
    }
    await this.markIdleIfEmpty(ws);
    await this.save();
  }

  webSocketError(ws, error) {
    log("warn", "socket_error", { room: this.meta?.code, seat: this.attachment(ws).seat, error: String(error) });
  }

  async alarm() {
    await this.ready;
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (!Number.isInteger(att.seat) && !att.closed && now - att.at >= HELLO_TIMEOUT_MS) {
        this.closeSocket(ws, CLOSE.HELLO_TIMEOUT, "hello_timeout");
      }
    }
    const { meta } = this;
    if (meta && now - meta.createdAt >= MAX_AGE_MS) return this.expire("max_age");
    if (meta && meta.idleSince !== null && now - meta.idleSince >= IDLE_TTL_MS) return this.expire("idle");
    const swept = this.sweepStale(now);
    const idled = await this.markIdleIfEmpty();
    // Most sweeps find nothing; skipping the write keeps an occupied room off the storage quota.
    if (swept || idled) await this.save();
  }

  // The relay can't rely on a close event from a phone that lost coverage, so it checks the
  // heartbeat itself and frees the seat for presence and idle expiry.
  sweepStale(now) {
    if (!this.meta) return false;
    let swept = false;
    for (const peer of this.live()) {
      if (now - this.lastSeen(peer.ws) <= STALE_MS) continue;
      const att = this.attachment(peer.ws);
      peer.ws.serializeAttachment({ ...att, announced: true });
      this.closeSocket(peer.ws, CLOSE.STALE, "stale");
      if (this.seatSockets(peer.seat).length === 0) {
        this.markLeft(peer.seat, now);
        this.broadcast({ t: "peer", seat: peer.seat, state: "left" });
      }
      log("info", "seat_stale", { room: this.meta.code, seat: peer.seat });
      swept = true;
    }
    return swept;
  }

  markLeft(seat, now) {
    if (this.meta.leftAt[seat] === null) this.meta.leftAt[seat] = now;
  }

  lastSeen(ws) {
    const auto = typeof this.ctx.getWebSocketAutoResponseTimestamp === "function"
      ? this.ctx.getWebSocketAutoResponseTimestamp(ws)
      : null;
    return Math.max(this.attachment(ws).at, auto ? auto.getTime() : 0, this.lastFrame.get(ws) || 0);
  }

  // A guest seat empty for the grace period: its holder lost the token (new tab, lost welcome)
  // or is gone. Anyone holding the code may then take it, the same trust that let them join.
  reclaimableSeat(now) {
    for (let seat = 1; seat < this.meta.seats; seat++) {
      const leftAt = this.meta.leftAt[seat];
      if (leftAt !== null && now - leftAt >= RECLAIM_GRACE_MS && this.seatSockets(seat).length === 0) return seat;
    }
    return -1;
  }

  async expire(reason) {
    const code = this.meta?.code;
    for (const ws of this.ctx.getWebSockets()) {
      if (!this.attachment(ws).closed) this.closeSocket(ws, CLOSE.ROOM_GONE, reason);
    }
    this.meta = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    log("info", "room_closed", { room: code, reason });
  }

  // ------------------------------------------------------------------ helpers

  // Returns whether the room just went idle.
  async markIdleIfEmpty(closing) {
    let idled = false;
    if (this.meta && this.meta.idleSince === null && this.live(closing).length === 0) {
      this.meta.idleSince = Date.now();
      idled = true;
    }
    await this.reschedule(Date.now());
    return idled;
  }

  async reschedule(now) {
    const due = [];
    for (const ws of this.ctx.getWebSockets()) {
      const att = this.attachment(ws);
      if (!Number.isInteger(att.seat) && !att.closed) due.push(att.at + HELLO_TIMEOUT_MS);
    }
    if (this.meta) {
      if (this.live().length > 0) {
        due.push(now + SWEEP_MS);
        // Never move a pending alarm later: events more often than SWEEP_MS would postpone the sweep forever.
        const pending = await this.ctx.storage.getAlarm();
        if (pending !== null && pending > now) due.push(pending);
      }
      due.push(this.meta.createdAt + MAX_AGE_MS);
      if (this.meta.idleSince !== null) due.push(this.meta.idleSince + IDLE_TTL_MS);
    }
    if (due.length === 0) return this.ctx.storage.deleteAlarm();
    return this.ctx.storage.setAlarm(Math.max(now, Math.min(...due)));
  }

  attachment(ws) {
    return ws.deserializeAttachment() || { seat: null, at: 0, closed: true };
  }

  // Open sockets that hold a seat, except `except`.
  live(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== OPEN) continue;
      const { seat, closed } = this.attachment(ws);
      if (Number.isInteger(seat) && !closed) out.push({ ws, seat });
    }
    return out;
  }

  seatSockets(seat) {
    return this.live().filter((peer) => peer.seat === seat).map((peer) => peer.ws);
  }

  presentSeats() {
    return [...new Set(this.live().map((peer) => peer.seat))].sort((a, b) => a - b);
  }

  takeToken(ws) {
    const now = Date.now();
    const bucket = this.buckets.get(ws) || { tokens: BUCKET_SIZE, at: now };
    bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + (now - bucket.at) * REFILL_PER_MS);
    bucket.at = now;
    this.buckets.set(ws, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  send(ws, body) {
    this.sendRaw(ws, JSON.stringify(body));
  }

  sendRaw(ws, frame) {
    try {
      ws.send(frame);
    } catch (error) {
      log("warn", "send_failed", { room: this.meta?.code, error: String(error) });
    }
  }

  broadcast(body, except) {
    const frame = JSON.stringify(body);
    for (const peer of this.live(except)) this.sendRaw(peer.ws, frame);
  }

  reject(ws, code, reason) {
    log("warn", "socket_rejected", { room: this.meta?.code, code, reason });
    this.closeSocket(ws, code, reason);
  }

  // Marked first, so the close handler doesn't announce a seat that was replaced or rejected on purpose.
  closeSocket(ws, code, reason) {
    const att = this.attachment(ws);
    ws.serializeAttachment({ ...att, closed: true });
    try {
      ws.close(code, reason);
    } catch (error) {
      log("warn", "close_failed", { room: this.meta?.code, code, error: String(error) });
    }
  }

  save() {
    return this.meta ? this.ctx.storage.put("meta", this.meta) : Promise.resolve();
  }
}
