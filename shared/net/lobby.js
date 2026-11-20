// The "Online" panel a game drops into its page: host a room, join one by code or link, see the
// connection, share the link, leave. The game gets the session through onSession and decides
// everything else. Needs relay-client.js loaded first; styles in net.css.
(function (root) {
  "use strict";
  const NET = root.MINI_NET;

  const CLOSE_TEXT = {
    [NET.CLOSE.FORBIDDEN]: "That seat belongs to someone else. Join again with the code.",
    [NET.CLOSE.ROOM_GONE]: "That room has ended or doesn't exist.",
    [NET.CLOSE.WRONG_GAME]: "That code is for a different game.",
    [NET.CLOSE.ROOM_FULL]: "That room is full.",
    [NET.CLOSE.REPLACED]: "This game was opened in another tab.",
    [NET.CLOSE.LEFT]: "You left the room.",
    [NET.CLOSE.VERSION]: "The game was updated - reload this page on both devices.",
  };
  // After these the saved seat is useless, so a reload shouldn't try it again.
  const DROP_SEAT = new Set([
    NET.CLOSE.FORBIDDEN, NET.CLOSE.ROOM_GONE, NET.CLOSE.WRONG_GAME, NET.CLOSE.ROOM_FULL, NET.CLOSE.LEFT,
  ]);

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props || {});
    for (const child of children || []) node.append(child);
    return node;
  }

  function sessionStore() {
    try {
      return root.sessionStorage;
    } catch (error) {
      console.warn("mini-net: sessionStorage is unavailable; reloading will lose the seat", error);
      return null;
    }
  }

  // opts: game, seats, onSession(session), onEnd(reason), peerName(seat) -> label used in status text.
  function mountLobby(container, opts) {
    const storage = sessionStore() || { getItem: () => null, setItem() {}, removeItem() {} };
    const baseUrl = NET.relayUrl(root.location);
    const peerName = opts.peerName || ((seat) => "Player " + (seat + 1));
    let session = null;

    const hostBtn = el("button", { type: "button", className: "btn-primary", textContent: "Host a game" });
    const codeInput = el("input", {
      type: "text", id: "netCode", maxLength: NET.CODE_LENGTH, placeholder: "CODE",
      autocomplete: "off", spellcheck: false, autocapitalize: "characters",
    });
    codeInput.setAttribute("aria-label", "Room code");
    const joinBtn = el("button", { type: "submit", textContent: "Join" });
    const joinForm = el("form", { className: "net-join" }, [
      el("label", { htmlFor: "netCode", textContent: "or join with a code" }), codeInput, joinBtn,
    ]);
    const startView = el("div", { className: "net-start" }, [hostBtn, joinForm]);

    const codeText = el("strong", { className: "net-code" });
    const shareBtn = el("button", { type: "button", textContent: "Share link" });
    const leaveBtn = el("button", { type: "button", textContent: "Leave" });
    const roomView = el("div", { className: "net-room", hidden: true }, [
      el("span", { textContent: "Room" }), codeText, shareBtn, leaveBtn,
    ]);

    const dot = el("span", { className: "net-dot" });
    dot.setAttribute("aria-hidden", "true");
    const statusText = el("span");
    const status = el("p", { className: "net-status", role: "status" }, [dot, statusText]);

    const panel = el("section", { className: "net-lobby", hidden: true }, [startView, roomView, status]);
    panel.setAttribute("aria-label", "Online play");
    container.append(panel);

    function say(text, tone) {
      statusText.textContent = text;
      dot.dataset.tone = tone || "idle";
    }

    function setBusy(busy) {
      hostBtn.disabled = busy;
      joinBtn.disabled = busy;
      codeInput.disabled = busy;
    }

    function setRoomInUrl(code) {
      const url = new URL(root.location.href);
      if (code) url.searchParams.set("room", code);
      else url.searchParams.delete("room");
      root.history.replaceState(root.history.state, "", url);
    }

    function shareUrl() {
      const url = new URL(root.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("room", session.code);
      return url.href;
    }

    function describe() {
      if (!session) return;
      if (session.status === "connecting") return say("Connecting…", "wait");
      if (session.status === "reconnecting") return say("Connection lost - reconnecting…", "wait");
      if (session.status !== "open") return;
      const missing = [];
      for (let seat = 0; seat < session.seats; seat++) if (!session.present.includes(seat)) missing.push(seat);
      if (missing.length === 0) return say("Connected - everyone is here.", "ok");
      const names = missing.map(peerName).join(", ");
      return say("Waiting for " + names + ". Share the code or link.", "wait");
    }

    function showRoom(code) {
      codeText.textContent = code;
      startView.hidden = true;
      roomView.hidden = false;
    }

    function showStart() {
      startView.hidden = false;
      roomView.hidden = true;
      setBusy(false);
    }

    function end(reason, message, tone) {
      const ended = session;
      session = null;
      if (ended) {
        if (reason === "left" || DROP_SEAT.has(reason)) NET.forgetSeat(storage, opts.game, ended.code);
        ended.close();
      }
      setRoomInUrl(null);
      showStart();
      say(message, tone);
      opts.onEnd(reason);
    }

    function begin(code, token) {
      session = new NET.RelaySession({ baseUrl, code, game: opts.game, token });
      session.on("welcome", ({ token: seatToken }) => {
        NET.saveSeat(storage, opts.game, code, seatToken);
        describe();
      });
      session.on("status", describe);
      session.on("peer", describe);
      session.on("closed", ({ code: closeCode }) => {
        end(closeCode, CLOSE_TEXT[closeCode] || "The connection was refused (" + closeCode + ").", "error");
      });
      showRoom(code);
      setRoomInUrl(code);
      opts.onSession(session);
      session.start();
    }

    async function host() {
      setBusy(true);
      say("Creating a room…", "wait");
      try {
        const room = await NET.createRoom({ baseUrl, game: opts.game, seats: opts.seats });
        NET.saveSeat(storage, opts.game, room.code, room.token);
        begin(room.code, room.token);
      } catch (error) {
        console.error("mini-net: creating a room failed", error);
        setBusy(false);
        say(error.code === "unreachable" ? error.message + " Local modes still work." : error.message, "error");
      }
    }

    function join(rawCode) {
      const code = NET.normalizeCode(rawCode);
      if (!NET.isValidCode(code)) {
        say("A room code is " + NET.CODE_LENGTH + " letters and digits, like K7QX3.", "error");
        codeInput.focus();
        return false;
      }
      begin(code, NET.loadSeat(storage, opts.game, code));
      return true;
    }

    async function share() {
      const url = shareUrl();
      try {
        if (root.navigator.share) {
          await root.navigator.share({ title: document.title, url });
          return;
        }
        await root.navigator.clipboard.writeText(url);
        say("Link copied.", "ok");
      } catch (error) {
        if (error && error.name === "AbortError") return; // the share sheet was dismissed
        console.warn("mini-net: sharing failed", error);
        say("Copy this link: " + url, "idle");
      }
    }

    hostBtn.addEventListener("click", host);
    joinForm.addEventListener("submit", (event) => {
      event.preventDefault();
      join(codeInput.value);
    });
    codeInput.addEventListener("input", () => { codeInput.value = NET.normalizeCode(codeInput.value); });
    shareBtn.addEventListener("click", share);
    leaveBtn.addEventListener("click", () => leave());

    // A phone that slept or changed network: reconnect now rather than after the backoff.
    document.addEventListener("visibilitychange", () => {
      if (session && document.visibilityState === "visible") session.nudge();
    });
    root.addEventListener("online", () => { if (session) session.nudge(); });

    function leave() {
      if (!session) return;
      session.leave();
      end("left", "You left the room.", "idle");
    }

    say("Host a room, then share its code or link with the other player.", "idle");

    return {
      show(visible) { panel.hidden = !visible; },
      leave,
      get session() { return session; },
      // Joins the room named in ?room=, if any. Returns whether it did.
      joinFromUrl() {
        const code = new URLSearchParams(root.location.search).get("room");
        return code ? join(code) : false;
      },
    };
  }

  root.MINI_NET = Object.assign(root.MINI_NET || {}, { mountLobby });
})(window);
