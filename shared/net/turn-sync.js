// Keeps a turn-based game with no hidden information in step across devices.
// Every device runs the same rules; only moves travel. Seat 0 (the host) owns the record: when
// anything disagrees - a stale round, a move out of order, a state hash that doesn't match -
// the host's move list is sent again and replayed. No DOM - <script> or require() in Node.
//
// The game supplies an adapter:
//   reset(config)  start a fresh game from the round's config
//   apply(move)    play a move, throwing if it is illegal (and leaving the state as it was)
//   hash()         a short string that differs whenever the positions differ
//   turnSeat()     the seat to move, or -1 when the game is over. With AI players this is the
//                  seat that plays for them (the host), not the game seat
//   requiredSeats()  optional: the seats that must be connected for play to go on. Defaults to
//                  every seat; a game that fills empty seats with AI lists only the humans
//   isValidConfig(config)  optional: false for a config this game can't start from
//
// `persist` ({load(), save(snapshot)}, optional) keeps the host's record across a reload, so a
// reloaded host restores its own copy and only falls back to asking the guests when it has none.
(function (root) {
  "use strict";

  // How long a reloaded host waits for a guest to hand back the game in progress.
  const RECOVER_MS = 2000;
  // A guest that can't replay the host's record retries with growing gaps, then gives up:
  // the same record would fail the same way forever.
  const SYNC_RETRY_MS = 1000;
  const MAX_SYNC_FAILURES = 3;
  // Replies a peer can trigger (snapshots, sync requests) come out of a small bucket per peer,
  // so a flood of requests can't push this device over the relay's own rate limit.
  const REPLY_BURST = 4;
  const REPLY_REFILL_MS = 1000;

  class TurnSync {
    constructor({ session, adapter, onChange, timers, persist }) {
      this.session = session;
      this.adapter = adapter;
      this.onChange = onChange;
      this.persist = persist || null;
      this.timers = timers || { setTimeout: (fn, ms) => root.setTimeout(fn, ms), clearTimeout: (id) => root.clearTimeout(id) };
      this.now = (timers && timers.now) || (() => Date.now());
      this.replyBuckets = new Map();
      this.recovery = null;
      this.round = 0;
      this.config = null;
      this.moves = [];
      this.recoverTimer = null;
      this.syncTimer = null;
      this.syncFailures = 0;
      this.desynced = false;
      session.on("welcome", () => this.onWelcome());
      session.on("peer", (peer) => this.onPeer(peer));
      session.on("message", (msg) => this.onMessage(msg));
      session.on("status", (status) => {
        // close() reports only a status change, and a stale timer must not touch the next room.
        if (status === "closed") this.stopTimers();
        this.notify({ type: "connection" });
      });
      session.on("closed", () => this.stopTimers());
    }

    get isHost() { return this.session.seat === 0; }
    get started() { return this.config !== null; }

    notify(event) {
      this.onChange(event);
    }

    // Everyone who plays this round is connected, so a move can't race a player's absence.
    get playersPresent() {
      if (!this.adapter.requiredSeats) return this.session.everyonePresent;
      const { present } = this.session;
      return this.session.status === "open" && this.adapter.requiredSeats().every((seat) => present.includes(seat));
    }

    canMove() {
      return this.started && this.playersPresent && this.adapter.turnSeat() === this.session.seat;
    }

    // Host only: start a round with `config` (who plays which side, first player, ...).
    newRound(config) {
      if (!this.isHost) throw new Error("Only the host starts a round");
      this.stopRecovering();
      this.round += 1;
      this.config = config;
      this.moves = [];
      this.adapter.reset(config);
      this.save();
      this.session.send(this.snapshot());
      this.notify({ type: "round" });
    }

    // Host only: change who plays what in the round under way (a seat handed to the AI, say).
    // The moves stay; every device replays them under the new config.
    changeConfig(config) {
      if (!this.isHost) throw new Error("Only the host changes the round");
      if (!this.started) return false;
      // Checked first: a config load() refuses would leave the host without its game.
      if (!config || typeof config !== "object" || (this.adapter.isValidConfig && !this.adapter.isValidConfig(config))) {
        console.warn("turn-sync: refusing an invalid config change");
        return false;
      }
      if (!this.load({ round: this.round, config, moves: this.moves })) return false;
      this.session.send(this.snapshot());
      return true;
    }

    play(move) {
      if (!this.canMove()) return false;
      this.adapter.apply(move);
      this.moves.push(move);
      this.save();
      this.session.send({ k: "move", round: this.round, i: this.moves.length - 1, move, hash: this.adapter.hash() });
      this.notify({ type: "move", seat: this.session.seat, move, local: true });
      return true;
    }

    snapshot() {
      return { k: "state", round: this.round, config: this.config, moves: this.moves.slice() };
    }

    save() {
      if (this.persist && this.isHost && this.started) this.persist.save(this.snapshot());
    }

    onWelcome() {
      if (!this.isHost) {
        this.session.send({ k: "sync" }, 0);
      } else if (this.started || this.restore()) {
        // Back from a drop or a reload: whatever the guests did meanwhile, the host's record counts.
        this.session.send(this.snapshot());
      } else if (this.session.present.length > 1) {
        // A reloaded host has lost its game; the guests that still have it can hand it back.
        // Armed before asking: the timer doubles as the "accept a guest's state" flag.
        this.stopRecovering();
        this.recovery = new Map();
        this.recoverTimer = this.timers.setTimeout(() => this.finishRecovery(), RECOVER_MS);
        this.session.send({ k: "recover" });
      } else {
        this.notify({ type: "need-round" });
      }
    }

    onPeer({ seat, state }) {
      if (this.isHost && state === "joined" && this.started) this.reply(seat, this.snapshot());
      this.notify({ type: "peer", seat, state });
    }

    onMessage({ from, data }) {
      if (!data || typeof data !== "object") {
        console.warn("turn-sync: ignoring a message with no body from seat", from);
        return;
      }
      switch (data.k) {
        case "state":
          // Guests take the host's record; the host takes a guest's only to recover after a reload.
          if (from === 0 && !this.isHost) this.load(data);
          else if (this.isHost && this.recoverTimer !== null) this.collect(from, data);
          break;
        case "sync":
          if (this.isHost && this.started) this.reply(from, this.snapshot());
          break;
        case "recover":
          if (from === 0 && !this.isHost && this.started) this.reply(0, this.snapshot());
          break;
        case "move":
          this.remoteMove(from, data);
          break;
        default:
          console.warn("turn-sync: ignoring unknown message", data.k);
      }
    }

    restore() {
      const saved = this.persist && this.persist.load();
      return Boolean(saved) && this.load(saved);
    }

    // Sends `data` to one peer in answer to something it sent, unless that peer has used up its replies.
    reply(seat, data) {
      const now = this.now();
      const bucket = this.replyBuckets.get(seat) || { tokens: REPLY_BURST, at: now };
      bucket.tokens = Math.min(REPLY_BURST, bucket.tokens + (now - bucket.at) / REPLY_REFILL_MS);
      bucket.at = now;
      this.replyBuckets.set(seat, bucket);
      if (bucket.tokens < 1) {
        console.warn("turn-sync: too many requests from seat " + seat + ", not answering");
        return false;
      }
      bucket.tokens -= 1;
      return this.session.send(data, seat);
    }

    // Every present guest answers a recovering host; a record is adopted only when they all agree,
    // so one modified page can't hand the host a game of its own making.
    collect(from, data) {
      this.recovery.set(from, data);
      const guests = this.session.present.filter((seat) => seat !== 0);
      if (guests.every((seat) => this.recovery.has(seat))) this.finishRecovery();
    }

    finishRecovery() {
      const answers = [...this.recovery.values()];
      this.stopRecovering();
      if (this.started) return;
      const records = new Set(answers.map((a) => JSON.stringify([a.round, a.config, a.moves])));
      if (records.size === 1) {
        this.adopt(answers[0]);
        return;
      }
      if (records.size > 1) console.warn("turn-sync: the guests' records disagree, starting a new round");
      this.notify({ type: "need-round" });
    }

    adopt(data) {
      if (!this.load(data)) {
        this.notify({ type: "need-round" });
        return;
      }
      this.session.send(this.snapshot());
    }

    load({ round, config, moves }) {
      if (!Number.isInteger(round) || !Array.isArray(moves)) {
        console.warn("turn-sync: ignoring a malformed state");
        return false;
      }
      try {
        if (!config || typeof config !== "object" || (this.adapter.isValidConfig && !this.adapter.isValidConfig(config))) {
          throw new Error("invalid config");
        }
        this.adapter.reset(config);
        for (const move of moves) this.adapter.apply(move);
      } catch (error) {
        console.error("turn-sync: a state didn't replay", error);
        this.config = null;
        if (!this.isHost) this.replayFailed();
        return false;
      }
      this.round = round;
      this.config = config;
      this.moves = moves.slice();
      this.syncFailures = 0;
      this.stopSyncRetry();
      this.save();
      if (this.desynced) {
        this.desynced = false;
        this.notify({ type: "resynced" });
      }
      this.notify({ type: "state" });
      return true;
    }

    replayFailed() {
      this.syncFailures += 1;
      if (this.syncFailures >= MAX_SYNC_FAILURES) {
        this.desynced = true;
        this.notify({ type: "desync" });
        return;
      }
      if (this.syncTimer !== null) return;
      this.syncTimer = this.timers.setTimeout(() => {
        this.syncTimer = null;
        this.session.send({ k: "sync" }, 0);
      }, SYNC_RETRY_MS * Math.pow(2, this.syncFailures - 1));
    }

    remoteMove(from, { round, i, move, hash }) {
      if (!this.started || round !== this.round || i !== this.moves.length || this.adapter.turnSeat() !== from) {
        this.resync(from, "out_of_order");
        return;
      }
      try {
        this.adapter.apply(move);
      } catch (error) {
        this.resync(from, "illegal_move");
        return;
      }
      this.moves.push(move);
      this.save();
      if (this.adapter.hash() !== hash) {
        this.resync(from, "hash_mismatch");
        // The move was applied here, so the board changed even though the devices disagree.
        this.notify({ type: "state" });
        return;
      }
      this.notify({ type: "move", seat: from, move, local: false });
    }

    resync(from, reason) {
      console.warn("turn-sync: resyncing with seat " + from + " (" + reason + ")");
      if (this.isHost) {
        if (this.started) this.reply(from, this.snapshot());
      } else {
        this.reply(0, { k: "sync" });
      }
    }

    stopRecovering() {
      if (this.recoverTimer !== null) this.timers.clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
      this.recovery = null;
    }

    stopSyncRetry() {
      if (this.syncTimer !== null) this.timers.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    stopTimers() {
      this.stopRecovering();
      this.stopSyncRetry();
    }
  }

  const api = { TurnSync, RECOVER_MS, SYNC_RETRY_MS, MAX_SYNC_FAILURES, REPLY_BURST };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MINI_NET = Object.assign(root.MINI_NET || {}, api);
  }
})(typeof window !== "undefined" ? window : globalThis);
