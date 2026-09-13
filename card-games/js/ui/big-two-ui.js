// Big Two table binding - mirrors president-ui.js (same multi-select /
// Play-Selected / Pass interaction), swapping in the richer combo rules.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const BIG_TWO = root.BIG_TWO;
  const DOM = root.DOM;

  let selection = [];

  function create(seatTypes) {
    selection = [];
    return BIG_TWO.createGame(seatTypes);
  }

  function actingSeat(state) { return state.gameOver ? null : state.turnSeat; }
  function isInterim() { return false; }
  function handOf(state, seat) { return state.hands[seat]; }

  function stepAI(state, seat) {
    const combo = BIG_TWO.aiChoosePlay(state, seat);
    if (combo) BIG_TWO.playCards(state, seat, combo);
    else BIG_TWO.passSeat(state, seat);
  }

  function onCardClick(state, seat, card) {
    const i = selection.findIndex((c) => c.id === card.id);
    if (i !== -1) { selection.splice(i, 1); return; }
    selection.push(card);
  }

  function isCardSelected(state, seat, card) { return selection.some((c) => c.id === card.id); }
  function isCardDisabled() { return false; }

  function actionButtons(state, seat) {
    const buttons = [];
    const legal = selection.length > 0 && BIG_TWO.isLegalSelection(state, seat, selection);
    buttons.push({
      label: "Play Selected", primary: true, disabled: !legal,
      onClick: () => { BIG_TWO.playCards(state, seat, selection); selection = []; },
    });
    if (state.pile.length > 0) {
      buttons.push({ label: "Pass", onClick: () => { BIG_TWO.passSeat(state, seat); selection = []; } });
    }
    return buttons;
  }

  const CATEGORY_NAME = { 2: "Straight", 3: "Flush", 4: "Full House", 5: "Four of a Kind", 6: "Straight Flush" };
  function pileDescription(state) {
    if (!state.pileCombo) return "";
    if (state.pileCombo.size !== 5) return "";
    const category = Math.floor(state.pileCombo.strength / 1000);
    return " (" + CATEGORY_NAME[category] + ")";
  }

  function centerNode(state) {
    if (state.pile.length === 0) {
      return DOM.el("div", "center-label", "Table is clear - lead 1, 2, 3, or 5 cards of one shape");
    }
    return DOM.el("div", "pile-area", state.pile.map((c) => DOM.cardEl(c, {})));
  }

  function statusLine(state) {
    if (state.pile.length === 0) return state.seats[state.turnSeat].name + " leads.";
    return "To beat: " + state.pile.length + " card" + (state.pile.length > 1 ? "s" : "") + pileDescription(state) + ".";
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

  root.BIG_TWO_UI = {
    key: "big-two", label: "Big Two", seatMin: 4, seatMax: 4, seatFixed: true,
    tagline: "Shed your cards first. Beat the pile with a higher same-shape play - singles, pairs, triples, or 5-card poker hands.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
