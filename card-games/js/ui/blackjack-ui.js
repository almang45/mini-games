// Blackjack table binding. The dealer isn't a seat - it's rendered in the
// felt center via centerNode, hole card face-down until the round resolves.
// No card clicking - all decisions go through the action bar.
(function (root) {
  "use strict";
  const BJ = root.BLACKJACK;
  const DOM = root.DOM;

  function create(seatTypes) {
    const state = BJ.createGame(seatTypes);
    BJ.dealRound(state); // matches Hearts/President: the table is ready to play as soon as it's created
    return state;
  }

  function actingSeat(state) { return state.gameOver || state.phase !== "playing" ? null : state.turnSeat; }
  function isInterim(state) { return !state.gameOver && state.phase === "round-over"; }
  function handOf(state, seat) { return state.hands[seat].cards; }

  function stepAI(state, seat) { BJ.stepAI(state, seat); }

  function onCardClick() {} // no card selection in blackjack
  function isCardSelected() { return false; }
  function isCardDisabled() { return true; }

  function actionButtons(state, seat) {
    if (!state.gameOver && state.phase === "round-over") {
      return [{ label: "Deal Next Round", primary: true, onClick: () => BJ.dealRound(state) }];
    }
    if (state.phase !== "playing" || state.turnSeat !== seat) return [];
    const h = state.hands[seat];
    const buttons = [
      { label: "Hit", primary: true, onClick: () => BJ.hit(state, seat) },
      { label: "Stand", onClick: () => BJ.stand(state, seat) },
    ];
    if (h.cards.length === 2 && state.seats[seat].chips >= h.bet * 2) {
      buttons.push({ label: "Double Down", onClick: () => BJ.doubleDown(state, seat) });
    }
    return buttons;
  }

  function centerNode(state) {
    const cards = state.dealerHand.map((c, i) =>
      (i === 1 && !state.dealerRevealed) ? DOM.cardEl(null, { faceDown: true }) : DOM.cardEl(c, {}));
    const label = state.dealerHand.length === 0 ? "Dealer" :
      "Dealer" + (state.dealerRevealed ? " (" + BJ.handValue(state.dealerHand).total + ")" : "");
    return DOM.el("div", null, [
      DOM.el("div", "center-label", label),
      DOM.el("div", "pile-area", cards),
    ]);
  }

  function statusLine(state) {
    if (state.gameOver) return "Session complete - final chip standings below.";
    if (state.phase === "round-over") return "Round " + state.round + " settled - deal the next round when ready.";
    if (state.turnSeat == null) return "Dealer is playing...";
    return state.seats[state.turnSeat].name + " to act on " + BJ.handValue(state.hands[state.turnSeat].cards).total + ".";
  }

  function seatTag(state, seat) {
    const h = state.hands[seat];
    if (h.status === "sitout") return "Out of chips";
    let label;
    if (h.status === "blackjack") label = "Blackjack!";
    else {
      const v = BJ.handValue(h.cards).total;
      label = String(v) + (h.doubled ? " (doubled)" : "") + (h.status === "bust" ? " - bust" : h.status === "stood" ? " - stood" : "");
    }
    if (h.result) label += " (" + (h.net >= 0 ? "+" : "") + h.net + ")";
    return label + " | " + state.seats[seat].chips + " chips";
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: s.chips + " chips", score: -s.chips }))
      .sort((a, b) => a.score - b.score);
  }

  root.BLACKJACK_UI = {
    key: "blackjack", label: "Blackjack", seatMin: 1, seatMax: 4, seatFixed: false,
    tagline: "Hit, stand, or double against the dealer over 15 rounds. Closest to 21 without going over wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
