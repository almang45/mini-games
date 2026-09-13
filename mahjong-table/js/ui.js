// Presentational layer for the 4-player table: renders MJ.game.state and turns DOM
// events back into MJ.game calls. Owns no rules knowledge itself - every legality
// check (what's callable, what's discardable) comes from getTurnOptions/getCallOptions
// so this file stays correct even as the engine's actual rules logic changes underneath it.
// AI decisions are delegated to MJ.ai (js/ai.js) where available, with a simple
// fallback policy inline in case that module fails to load.
(function () {
  "use strict";

  const el = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- tile glyphs

  // MJ.tiles (from js/tiles.js) is the source of truth for glyphs/names; these are
  // just a fallback in case that script failed to load, so this file never hard-depends
  // on a sibling module it doesn't own.
  const HONOR_GLYPHS_FALLBACK = ["\u{1F000}", "\u{1F001}", "\u{1F002}", "\u{1F003}", "\u{1F006}", "\u{1F005}", "\u{1F004}"];
  const HONOR_NAMES_FALLBACK = ["East", "South", "West", "North", "Haku", "Hatsu", "Chun"];
  const TILE_BACK = "\u{1F02B}";

  function tileGlyph(kind) {
    if (kind == null) return "";
    if (window.MJ && MJ.tiles && typeof MJ.tiles.glyphOf === "function") return MJ.tiles.glyphOf(kind);
    if (kind >= 27) return HONOR_GLYPHS_FALLBACK[kind - 27];
    if (kind >= 18) return String.fromCodePoint(0x1f019 + (kind - 18));
    if (kind >= 9) return String.fromCodePoint(0x1f010 + (kind - 9));
    return String.fromCodePoint(0x1f007 + kind);
  }

  // compact notation for log lines ("5p"), matching how the design doc phrases them
  function tileName(kind) {
    if (kind == null) return "?";
    if (window.MJ && MJ.tiles && typeof MJ.tiles.indexToNotation === "function" && kind < 27) {
      return MJ.tiles.indexToNotation(kind);
    }
    if (kind >= 27) return HONOR_NAMES_FALLBACK[kind - 27];
    const base = kind >= 18 ? 18 : kind >= 9 ? 9 : 0;
    const suit = kind >= 18 ? "p" : kind >= 9 ? "s" : "m";
    return (kind - base + 1) + suit;
  }

  function windName(kind) {
    if (window.MJ && MJ.tiles && typeof MJ.tiles.nameOf === "function") return MJ.tiles.nameOf(kind);
    return HONOR_NAMES_FALLBACK[kind - 27] || "?";
  }

  // ---------------------------------------------------------------- ui state

  const AI_DELAY_MS = 550;

  let game = null;
  let ruleset = "riichi";
  let mode = "ai"; // 'ai' | 'hotseat'
  let humanSeats = [0];
  let viewerSeat = 0; // seat currently rendered at the bottom of the table
  let riichiArmed = false;
  let currentTurnOptions = null; // getTurnOptions() result for whichever seat is deciding right now
  let callState = null; // in-flight awaiting-calls bookkeeping, see buildCallState()
  let lastHandResult = null;
  let scoresAtHandStart = [0, 0, 0, 0];
  let passReadyHandler = null;

  function engineAvailable() {
    return !!(window.MJ && MJ.game && typeof MJ.game.createGame === "function");
  }

  function isAiSeat(seat) { return !humanSeats.includes(seat); }
  function needsInterstitial(seat) { return mode === "hotseat" && humanSeats.includes(seat) && viewerSeat !== seat; }
  function isHandRevealed(seat) { return mode === "ai" ? seat === 0 : seat === viewerSeat; }

  function windKindForSeat(i) {
    if (!game) return 27;
    return 27 + ((i - game.state.dealerSeat + 4) % 4);
  }

  function seatDisplayName(seat) {
    if (mode === "ai" && seat === 0) return "You";
    return windName(windKindForSeat(seat));
  }

  function safeCall(fn) {
    try {
      return fn();
    } catch (err) {
      console.error(err);
      log("Engine error: " + (err && err.message ? err.message : String(err)));
      return undefined;
    }
  }

  function log(message) {
    const box = el("eventLog");
    const row = document.createElement("div");
    row.className = "log-entry";
    row.textContent = message;
    box.appendChild(row);
    while (box.children.length > 200) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ---------------------------------------------------------------- rendering

  function renderAll() {
    if (!game || !game.state) return;
    renderSeats();
    renderCenter();
  }

  function setRole(root, role, text) {
    const node = root.querySelector('[data-role="' + role + '"]');
    if (node) node.textContent = text;
  }

  function renderSeats() {
    for (let i = 0; i < 4; i++) {
      const seatState = game.state.seats[i];
      const seatEl = el("seat-" + i);
      if (!seatEl || !seatState) continue;

      const offset = (i - viewerSeat + 4) % 4;
      const pos = ["bottom", "right", "top", "left"][offset];
      seatEl.classList.remove("pos-top", "pos-right", "pos-bottom", "pos-left");
      seatEl.classList.add("pos-" + pos);
      seatEl.classList.toggle("is-turn", game.state.turnSeat === i);

      setRole(seatEl, "wind", tileGlyph(windKindForSeat(i)));
      setRole(seatEl, "name", seatDisplayName(i));
      const dealerNode = seatEl.querySelector('[data-role="dealer"]');
      if (dealerNode) dealerNode.hidden = game.state.dealerSeat !== i;
      const riichiNode = seatEl.querySelector('[data-role="riichi"]');
      if (riichiNode) riichiNode.hidden = !seatState.riichiDeclared;
      setRole(seatEl, "score", String(seatState.score));

      renderMelds(seatEl.querySelector('[data-role="melds"]'), seatState.openMelds || []);
      renderDiscards(seatEl.querySelector('[data-role="discards"]'), seatState.discards || []);
      renderHand(seatEl.querySelector('[data-role="hand"]'), i, seatState);
    }
  }

  function renderMelds(container, melds) {
    if (!container) return;
    container.innerHTML = "";
    melds.forEach((meld) => {
      const group = document.createElement("div");
      // a concealed kan's tiles stay face-down here too - simplest way to guarantee
      // we never leak a hand through the meld area, at the cost of the usual "two
      // exposed ends" convention real tables use for closed kans.
      group.className = "meld-group" + (meld.concealed ? " is-concealed-kan" : "");
      (meld.tiles || []).forEach((k) => {
        const t = document.createElement("div");
        t.className = "tile-mini" + (meld.concealed ? " face-down" : "");
        t.textContent = meld.concealed ? "" : tileGlyph(k);
        group.appendChild(t);
      });
      container.appendChild(group);
    });
  }

  function renderDiscards(container, discards) {
    if (!container) return;
    container.innerHTML = "";
    (discards || []).forEach((k) => {
      const t = document.createElement("div");
      t.className = "discard-tile";
      t.textContent = tileGlyph(k);
      container.appendChild(t);
    });
  }

  function renderHand(container, seatIdx, seatState) {
    if (!container) return;
    container.innerHTML = "";
    const revealed = isHandRevealed(seatIdx);
    const counts = seatState.concealed || [];
    const activeDiscarder = revealed && game.state.phase === "awaiting-turn-action" && game.state.turnSeat === seatIdx && !isAiSeat(seatIdx);

    if (revealed) {
      const kinds = [];
      for (let k = 0; k < counts.length; k++) for (let c = 0; c < counts[k]; c++) kinds.push(k);
      kinds.sort((a, b) => a - b);
      kinds.forEach((k) => container.appendChild(makeHandTile(k, seatIdx, activeDiscarder, false)));
      if (seatState.drawnTile != null) container.appendChild(makeHandTile(seatState.drawnTile, seatIdx, activeDiscarder, true));
    } else {
      const total = counts.reduce((a, b) => a + b, 0) + (seatState.drawnTile != null ? 1 : 0);
      for (let i = 0; i < total; i++) container.appendChild(makeBackTile());
    }
  }

  function makeHandTile(kind, seatIdx, activeDiscarder, isDrawn) {
    const d = document.createElement("div");
    d.className = "hand-tile" + (isDrawn ? " drawn" : "");
    d.textContent = tileGlyph(kind);
    d.dataset.kind = String(kind);
    if (activeDiscarder) {
      const restricted = currentTurnOptions && Array.isArray(currentTurnOptions.discardOptions);
      const eligible = !restricted || currentTurnOptions.discardOptions.includes(kind);
      if (eligible) {
        d.classList.add("selectable");
        if (riichiArmed) d.classList.add("riichi-armed");
        d.addEventListener("click", () => onDiscardTileClick(seatIdx, kind));
      }
    }
    return d;
  }

  function makeBackTile() {
    const d = document.createElement("div");
    d.className = "tile-back";
    d.textContent = TILE_BACK;
    return d;
  }

  function makeMiniTile(kind) {
    const d = document.createElement("div");
    d.className = "tile-mini";
    d.textContent = tileGlyph(kind);
    return d;
  }

  function renderCenter() {
    const s = game.state;
    el("roundIndicator").textContent = windName(s.roundWind) + " " + s.handNumber;
    el("honbaIndicator").textContent = (s.honba || 0) + " honba";
    el("wallCount").textContent = "Wall " + (s.wall ? s.wall.length : 0);
    el("riichiPot").textContent = "Sticks " + (s.riichiSticks || 0);

    const isRiichi = ruleset === "riichi";
    el("doraArea").hidden = !isRiichi;
    if (isRiichi) {
      const box = el("doraTiles");
      box.innerHTML = "";
      (s.doraIndicators || []).forEach((k) => box.appendChild(makeMiniTile(k)));
    }
  }

  // ---------------------------------------------------------------- action bar: turn

  function hideActionPanels() {
    el("turnActions").hidden = true;
    el("callActions").hidden = true;
    currentTurnOptions = null;
  }

  function renderTurnControls(seat) {
    const opts = safeCall(() => MJ.game.getTurnOptions(game)) || {};
    currentTurnOptions = opts;
    el("callActions").hidden = true;
    el("turnActions").hidden = false;
    el("btnRiichi").disabled = !opts.canRiichi;
    el("btnTsumo").disabled = !opts.canTsumo;
    if (!opts.canRiichi) {
      riichiArmed = false;
      el("btnRiichi").classList.remove("armed");
    }
    renderKanOptions(opts.closedKanOptions || [], opts.addedKanOptions || []);
    renderAll();
  }

  function renderKanOptions(closed, added) {
    const box = el("kanOptions");
    box.innerHTML = "";
    closed.forEach((k) => box.appendChild(makeKanButton(k, "closed")));
    added.forEach((k) => box.appendChild(makeKanButton(k, "added")));
  }

  function makeKanButton(kind, kanType) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-action";
    btn.textContent = "Kan " + tileName(kind);
    btn.addEventListener("click", () => performKan(game.state.turnSeat, kind, kanType));
    return btn;
  }

  function performKan(seat, kind, kanType) {
    if (!window.MJ || !MJ.game || typeof MJ.game.declareKan !== "function") {
      log("Kan on " + tileName(kind) + " requested, but the engine has no declareKan() yet.");
      return;
    }
    safeCall(() => MJ.game.declareKan(game, seat, kind, kanType));
    log(seatDisplayName(seat) + " calls Kan on " + tileName(kind));
    currentTurnOptions = null;
    tick();
  }

  function onDiscardTileClick(seatIdx, kind) {
    const declareRiichi = riichiArmed;
    riichiArmed = false;
    safeCall(() => MJ.game.discard(game, seatIdx, kind, { declareRiichi }));
    log(seatDisplayName(seatIdx) + " discards " + tileName(kind) + (declareRiichi ? " and declares Riichi" : ""));
    currentTurnOptions = null;
    tick();
  }

  el("btnRiichi").addEventListener("click", () => {
    if (el("btnRiichi").disabled) return;
    riichiArmed = !riichiArmed;
    el("btnRiichi").classList.toggle("armed", riichiArmed);
    renderAll();
  });

  el("btnTsumo").addEventListener("click", () => {
    if (el("btnTsumo").disabled) return;
    const seat = game.state.turnSeat;
    const result = safeCall(() => MJ.game.declareTsumo(game, seat));
    log(seatDisplayName(seat) + " wins by Tsumo!");
    if (result) lastHandResult = result;
    riichiArmed = false;
    currentTurnOptions = null;
    tick();
  });

  // ---------------------------------------------------------------- action bar: calls

  function decideAiCall(seat, opt, discardTile) {
    // Delegates to js/ai.js (shanten-aware) when present; falls back to a
    // ron-or-pass policy if the AI module didn't load for some reason.
    if (window.MJ && MJ.ai && typeof MJ.ai.chooseCallDecision === "function") {
      const decision = safeCall(() => MJ.ai.chooseCallDecision(game, seat, opt, discardTile));
      if (decision) return decision;
    }
    return opt.ron ? { action: "ron" } : { action: "pass" };
  }

  function buildCallState(discardInfo, key) {
    const perSeat = safeCall(() => MJ.game.getCallOptions(game, discardInfo.seat, discardInfo.tile)) || {};
    const decisions = {};
    const pendingHuman = [];
    for (let s = 0; s < 4; s++) {
      if (s === discardInfo.seat) continue;
      const opt = perSeat[s];
      if (!opt) continue;
      // note: kanOptions is a boolean (can-call), chiOptions is an array of combos
      const hasAny = opt.ron || opt.pon || opt.kanOptions || (opt.chiOptions && opt.chiOptions.length);
      if (!hasAny) continue;
      if (isAiSeat(s)) {
        const decision = decideAiCall(s, opt, discardInfo.tile);
        decisions[s] = decision.action;
        if (decision.action === "chi" && decision.chiTiles) decisions.chiTiles = decision.chiTiles;
      } else {
        pendingHuman.push(s);
      }
    }
    return { key, discardInfo, perSeat, decisions, pendingHuman };
  }

  function handleCallsPhase() {
    const discardInfo = game.state.lastDiscard;
    if (!discardInfo) {
      // nothing to resolve against - let the engine move on rather than stall here
      safeCall(() => MJ.game.resolveCalls(game, {}));
      tick();
      return;
    }
    const key = discardInfo.seat + ":" + discardInfo.tile + ":" + (game.state.wall ? game.state.wall.length : 0);
    if (!callState || callState.key !== key) callState = buildCallState(discardInfo, key);
    advanceCallState();
  }

  function advanceCallState() {
    if (callState.pendingHuman.length === 0) {
      finalizeCallState();
      return;
    }
    const seat = callState.pendingHuman[0];
    if (needsInterstitial(seat)) {
      showPassInterstitial(seat, () => {
        viewerSeat = seat;
        hidePassInterstitial();
        advanceCallState();
      });
      return;
    }
    if (mode === "hotseat") viewerSeat = seat;
    el("turnActions").hidden = true;
    renderAll();
    renderCallControls(seat, callState.perSeat[seat]);
  }

  function renderCallControls(seat, opt) {
    const box = el("callActions");
    box.innerHTML = "";
    box.hidden = false;

    const panel = document.createElement("div");
    panel.className = "call-panel";
    const label = document.createElement("span");
    label.className = "call-panel-seat";
    label.textContent = seatDisplayName(seat) + ":";
    panel.appendChild(label);

    if (opt.ron) panel.appendChild(makeCallButton("Ron", () => submitCallDecision(seat, "ron")));
    if (opt.pon) panel.appendChild(makeCallButton("Pon", () => submitCallDecision(seat, "pon")));
    if (opt.kanOptions) panel.appendChild(makeCallButton("Kan", () => submitCallDecision(seat, "kan")));

    if (opt.chiOptions && opt.chiOptions.length === 1) {
      panel.appendChild(makeCallButton("Chi", () => submitCallDecision(seat, "chi", opt.chiOptions[0])));
    } else if (opt.chiOptions && opt.chiOptions.length > 1) {
      const chooser = document.createElement("div");
      chooser.className = "chi-chooser";
      opt.chiOptions.forEach((combo) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chi-combo";
        btn.title = "Chi with " + combo.map(tileName).join(" + ");
        combo.forEach((k) => btn.appendChild(makeMiniTile(k)));
        btn.addEventListener("click", () => submitCallDecision(seat, "chi", combo));
        chooser.appendChild(btn);
      });
      panel.appendChild(chooser);
    }

    panel.appendChild(makeCallButton("Pass", () => submitCallDecision(seat, "pass")));
    box.appendChild(panel);
  }

  function makeCallButton(text, handler) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-action";
    btn.textContent = text;
    btn.addEventListener("click", handler);
    return btn;
  }

  function submitCallDecision(seat, action, chiTiles) {
    callState.decisions[seat] = action;
    if (action === "chi" && chiTiles) callState.decisions.chiTiles = chiTiles;
    if (action !== "pass") log(seatDisplayName(seat) + " calls " + capitalize(action) + (chiTiles ? " (" + chiTiles.map(tileName).join(",") + ")" : ""));
    callState.pendingHuman.shift();
    el("callActions").hidden = true;
    advanceCallState();
  }

  function finalizeCallState() {
    const decisions = callState.decisions;
    callState = null;
    el("callActions").hidden = true;
    const result = safeCall(() => MJ.game.resolveCalls(game, decisions));
    if (result) lastHandResult = result;
    tick();
  }

  // ---------------------------------------------------------------- ai turn policy

  function pickAiDiscard(opts, seat) {
    if (window.MJ && MJ.ai && typeof MJ.ai.chooseDiscard === "function") {
      const kind = safeCall(() => MJ.ai.chooseDiscard(game, seat));
      if (kind != null) return kind;
    }
    if (Array.isArray(opts.discardOptions) && opts.discardOptions.length) return opts.discardOptions[0];
    const seatState = game.state.seats[seat];
    if (seatState.drawnTile != null) return seatState.drawnTile;
    for (let k = 0; k < seatState.concealed.length; k++) if (seatState.concealed[k] > 0) return k;
    return 0;
  }

  function decideAiTurnAction(seat) {
    const opts = safeCall(() => MJ.game.getTurnOptions(game)) || {};
    if (opts.canTsumo) {
      const result = safeCall(() => MJ.game.declareTsumo(game, seat));
      log(seatDisplayName(seat) + " wins by Tsumo!");
      if (result) lastHandResult = result;
      tick();
      return;
    }

    let action = null;
    if (window.MJ && MJ.ai && typeof MJ.ai.chooseTurnAction === "function") {
      action = safeCall(() => MJ.ai.chooseTurnAction(game, seat, opts));
    }

    if (action && action.type === "kan") {
      performKan(seat, action.kind, action.kanType);
      return;
    }

    const declareRiichi = !!(action && action.declareRiichi);
    const pick = action && action.kind != null ? action.kind : pickAiDiscard(opts, seat);
    safeCall(() => MJ.game.discard(game, seat, pick, { declareRiichi }));
    log(seatDisplayName(seat) + " discards " + tileName(pick) + (declareRiichi ? " and declares Riichi" : ""));
    tick();
  }

  // ---------------------------------------------------------------- controller / tick

  function tick() {
    if (!game || !game.state) return;
    const phase = game.state.phase;
    if (phase === "game-over") { showGameOver(); return; }
    if (phase === "hand-over") { showHandResult(); return; }
    if (phase === "draw") { handleDrawPhase(); return; }
    if (phase === "awaiting-turn-action") { handleTurnActionPhase(); return; }
    if (phase === "awaiting-calls") { handleCallsPhase(); return; }
    renderAll();
    log('Unrecognized game phase "' + phase + '" - stopping automatic play here.');
  }

  function handleDrawPhase() {
    const seat = game.state.turnSeat;
    if (needsInterstitial(seat)) {
      showPassInterstitial(seat, () => { viewerSeat = seat; hidePassInterstitial(); tick(); });
      return;
    }
    hideActionPanels();
    if (isAiSeat(seat)) {
      renderAll();
      setTimeout(() => { safeCall(() => MJ.game.drawTile(game)); tick(); }, AI_DELAY_MS);
      return;
    }
    safeCall(() => MJ.game.drawTile(game));
    tick();
  }

  function handleTurnActionPhase() {
    const seat = game.state.turnSeat;
    if (needsInterstitial(seat)) {
      showPassInterstitial(seat, () => { viewerSeat = seat; hidePassInterstitial(); tick(); });
      return;
    }
    if (isAiSeat(seat)) {
      hideActionPanels();
      renderAll();
      setTimeout(() => decideAiTurnAction(seat), AI_DELAY_MS);
      return;
    }
    renderTurnControls(seat);
  }

  // ---------------------------------------------------------------- hand-end modals

  function normalizeWinners(result) {
    if (Array.isArray(result.winners)) return result.winners;
    if (result.winner != null) return [result.winner];
    return [];
  }

  function looksLikeDraw(result) {
    if (result.type === "draw" || result.type === "exhaustive-draw" || result.isDraw) return true;
    return normalizeWinners(result).length === 0;
  }

  function showHandResult() {
    const result = lastHandResult || {};
    renderAll();
    if (looksLikeDraw(result)) {
      renderDrawModal(result);
      el("drawOverlay").hidden = false;
    } else {
      renderWinModal(result);
      el("resultOverlay").hidden = false;
    }
  }

  function renderWinModal(result) {
    const winners = normalizeWinners(result);
    const winType = result.winType || (typeof result.type === "string" && result.type !== "win" ? result.type : "") || (result.tsumo ? "tsumo" : winners.length ? "ron" : "");
    const seatOf = (w) => (w && typeof w === "object" ? w.seat : w);
    const names = winners.map((w) => seatDisplayName(seatOf(w))).join(" & ");
    el("resultTitle").textContent = (names || "Hand result") + (winType ? " wins by " + capitalize(winType) : "");

    const yakuBox = el("resultYaku");
    yakuBox.innerHTML = "";
    const primary = winners[0] && typeof winners[0] === "object" ? winners[0] : null;
    const yakuList = result.yaku || result.patterns || (primary && (primary.yaku || primary.patterns)) || [];
    yakuList.forEach((y) => {
      const row = document.createElement("div");
      row.className = "yaku-row";
      const name = (y && (y.name || y.yaku)) || String(y);
      const value = y && y.han != null ? y.han + " han" : y && y.doubles != null ? y.doubles + " doubles" : (y && y.value) || "";
      row.innerHTML = "<span>" + escapeHtml(name) + "</span><span>" + escapeHtml(String(value)) + "</span>";
      yakuBox.appendChild(row);
    });

    const points = result.points ?? result.totalScore ?? result.score ?? (primary && (primary.points ?? primary.totalScore));
    const han = result.han ?? (primary && primary.han);
    const fu = result.fu ?? (primary && primary.fu);
    let summary = points != null ? points + " points" : "";
    if (han != null) summary = han + " han" + (fu != null ? ", " + fu + " fu" : "") + (summary ? " – " + summary : "");
    el("resultPoints").textContent = summary;

    renderScoreChanges(result);
  }

  function renderScoreChanges(result) {
    const box = el("resultScoreChanges");
    box.innerHTML = "";
    const explicit = result.scoreChanges || result.deltas;
    for (let i = 0; i < 4; i++) {
      const current = game.state.seats[i].score;
      let delta = explicit ? explicit[i] : undefined;
      if (delta == null) delta = current - scoresAtHandStart[i];
      const row = document.createElement("div");
      row.className = "score-row";
      const sign = delta > 0 ? "+" : "";
      const cls = delta > 0 ? "positive" : delta < 0 ? "negative" : "";
      row.innerHTML = "<span>" + escapeHtml(seatDisplayName(i)) + "</span>" +
        '<span>' + current + ' <span class="score-delta ' + cls + '">(' + sign + delta + ")</span></span>";
      box.appendChild(row);
    }
  }

  function renderDrawModal(result) {
    const list = el("drawTenpaiList");
    list.innerHTML = "";
    const tenpaiSeats = result.tenpaiSeats || result.tenpai || null;
    for (let i = 0; i < 4; i++) {
      const isTenpai = Array.isArray(tenpaiSeats) ? tenpaiSeats.includes(i) : null;
      const row = document.createElement("div");
      row.className = "tenpai-row" + (isTenpai == null ? "" : isTenpai ? " is-tenpai" : " is-noten");
      const status = isTenpai == null ? "–" : isTenpai ? "Tenpai" : "Noten";
      row.innerHTML = "<span>" + escapeHtml(seatDisplayName(i)) + "</span><span>" + status + "</span>";
      list.appendChild(row);
    }
  }

  el("btnContinueHand").addEventListener("click", () => { el("resultOverlay").hidden = true; proceedAfterHand(); });
  el("btnContinueDraw").addEventListener("click", () => { el("drawOverlay").hidden = true; proceedAfterHand(); });

  function proceedAfterHand() {
    lastHandResult = null;
    if (game.state.phase === "game-over") { tick(); return; }
    safeCall(() => MJ.game.startHand(game));
    scoresAtHandStart = game.state.seats.map((s) => s.score);
    tick();
  }

  function showGameOver() {
    el("screen-table").hidden = true;
    el("screen-start").hidden = true;
    el("screen-gameover").hidden = false;
    const box = el("finalStandings");
    box.innerHTML = "";
    const ranked = game.state.seats.map((s, i) => ({ i, score: s.score })).sort((a, b) => b.score - a.score);
    ranked.forEach((r, rank) => {
      const row = document.createElement("div");
      row.className = "standing-row";
      row.innerHTML = '<span class="standing-rank">' + (rank + 1) + "</span>" +
        '<span class="standing-name">' + escapeHtml(seatDisplayName(r.i)) + "</span>" +
        '<span class="standing-score">' + r.score + "</span>";
      box.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- hot-seat interstitial

  function showPassInterstitial(seat, onReady) {
    el("passDeviceTitle").textContent = "Pass the device to " + seatDisplayName(seat);
    el("passDeviceOverlay").hidden = false;
    passReadyHandler = onReady;
  }

  function hidePassInterstitial() {
    el("passDeviceOverlay").hidden = true;
    passReadyHandler = null;
  }

  el("btnPassReady").addEventListener("click", () => {
    const handler = passReadyHandler;
    hidePassInterstitial();
    if (handler) handler();
  });

  // ---------------------------------------------------------------- start / restart

  function buildPlayersConfig() {
    // The players[] shape isn't pinned down by the contract; a {type} tag per seat
    // is the most direct reading of "You vs 3 AI" vs hot-seat, and costs nothing if
    // game.js ends up deriving seat control some other way instead.
    return [0, 1, 2, 3].map((i) => ({ type: humanSeats.includes(i) ? "human" : "ai" }));
  }

  function startGame() {
    if (!engineAvailable()) {
      el("engineWarning").hidden = false;
      return;
    }
    ruleset = document.querySelector('input[name="ruleset"]:checked').value;
    mode = document.querySelector('input[name="mode"]:checked').value;
    humanSeats = mode === "hotseat" ? [0, 1, 2, 3] : [0];
    viewerSeat = 0;
    riichiArmed = false;
    currentTurnOptions = null;
    callState = null;
    lastHandResult = null;
    el("eventLog").innerHTML = "";

    game = safeCall(() => MJ.game.createGame({
      ruleset,
      players: buildPlayersConfig(),
      startingScore: 25000,
      roundLimit: 8,
    }));
    if (!game) {
      log("Failed to create game - see console for details.");
      return;
    }
    safeCall(() => MJ.game.startHand(game));
    scoresAtHandStart = game.state.seats.map((s) => s.score);

    el("screen-start").hidden = true;
    el("screen-gameover").hidden = true;
    el("screen-table").hidden = false;
    log("New " + (ruleset === "riichi" ? "Riichi" : "Classical") + " game started (" + (mode === "hotseat" ? "hot-seat" : "vs AI") + ").");
    tick();
  }

  el("btnStartGame").addEventListener("click", startGame);

  el("btnBackToStart").addEventListener("click", () => {
    game = null;
    hidePassInterstitial();
    el("resultOverlay").hidden = true;
    el("drawOverlay").hidden = true;
    el("screen-gameover").hidden = true;
    el("screen-start").hidden = false;
  });

  // ---------------------------------------------------------------- init

  if (!engineAvailable()) el("engineWarning").hidden = false;
})();
