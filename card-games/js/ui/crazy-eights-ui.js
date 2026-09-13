// Crazy Eights table binding.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const CE = root.CRAZY_EIGHTS;
  const DOM = root.DOM;

  function create(seatTypes) { return CE.createGame(seatTypes); }
  function actingSeat(state) { return state.gameOver ? null : state.turnSeat; }
  function isInterim() { return false; }
  function handOf(state, seat) { return state.hands[seat]; }

  function stepAI(state, seat) {
    let legal = CE.getLegalPlays(state, seat);
    if (legal.length === 0 && !state.pendingDraw) {
      CE.drawCard(state, seat);
      legal = CE.getLegalPlays(state, seat);
    }
    if (legal.length > 0) {
      const { card, declaredSuit } = CE.aiChoosePlay(state, seat);
      CE.playCard(state, seat, card, declaredSuit);
    }
  }

  function onCardClick(state, seat, card, helpers) {
    const legal = CE.getLegalPlays(state, seat);
    if (!legal.some((c) => c.id === card.id)) return;
    if (card.rank === 8) {
      helpers.pickSuit((suit) => CE.playCard(state, seat, card, suit));
    } else {
      CE.playCard(state, seat, card);
    }
  }

  function isCardSelected() { return false; }
  function isCardDisabled(state, seat, card) {
    return !CE.getLegalPlays(state, seat).some((c) => c.id === card.id);
  }

  function actionButtons(state, seat) {
    if (state.pendingDraw && state.pendingDraw.seat === seat) {
      return [{ label: "Keep & Pass Turn", onClick: () => CE.passTurn(state, seat) }];
    }
    if (CE.canDraw(state, seat)) {
      return [{ label: "Draw Card", primary: true, onClick: () => CE.drawCard(state, seat) }];
    }
    return [];
  }

  function centerNode(state) {
    const wrap = DOM.el("div", "pile-area");
    wrap.appendChild(DOM.cardEl(null, { faceDown: true, title: state.drawPile.length + " left in draw pile" }));
    const label = DOM.el("div", "center-label", state.drawPile.length + " left");
    label.style.position = "static";
    const col = DOM.el("div", null, [wrap, label]);
    const discard = DOM.cardEl(CE.topCard(state), {});
    const row = DOM.el("div", "pile-area", [col, discard]);
    row.style.gap = "18px";
    return row;
  }

  function statusLine(state) {
    const suit = CARDS.suitName(CE.effectiveSuit(state));
    const top = CE.topCard(state);
    const wild = top.rank === 8 ? " (declared " + suit + ")" : "";
    return "Top card: " + CARDS.cardLabel(top) + wild + (state.pendingDraw ? " - drew a playable card" : "");
  }

  function seatTag(state, seat) { return state.hands[seat].length + " cards"; }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: i === state.winner ? "Winner!" : state.hands[i].length + " cards left", score: i === state.winner ? -1 : state.hands[i].length }))
      .sort((a, b) => a.score - b.score);
  }

  root.CE_UI = {
    key: "crazy-eights", label: "Crazy Eights", seatMin: 2, seatMax: 4, seatFixed: false,
    tagline: "Match suit or rank, dump your hand first. Play an 8 to change the suit.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
