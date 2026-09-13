// President table binding.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const PRES = root.PRESIDENT;
  const DOM = root.DOM;

  let selection = [];

  function create(seatTypes) {
    selection = [];
    return PRES.createGame(seatTypes);
  }

  function actingSeat(state) { return state.gameOver ? null : state.turnSeat; }
  function isInterim() { return false; }
  function handOf(state, seat) { return state.hands[seat]; }

  function stepAI(state, seat) {
    const combo = PRES.aiChoosePlay(state, seat);
    if (combo) PRES.playCards(state, seat, combo);
    else PRES.passSeat(state, seat);
  }

  function onCardClick(state, seat, card) {
    const i = selection.findIndex((c) => c.id === card.id);
    if (i !== -1) { selection.splice(i, 1); return; }
    if (selection.length > 0 && selection[0].rank !== card.rank) selection = [];
    selection.push(card);
  }

  function isCardSelected(state, seat, card) { return selection.some((c) => c.id === card.id); }
  function isCardDisabled() { return false; } // any of your own cards may be toggled into a selection

  function actionButtons(state, seat) {
    const buttons = [];
    const legal = selection.length > 0 && PRES.isLegalSelection(state, seat, selection);
    buttons.push({
      label: "Play Selected", primary: true, disabled: !legal,
      onClick: () => { PRES.playCards(state, seat, selection); selection = []; },
    });
    if (state.pile.length > 0) {
      buttons.push({ label: "Pass", onClick: () => { PRES.passSeat(state, seat); selection = []; } });
    }
    return buttons;
  }

  function centerNode(state) {
    if (state.pile.length === 0) {
      return DOM.el("div", "center-label", "Table is clear - lead any cards of one rank");
    }
    return DOM.el("div", "pile-area", state.pile.map((c) => DOM.cardEl(c, {})));
  }

  function statusLine(state) {
    if (state.pile.length === 0) return state.seats[state.turnSeat].name + " leads.";
    return "To beat: " + state.pile.length + " x " + CARDS.rankLabel(state.pile[0].rank) + " or higher.";
  }

  function seatTag(state, seat) {
    const place = state.finishOrder.indexOf(seat);
    if (place !== -1) return "#" + (place + 1) + " place";
    return state.hands[seat].length + " cards";
  }

  function standings(state) {
    const order = state.finishOrder.length === state.seats.length
      ? state.finishOrder
      : state.finishOrder.concat(state.seats.map((_, i) => i).filter((i) => !state.finishOrder.includes(i)));
    return order.map((seat, place) => ({ name: state.seats[seat].name, detail: "#" + (place + 1), score: place }));
  }

  root.PRESIDENT_UI = {
    key: "president", label: "President", seatMin: 3, seatMax: 4, seatFixed: false,
    tagline: "Shed your cards first. Beat the pile with a higher same-size set, or pass.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
