// Cribbage table binding. Pick two cards and send them to the crib, then
// click cards to peg; there is no Go button because the engine plays it out.
(function (root) {
  "use strict";
  const CRIBBAGE = root.CRIBBAGE;
  const DOM = root.DOM;

  let selected = []; // card ids the discarding seat has picked for the crib

  function create(seatTypes) {
    selected = [];
    return CRIBBAGE.createGame(seatTypes);
  }

  function actingSeat(state) {
    const phase = state.hand.phase;
    return phase === "discard" || phase === "pegging" ? state.hand.turnSeat : null;
  }

  function isInterim(state) { return !state.gameOver && state.hand.phase === "hand-end"; }

  function handOf(state, seat) {
    const h = state.hand;
    return h.pegHands && !h.show ? h.pegHands[seat] : h.hands[seat];
  }

  function stepAI(state, seat) {
    if (state.hand.phase === "discard") CRIBBAGE.discard(state, seat, CRIBBAGE.aiChooseDiscard(state, seat));
    else CRIBBAGE.peg(state, seat, CRIBBAGE.aiChoosePeg(state, seat));
  }

  function isLegalPeg(state, seat, card) {
    return CRIBBAGE.legalPegs(state, seat).some((c) => c.id === card.id);
  }

  function onCardClick(state, seat, card) {
    const phase = state.hand.phase;
    if (phase === "pegging" && isLegalPeg(state, seat, card)) {
      CRIBBAGE.peg(state, seat, card);
    } else if (phase === "discard") {
      if (selected.includes(card.id)) selected = selected.filter((id) => id !== card.id);
      else if (selected.length < 2) selected.push(card.id);
    }
  }

  function isCardSelected(state, seat, card) { return state.hand.phase === "discard" && selected.includes(card.id); }
  function isCardDisabled(state, seat, card) { return state.hand.phase === "pegging" && !isLegalPeg(state, seat, card); }

  function actionButtons(state, seat) {
    const h = state.hand;
    if (h.phase === "hand-end") {
      return [{ label: "Deal Next Hand", primary: true, onClick: () => { CRIBBAGE.startHand(state); selected = []; } }];
    }
    if (h.phase !== "discard" || h.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    return [{
      label: "Send to Crib (" + selected.length + "/2)", primary: true, disabled: selected.length !== 2,
      onClick: () => {
        CRIBBAGE.discard(state, seat, h.hands[seat].filter((c) => selected.includes(c.id)));
        selected = [];
      },
    }];
  }

  function cardRow(cards) {
    return DOM.el("div", "row-cards", cards.map((c) => DOM.cardEl(c, { small: true })));
  }

  function showEntry(state, entry) {
    const detail = !entry.counted ? "not counted, game over"
      : entry.items.length ? entry.items.map((x) => x.label + " " + x.points).join(", ") : "no points";
    return DOM.el("div", "showdown-seat", [
      DOM.el("div", "showdown-seat-name", state.seats[entry.seat].name + " " + entry.label + " · " + entry.points),
      cardRow(entry.cards),
      DOM.el("div", "row-label", detail),
    ]);
  }

  function centerNode(state) {
    const h = state.hand;
    if (h.phase === "discard") {
      return DOM.el("div", null, [
        DOM.el("div", "pile-area", DOM.cardEl(null, { faceDown: true })),
        DOM.el("div", "row-label", "Lay away 2 cards to " + state.seats[state.dealerSeat].name + "'s crib"),
      ]);
    }
    const starter = DOM.el("div", null, [DOM.el("div", "row-label", "Starter"), cardRow([h.starter])]);
    if (h.show) return DOM.el("div", null, [starter, DOM.el("div", "showdown-grid showdown-compact", h.show.map((e) => showEntry(state, e)))]);
    return DOM.el("div", null, [starter, DOM.el("div", "row-label", "Count " + h.count), cardRow(h.run.map((p) => p.card))]);
  }

  function statusLine(state) {
    const h = state.hand;
    const head = "Hand " + state.handNumber + " - " + state.seats[state.dealerSeat].name + " deals - first to " + CRIBBAGE.WIN_SCORE;
    if (state.gameOver) return head + " - game over";
    if (h.phase === "discard") return head + " - " + state.seats[h.turnSeat].name + " lays away 2";
    if (h.phase === "pegging") return head + " - pegging, count " + h.count;
    return head + " - the show";
  }

  function seatTag(state, seat) {
    return state.scores[seat] + " pts" + (seat === state.dealerSeat ? " · dealer" : "");
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: state.scores[i] + " pts" + (state.winner === i ? " (won)" : ""), score: -state.scores[i] }))
      .sort((a, b) => a.score - b.score);
  }

  root.CRIBBAGE_UI = {
    key: "cribbage", label: "Cribbage", seatMin: 2, seatMax: 2, seatFixed: false,
    tagline: "Lay two cards away to the crib, peg to 31, then count fifteens, pairs and runs. First to 121 wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
