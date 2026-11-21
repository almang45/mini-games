// Keeps a turn-based game with no hidden information in step across devices.
// Every device runs the same rules; only moves travel. Seat 0 (the host) owns the record: when
// anything disagrees - a stale round, a move out of order, a state hash that doesn't match -
// the host's move list is sent again and replayed. No DOM - <script> or require() in Node.
//
// The game supplies an adapter:
//   reset(config)  start a fresh game from the round's config
//   apply(move)    play a move, throwing if it is illegal (and leaving the state as it was)
//   hash()         a short string that differs whenever the positions differ
//   turnSeat()     the seat to move, or -1 when the game is over
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

  class TurnSync {
    constructor({ session, adapter, onChange, timers, persist }) {
      this.session = session;
      this.adapter = adapter;
      this.onChange = onChange;
      this.persist = persist || null;
      this.timers = timers || { setTimeout: (fn, ms) => root.setTimeout(fn, ms), clearTimeout: (id) => root.clearTimeout(id) };
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

    canMove() {
      return this.started && this.session.everyonePresent && this.adapter.turnSeat() === this.session.seat;
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
        // A reloaded host has lost its game; a guest that still has it can hand it back.
        // Armed before asking: the timer doubles as the "accept a guest's state" flag.
        this.recoverTimer = this.timers.setTimeout(() => {
          this.recoverTimer = null;
          if (!this.started) this.notify({ type: "need-round" });
        }, RECOVER_MS);
        this.session.send({ k: "recover" });
      } else {
        this.notify({ type: "need-round" });
      }
    }

    onPeer({ seat, state }) {
      if (this.isHost && state === "joined" && this.started) this.session.send(this.snapshot(), seat);
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
          else if (this.isHost && this.recoverTimer !== null) this.adopt(data);
          break;
        case "sync":
          if (this.isHost && this.started) this.session.send(this.snapshot(), from);
          break;
        case "recover":
          if (from === 0 && !this.isHost && this.started) this.session.send(this.snapshot(), 0);
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

    adopt(data) {
      this.stopRecovering();
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
        if (this.started) this.session.send(this.snapshot(), from);
      } else {
        this.session.send({ k: "sync" }, 0);
      }
    }

    stopRecovering() {
      if (this.recoverTimer !== null) this.timers.clearTimeout(this.recoverTimer);
      this.recoverTimer = null;
    }

    stopTimers() {
      this.stopRecovering();
      if (this.syncTimer !== null) this.timers.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  const api = { TurnSync, RECOVER_MS, SYNC_RETRY_MS, MAX_SYNC_FAILURES };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.MINI_NET = Object.assign(root.MINI_NET || {}, api);
  }
})(typeof window !== "undefined" ? window : globalThis);
