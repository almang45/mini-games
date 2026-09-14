// Lobby + table controller. Wires the pure game engines (js/games/*.js) and
// their per-game UI adapters (js/ui/*.js) into the DOM in index.html.
(function () {
  "use strict";
  const DOM = window.DOM;

  const GAMES = {
    hearts: window.HEARTS_UI,
    spades: window.SPADES_UI,
    "crazy-eights": window.CE_UI,
    president: window.PRESIDENT_UI,
    "big-two": window.BIG_TWO_UI,
    "gin-rummy": window.GIN_RUMMY_UI,
    "chinese-poker": window.CHINESE_POKER_UI,
    blackjack: window.BLACKJACK_UI,
  };
  const GAME_ORDER = ["hearts", "spades", "crazy-eights", "president", "big-two", "gin-rummy", "chinese-poker", "blackjack"];

  let selectedGameKey = null;
  let seatConfig = ["human", "ai", "ai", "ai"];
  let currentGame = null;
  let engineState = null;
  let humanSeats = [];
  let viewerSeat = null;
  let aiTimer = null;

  const $ = (id) => document.getElementById(id);

  const SCREEN_IDS = ["screen-start", "screen-table"];
  function showScreen(id) {
    SCREEN_IDS.forEach((sid) => $(sid).classList.toggle("is-active", sid === id));
  }

  // ------------------------------------------------------------------ lobby

  function buildGameGrid() {
    const grid = $("gameGrid");
    DOM.clear(grid);
    GAME_ORDER.forEach((key) => {
      const g = GAMES[key];
      const card = DOM.el("button", "game-card" + (key === selectedGameKey ? " is-selected" : ""), [
        DOM.el("h3", null, g.label),
        DOM.el("p", null, g.tagline),
        DOM.el("div", "game-meta", g.seatMin === g.seatMax ? "Exactly " + g.seatMax + " players" : g.seatMin + "-" + g.seatMax + " players"),
      ]);
      card.type = "button";
      card.addEventListener("click", () => selectGame(key));
      grid.appendChild(card);
    });
  }

  function selectGame(key) {
    selectedGameKey = key;
    const g = GAMES[key];
    // Open every game on a startable seat count: fill empty seats with AI, and
    // trim AI seats (then humans) from the end for games like Gin Rummy's 2.
    const active = () => seatConfig.filter((v) => v !== "off").length;
    for (let i = 0; i < seatConfig.length && active() < g.seatMin; i++) if (seatConfig[i] === "off") seatConfig[i] = "ai";
    for (const kind of ["ai", "human"]) {
      for (let i = seatConfig.length - 1; i >= 0 && active() > g.seatMax; i--) if (seatConfig[i] === kind) seatConfig[i] = "off";
    }
    buildGameGrid();
    renderSeatSetup();
    $("seatSetup").hidden = false;
  }

  function renderSeatSetup() {
    const g = GAMES[selectedGameKey];
    const rows = $("seatRows");
    DOM.clear(rows);
    for (let i = 0; i < 4; i++) {
      const options = g.seatFixed ? ["human", "ai"] : ["human", "ai", "off"];
      const seg = DOM.el("div", "segmented");
      options.forEach((opt) => {
        const btn = DOM.el("button", "seg-option" + (seatConfig[i] === opt ? " is-active" : ""), labelFor(opt));
        btn.type = "button";
        btn.addEventListener("click", () => { seatConfig[i] = opt; renderSeatSetup(); });
        seg.appendChild(btn);
      });
      rows.appendChild(DOM.el("div", "seat-row", [
        DOM.el("div", "seat-row-label", "Seat " + (i + 1)),
        seg,
      ]));
    }
    const count = seatConfig.filter((v) => v !== "off").length;
    const ok = count >= g.seatMin && count <= g.seatMax;
    $("startBtn").disabled = !ok;
    $("startWarning").textContent = ok ? "" :
      g.label + " needs " + (g.seatMin === g.seatMax ? "exactly " + g.seatMin : g.seatMin + "-" + g.seatMax) +
      " players - currently " + count + ".";
  }

  function labelFor(opt) { return opt === "human" ? "Human" : opt === "ai" ? "AI" : "Off"; }

  function startGame() {
    currentGame = GAMES[selectedGameKey];
    const seatTypes = seatConfig.filter((v) => v !== "off");
    engineState = currentGame.create(seatTypes);
    humanSeats = [];
    engineState.seats.forEach((s, i) => { if (s.type === "human") humanSeats.push(i); });
    viewerSeat = humanSeats.length > 0 ? humanSeats[0] : null;
    $("tableTitle").textContent = currentGame.label;
    hideInterstitial();
    showScreen("screen-table");
    syncTable();
  }

  // ------------------------------------------------------------------ table

  function seatKindTag(seat) {
    if (engineState.seats[seat].type === "ai") return "AI";
    return humanSeats.length <= 1 ? "You" : "Human";
  }

  function revealSeat(seat) {
    if (engineState.seats[seat].type !== "human") return false;
    return humanSeats.length <= 1 || viewerSeat === seat;
  }

  function renderTable() {
    const g = currentGame;
    const state = engineState;
    const n = state.seats.length;
    const anchor = viewerSeat != null ? viewerSeat : 0;
    const actSeat = state.gameOver ? null : g.actingSeat(state);

    $("tableStatus").textContent = g.statusLine(state);

    const wrap = $("tableWrap");
    const felt = $("feltTable");
    Array.from(wrap.children).forEach((child) => { if (child !== felt) wrap.removeChild(child); });
    for (let i = 0; i < n; i++) {
      const offset = (i - anchor + n) % n;
      const pos = DOM.seatPosition(n, offset);
      const seatEl = DOM.el("div", "seat pos-" + pos + (actSeat === i ? " is-turn" : ""));
      seatEl.appendChild(DOM.el("div", "seat-header", [
        DOM.el("span", "seat-name", state.seats[i].name),
        DOM.el("span", "seat-tag", seatKindTag(i)),
        DOM.el("span", "seat-score", g.seatTag(state, i)),
      ]));
      const handEl = DOM.el("div", "seat-hand");
      const hand = g.handOf(state, i);
      if (revealSeat(i)) {
        DOM.renderFan(handEl, hand, {
          isSelected: (c) => g.isCardSelected(state, i, c),
          isDisabled: (c) => actSeat !== i || g.isCardDisabled(state, i, c),
          onCard: (c) => { g.onCardClick(state, i, c, { pickSuit }); syncTable(); },
          tag: g.cardTag ? (c) => g.cardTag(state, i, c) : undefined,
        });
      } else {
        for (let k = 0; k < hand.length; k++) handEl.appendChild(DOM.cardEl(null, { faceDown: true, small: true }));
      }
      seatEl.appendChild(handEl);
      wrap.appendChild(seatEl);
    }

    DOM.clear(felt);
    felt.appendChild(g.centerNode(state, anchor));

    renderActionBar(actSeat);
    renderLog(state);
    renderResult(state);
  }

  function renderActionBar(actSeat) {
    const g = currentGame, state = engineState;
    const bar = $("actionBar");
    DOM.clear(bar);
    const showButtons = !state.gameOver && (g.isInterim(state) ||
      (actSeat != null && state.seats[actSeat].type === "human" && (humanSeats.length <= 1 || viewerSeat === actSeat)));
    if (!showButtons) return;
    const seat = actSeat != null ? actSeat : (viewerSeat != null ? viewerSeat : 0);
    g.actionButtons(state, seat).forEach((b) => {
      const btn = DOM.el("button", b.primary ? "btn-primary" : "", b.label);
      btn.type = "button";
      btn.disabled = !!b.disabled;
      btn.addEventListener("click", () => { b.onClick(); syncTable(); });
      bar.appendChild(btn);
    });
  }

  function renderLog(state) {
    const panel = $("logPanel");
    DOM.clear(panel);
    state.log.slice(-30).reverse().forEach((entry, i) => {
      panel.appendChild(DOM.el("div", "log-entry" + (i === 0 ? " is-fresh" : ""), entry.text));
    });
  }

  function renderResult(state) {
    const overlay = $("resultOverlay");
    if (!state.gameOver) { overlay.hidden = true; return; }
    overlay.hidden = false;
    const list = $("standingsList");
    DOM.clear(list);
    currentGame.standings(state).forEach((row, i) => {
      const tr = DOM.el("tr", null, [
        DOM.el("td", null, "#" + (i + 1)),
        DOM.el("td", null, row.name),
        DOM.el("td", null, row.detail),
      ]);
      list.appendChild(tr);
    });
  }

  // Drives AI turns and hot-seat handoffs until a human needs to act (or the
  // round/game pauses on its own, e.g. Hearts' "Deal Next Round" gate).
  function syncTable() {
    renderTable();
    clearTimeout(aiTimer);
    const state = engineState, g = currentGame;
    if (state.gameOver || g.isInterim(state)) { hideInterstitial(); return; }
    const seat = g.actingSeat(state);
    if (seat == null) { hideInterstitial(); return; }
    if (state.seats[seat].type === "ai") {
      hideInterstitial();
      aiTimer = setTimeout(() => { g.stepAI(state, seat); syncTable(); }, 600);
      return;
    }
    if (humanSeats.length > 1 && viewerSeat !== seat) {
      showInterstitial(state.seats[seat].name, () => { viewerSeat = seat; syncTable(); });
    } else {
      hideInterstitial();
    }
  }

  // ------------------------------------------------------------------ modals

  function showInterstitial(name, onReady) {
    $("interstitialTitle").textContent = "Pass the device to " + name;
    $("interstitialOverlay").hidden = false;
    $("btnInterstitialReady").onclick = () => { $("interstitialOverlay").hidden = true; onReady(); };
  }
  function hideInterstitial() { $("interstitialOverlay").hidden = true; }

  const SUIT_BUTTON_IDS = { C: "suitBtnC", D: "suitBtnD", H: "suitBtnH", S: "suitBtnS" };
  function pickSuit(onChosen) {
    $("suitModal").hidden = false;
    Object.keys(SUIT_BUTTON_IDS).forEach((suit) => {
      $(SUIT_BUTTON_IDS[suit]).onclick = () => { $("suitModal").hidden = true; onChosen(suit); syncTable(); };
    });
  }

  // ------------------------------------------------------------------- init

  function backToLobby() {
    clearTimeout(aiTimer);
    hideInterstitial();
    showScreen("screen-start");
  }

  function init() {
    buildGameGrid();
    $("startBtn").addEventListener("click", startGame);
    $("btnBackToLobby").addEventListener("click", backToLobby);
    $("btnPlayAgain").addEventListener("click", () => { engineState = currentGame.create(seatConfig.filter((v) => v !== "off")); syncTable(); });
    $("btnResultLobby").addEventListener("click", backToLobby);
    selectGame(GAME_ORDER[0]);
    showScreen("screen-start");
  }

  // Test-only hooks (mirrors the UMD export guard used throughout js/games and
  // js/ui: a no-op in the browser, picked up by require() under Node so the
  // DOM-shim smoke test in js/test/ui-smoke.test.js can drive the real
  // controller instead of re-implementing it).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      selectGame, startGame, syncTable,
      setSeat: (i, v) => { seatConfig[i] = v; },
      getEngineState: () => engineState,
      getCurrentGame: () => currentGame,
      getViewerSeat: () => viewerSeat,
      getHumanSeats: () => humanSeats.slice(),
      playCard: (seat, card) => { currentGame.onCardClick(engineState, seat, card, { pickSuit }); syncTable(); },
      clickAction: (label) => {
        const seat = currentGame.actingSeat(engineState);
        const btnSeat = seat != null ? seat : (viewerSeat != null ? viewerSeat : 0);
        const btn = currentGame.actionButtons(engineState, btnSeat).find((b) => b.label === label);
        if (!btn) throw new Error('no action button labeled "' + label + '"');
        btn.onClick();
        syncTable();
      },
      isInterstitialShowing: () => !$("interstitialOverlay").hidden,
      confirmInterstitial: () => { $("btnInterstitialReady").onclick(); },
      isSuitModalShowing: () => !$("suitModal").hidden,
      chooseSuit: (suit) => { $(SUIT_BUTTON_IDS[suit]).onclick(); },
    };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
