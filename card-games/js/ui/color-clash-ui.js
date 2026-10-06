// Color Clash table binding. Click a matching card to play it; a Wild then
// asks for a colour through the action bar (the engine's "color" phase), and
// a Wild Draw Four gives the next seat Challenge / Draw 4 buttons.
(function (root) {
  "use strict";
  const CC = root.COLOR_CLASH;
  const DOM = root.DOM;

  const GLYPH = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "W", wild4: "+4" };
  const COLOR_ORDER = { R: 0, Y: 1, G: 2, B: 3 };

  function create(seatTypes) {
    const state = CC.createGame(seatTypes);
    CC.dealHand(state);
    return state;
  }

  function actingSeat(state) { return CC.actingSeat(state); }
  function isInterim(state) { return !state.gameOver && state.phase === "hand-over"; }
  function stepAI(state, seat) { CC.stepAI(state, seat); }

  // Grouped by colour, wilds last, so a match is easy to find.
  function handOf(state, seat) {
    const rank = (c) => (c.color ? COLOR_ORDER[c.color] : 4) * 100 + (c.kind === "number" ? c.value : 20 + ["skip", "reverse", "draw2", "wild", "wild4"].indexOf(c.kind));
    return state.hands[seat].slice().sort((a, b) => rank(a) - rank(b));
  }

  function renderFace(card, face) {
    face.classList.add("cc-card", card.color ? "cc-" + card.color : "cc-wild");
    face.title = CC.cardLabel(card);
    const glyph = card.kind === "number" ? String(card.value) : GLYPH[card.kind];
    face.appendChild(DOM.el("div", "cc-corner", glyph));
    face.appendChild(DOM.el("div", "cc-oval", DOM.el("span", "cc-value", glyph)));
  }

  function onCardClick(state, seat, card) {
    if (!CC.legalPlays(state, seat).some((c) => c.id === card.id)) return;
    CC.playCard(state, seat, card.id);
  }

  function isCardSelected(state, seat, card) { return state.phase === "drawn" && state.drawn && state.drawn.id === card.id; }
  function isCardDisabled(state, seat, card) { return !CC.legalPlays(state, seat).some((c) => c.id === card.id); }

  function cardTag(state, seat, card) { return state.phase === "drawn" && state.drawn && state.drawn.id === card.id ? "NEW" : null; }

  function actionButtons(state, seat) {
    if (!state.gameOver && state.phase === "hand-over") {
      return [{ label: "Deal Next Hand", primary: true, onClick: () => CC.dealHand(state) }];
    }
    if (CC.actingSeat(state) !== seat) return [];
    if (state.phase === "color") {
      return CC.COLORS.map((color) => ({ label: CC.COLOR_NAME[color], primary: true, onClick: () => CC.chooseColor(state, seat, color) }));
    }
    if (state.phase === "challenge") {
      return [
        { label: "Draw 4", primary: true, onClick: () => CC.respondToWild4(state, seat, false) },
        { label: "Challenge", onClick: () => CC.respondToWild4(state, seat, true) },
      ];
    }
    if (state.phase === "drawn") {
      return [
        { label: "Play " + CC.cardLabel(state.drawn), primary: true, onClick: () => CC.playCard(state, seat, state.drawn.id) },
        { label: "Keep", onClick: () => CC.keepDrawn(state, seat) },
      ];
    }
    return [{ label: "Draw Card", onClick: () => CC.draw(state, seat) }];
  }

  function centerNode(state) {
    const top = CC.topCard(state);
    const discard = top ? DOM.cardEl(top, { renderFace }) : DOM.el("div", "card card-slot");
    const colorChip = state.color
      ? DOM.el("div", "cc-current cc-" + state.color, CC.COLOR_NAME[state.color])
      : DOM.el("div", "cc-current", "Choosing...");
    const arrow = state.direction === 1 ? "↻ clockwise" : "↺ counter-clockwise";
    return DOM.el("div", "deck-center", [
      DOM.el("div", "center-label", "Hand " + state.handNo + " · first to " + CC.TARGET),
      DOM.el("div", "pile-row", [
        DOM.el("div", "pile-col", [DOM.cardEl(null, { faceDown: true }), DOM.el("div", "pile-caption", "Draw " + state.drawPile.length)]),
        DOM.el("div", "pile-col", [discard, colorChip]),
      ]),
      DOM.el("div", "pile-caption", arrow),
    ]);
  }

  function statusLine(state) {
    if (state.gameOver) return state.seats[state.winner].name + " wins - final scores below.";
    if (state.phase === "hand-over") return state.seats[state.handWinner].name + " went out - deal the next hand when ready.";
    const seat = CC.actingSeat(state);
    const name = state.seats[seat].name;
    if (state.phase === "color") return name + ": pick a colour.";
    if (state.phase === "challenge") return name + ": take the Wild Draw Four, or challenge it.";
    if (state.phase === "drawn") return name + ": play the card you drew, or keep it.";
    const top = CC.topCard(state);
    return name + " to play on " + (top.color ? CC.cardLabel(top) : CC.cardLabel(top) + " (" + CC.COLOR_NAME[state.color] + ")") + ".";
  }

  function seatTag(state, seat) {
    const left = state.hands[seat].length;
    const cards = left === 1 && state.phase !== "hand-over" ? "1 card!" : left + " cards";
    return cards + " | " + state.seats[seat].score;
  }

  function standings(state) {
    return state.seats
      .map((s) => ({ name: s.name, detail: s.score + " pts", score: -s.score }))
      .sort((a, b) => a.score - b.score);
  }

  root.COLOR_CLASH_UI = {
    key: "color-clash", label: "Color Clash", seatMin: 2, seatMax: 4, seatFixed: false,
    tagline: "Match colour or symbol, hit the next player with Skips, Reverses and Draw Twos, and call out a bluffed Wild Draw Four. First to 500.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons, cardTag, renderFace,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
