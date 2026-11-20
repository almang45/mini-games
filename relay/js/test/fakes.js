// In-memory stand-ins for the Durable Object runtime, enough to drive Room in Node.
import { logger } from "../log.js";

export const logs = [];
logger.write = (level, line) => logs.push(JSON.parse(line));

export class FakeSocket {
  constructor(ctx) {
    this.ctx = ctx;
    this.readyState = 1;
    this.sent = [];
    this.closedWith = null;
    this.att = null;
  }
  send(frame) {
    if (this.readyState !== 1) throw new Error("send after close");
    this.sent.push(frame);
  }
  close(code, reason) {
    if (this.readyState === 3) throw new Error("already closed");
    this.closedWith = { code, reason };
    this.readyState = 3;
    this.ctx.sockets = this.ctx.sockets.filter((ws) => ws !== this);
  }
  serializeAttachment(value) { this.att = structuredClone(value); }
  deserializeAttachment() { return this.att && structuredClone(this.att); }
  frames() { return this.sent.map((frame) => JSON.parse(frame)); }
  last() { return JSON.parse(this.sent[this.sent.length - 1]); }
}

export class FakeContext {
  constructor() {
    this.sockets = [];
    this.data = new Map();
    this.alarmAt = null;
    const self = this;
    this.storage = {
      async get(key) { return self.data.has(key) ? structuredClone(self.data.get(key)) : undefined; },
      async put(key, value) { self.data.set(key, structuredClone(value)); },
      async deleteAll() { self.data.clear(); },
      async setAlarm(at) { self.alarmAt = at; },
      async deleteAlarm() { self.alarmAt = null; },
    };
  }
  blockConcurrencyWhile(fn) { return fn(); }
  getWebSocketAutoResponseTimestamp(ws) { return ws.autoAt ? new Date(ws.autoAt) : null; }
  acceptWebSocket(ws) { this.sockets.push(ws); }
  getWebSockets() { return this.sockets.slice(); }
  socket() { return new FakeSocket(this); }
}

let passed = 0;
export function ok(label, cond, extra) {
  if (!cond) {
    console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
    process.exit(1);
  }
  passed++;
}
export const count = () => passed;
