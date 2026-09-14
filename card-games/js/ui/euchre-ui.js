// Euchre table binding. Calling trump runs through the action bar (Order Up /
// Pass, then Name a suit); the dealer's discard and every trick are card
// clicks. Bowers carry a badge because they play as a different suit.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const EUCHRE = root.EUCHRE;
  const DOM = root.DOM;

  function create(seatTypes) { return EUCHRE.createGame(seatTypes); }

  function actingSeat(state) {
    return state.gameOver || state.hand.phase === "hand-end" ? null : state.hand.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.hand.phase === "hand-end"; }
  function handOf(state, seat) { return state.hand.hands[seat]; }
  function stepAI(state, seat) { EUCHRE.aiStep(state, seat); }

  function isLegal(state, seat, card) {
    return EUCHRE.getLegalPlays(state, seat).some((c) => c.id === card.id);
  }

  function onCardClick(state, seat, card) {
    const h = state.hand;
    if (h.phase === "discard") EUCHRE.discard(state, seat, card);
    else if (h.phase === "playing" && isLegal(state, seat, card)) EUCHRE.playCard(state, seat, card);
  }

  function isCardSelected() { return false; }

  function isCardDisabled(state, seat, card) {
    return state.hand.phase === "playing" && !isLegal(state, seat, card);
  }

  function cardTag(state, seat, card) {
    const trump = state.hand.trump;
    if (!trump) return null;
    return EUCHRE.isRightBower(card, trump) ? "Right" : EUCHRE.isLeftBower(card, trump) ? "Left" : null;
  }

  function actionButtons(state, seat) {
    const h = state.hand;
    if (h.phase === "hand-end") {
      return [{ label: "Deal Next Hand", primary: true, onClick: () => EUCHRE.startHand(state) }];
    }
    if (h.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    if (h.phase === "order") {
      return [
        { label: (seat === state.dealerSeat ? "Pick Up " : "Order Up ") + CARDS.cardLabel(h.upcard), primary: true, onClick: () => EUCHRE.orderUp(state, seat) },
        { label: "Pass", onClick: () => EUCHRE.pass(state, seat) },
      ];
    }
    if (h.phase === "name") {
      const buttons = CARDS.SUITS.filter((s) => s !== h.upcard.suit)
        .map((s) => ({ label: "Name " + CARDS.suitName(s), onClick: () => EUCHRE.nameTrump(state, seat, s) }));
      if (seat !== state.dealerSeat) buttons.push({ label: "Pass", onClick: () => EUCHRE.pass(state, seat) });
      return buttons;
    }
    if (h.phase === "discard") return [{ label: "Click a card to discard", disabled: true, onClick: () => {} }];
    return [];
  }

  function upcardPanel(state) {
    const h = state.hand;
    const dealer = state.seats[state.dealerSeat].name;
    const caption = h.phase === "name" ? "Turned down - name another suit (" + dealer + " must)"
      : h.phase === "discard" ? CARDS.suitName(h.trump) + " are trump - " + dealer + " discards"
        : "Upcard - " + dealer + " deals";
    return DOM.el("div", null, [
      DOM.el("div", "pile-area", DOM.cardEl(h.upcard, { disabled: h.phase === "name" })),
      DOM.el("div", "row-label", caption),
    ]);
  }

  function handSummary(state) {
    const h = state.hand;
    const s = h.summary;
    const makers = EUCHRE.teamOf(h.maker);
    const rows = [0, 1].map((t) => DOM.el("tr", null, [
      DOM.el("td", null, "Team " + (t + 1) + (t === makers ? " (called " + CARDS.suitGlyph(h.trump) + ")" : "")),
      DOM.el("td", null, String(h.tricksWon[t] + h.tricksWon[t + 2])),
      DOM.el("td", null, t === s.team ? "+" + s.points : "0"),
      DOM.el("td", null, String(state.teamScores[t])),
    ]));
    const verdict = s.kind === "march" ? "March! The makers took all 5 tricks."
      : s.kind === "made" ? "The makers took " + s.tricks + " tricks." : "Euchred! The makers took only " + s.tricks + ".";
    return DOM.el("div", null, [
      DOM.el("table", "score-table", [
        DOM.el("thead", null, DOM.el("tr", null, ["Team", "Tricks", "Hand", "Total"].map((x) => DOM.el("th", null, x)))),
        DOM.el("tbody", null, rows),
      ]),
      DOM.el("div", "row-label", verdict),
    ]);
  }

  function centerNode(state, anchorSeat) {
    const h = state.hand;
    if (h.phase === "order" || h.phase === "name" || h.phase === "discard") return upcardPanel(state);
    if (h.phase === "hand-end" || h.phase === "game-end") return handSummary(state);
    const showLast = h.currentTrick.length === 0 && h.lastTrick;
    const wrap = DOM.trickArea(showLast ? h.lastTrick.plays : h.currentTrick, anchorSeat || 0, EUCHRE.SEATS);
    if (showLast) {
      wrap.classList.add("is-last-trick");
      wrap.appendChild(DOM.el("div", "trick-caption", state.seats[h.lastTrick.winner].name + " won the last trick"));
    } else if (h.currentTrick.length === 0) {
      wrap.appendChild(DOM.el("div", "center-label", "Trick " + h.trickNumber));
    }
    return wrap;
  }

  function statusLine(state) {
    const h = state.hand;
    const teams = "Team 1 " + state.teamScores[0] + " vs Team 2 " + state.teamScores[1];
    const head = "Hand " + state.handNumber + " - ";
    if (h.phase === "order") return head + "order up " + CARDS.suitName(h.upcard.suit) + "? - " + teams;
    if (h.phase === "name") return head + "name trump, not " + CARDS.suitName(h.upcard.suit) + " - " + teams;
    if (h.phase === "discard") return head + "dealer discards - " + teams;
    if (h.phase === "playing") return head + "trump " + CARDS.suitGlyph(h.trump) + ", called by " + state.seats[h.maker].name + " - " + teams;
    return "Hand complete - " + teams;
  }

  function seatTag(state, seat) {
    const h = state.hand;
    const parts = ["T" + (EUCHRE.teamOf(seat) + 1)];
    if (seat === state.dealerSeat) parts.push("dealer");
    if (seat === h.maker) parts.push("maker");
    if (h.trump) parts.push("won " + h.tricksWon[seat]);
    return parts.join(" · ");
  }

  function standings(state) {
    return state.seats
      .map((s, i) => {
        const t = EUCHRE.teamOf(i);
        return {
          name: s.name,
          detail: "Team " + (t + 1) + ": " + state.teamScores[t] + " pts" + (state.winningTeam === t ? " (won)" : ""),
          score: -state.teamScores[t] * 10 + t,
        };
      })
      .sort((a, b) => a.score - b.score);
  }

  root.EUCHRE_UI = {
    key: "euchre", label: "Euchre", seatMin: 4, seatMax: 4, seatFixed: true,
    tagline: "Partners play a 24-card deck: call trump, lean on the two bowers, and take 3 of 5 tricks. First team to 10 wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, cardTag, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
