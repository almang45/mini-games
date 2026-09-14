// Hearts table binding: turns HEARTS engine state into what app.js needs to
// render a table and react to clicks. Browser-only (DOM + engine globals).
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const HEARTS = root.HEARTS;
  const DOM = root.DOM;

  let passSelection = [];

  function autoSubmitAIPasses(state) {
    if (state.round.phase !== "passing") return;
    state.seats.forEach((seat, i) => {
      if (seat.type === "ai" && !state.round.passSelections[i]) {
        HEARTS.setPassSelection(state, i, HEARTS.aiChoosePass(state.round.hands[i]));
      }
    });
  }

  function create(seatTypes) {
    const state = HEARTS.createGame(seatTypes);
    passSelection = [];
    autoSubmitAIPasses(state);
    return state;
  }

  function actingSeat(state) {
    if (state.gameOver || state.round.phase === "round-end") return null;
    if (state.round.phase === "passing") {
      const idx = state.seats.findIndex((s, i) => s.type === "human" && !state.round.passSelections[i]);
      return idx === -1 ? null : idx;
    }
    return state.round.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.round.phase === "round-end"; }
  function handOf(state, seat) { return state.round.hands[seat]; }

  function stepAI(state, seat) {
    const card = HEARTS.aiChoosePlay(state, seat);
    HEARTS.playCard(state, seat, card);
  }

  function onCardClick(state, seat, card) {
    if (state.round.phase === "passing") {
      const i = passSelection.findIndex((c) => c.id === card.id);
      if (i !== -1) passSelection.splice(i, 1);
      else if (passSelection.length < 3) passSelection.push(card);
      return;
    }
    const legal = HEARTS.getLegalPlays(state, seat);
    if (legal.some((c) => c.id === card.id)) {
      HEARTS.playCard(state, seat, card);
      passSelection = [];
    }
  }

  function isCardSelected(state, seat, card) {
    return state.round.phase === "passing" && passSelection.some((c) => c.id === card.id);
  }

  function isCardDisabled(state, seat, card) {
    if (state.round.phase === "passing") return passSelection.length >= 3 && !isCardSelected(state, seat, card);
    return !HEARTS.getLegalPlays(state, seat).some((c) => c.id === card.id);
  }

  function actionButtons(state, seat) {
    if (state.round.phase === "round-end") {
      return [{
        label: "Deal Next Round", primary: true,
        onClick: () => { HEARTS.startRound(state); autoSubmitAIPasses(state); },
      }];
    }
    if (state.round.phase === "passing" && state.seats[seat].type === "human") {
      const dir = state.round.passDirection;
      return [{
        label: "Pass 3 Cards (" + dir + ")", primary: true, disabled: passSelection.length !== 3,
        onClick: () => { HEARTS.setPassSelection(state, seat, passSelection); passSelection = []; },
      }];
    }
    return [];
  }

  function centerNode(state) {
    // Anchored on the leader, not the viewer: stable-ish placement while the trick is live.
    const wrap = DOM.trickArea(state.round.currentTrick, state.round.leaderSeat, state.seats.length);
    if (state.round.currentTrick.length === 0) {
      wrap.appendChild(DOM.el("div", "center-label", "Trick " + state.round.trickNumber));
    }
    return wrap;
  }

  function statusLine(state) {
    const r = state.round;
    if (r.phase === "passing") return "Choose 3 cards to pass " + r.passDirection + ".";
    if (r.phase === "round-end" || r.phase === "game-end") return "Round complete.";
    return "Trick " + r.trickNumber + " - " + (r.heartsBroken ? "hearts broken" : "hearts not broken yet");
  }

  function seatTag(state, seat) {
    return String(state.scores[seat]) + " pts";
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: state.scores[i] + " pts", score: state.scores[i] }))
      .sort((a, b) => a.score - b.score);
  }

  root.HEARTS_UI = {
    key: "hearts", label: "Hearts", seatMin: 4, seatMax: 4, seatFixed: true,
    tagline: "Avoid points. Dodge the Queen of Spades. Or take every trick and shoot the moon.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
