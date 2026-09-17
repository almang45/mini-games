// Oh Hell table binding. Bidding reuses the Spades -/+ stepper; the dealer's
// forbidden bid stays reachable on the stepper but can't be submitted.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const OH_HELL = root.OH_HELL;
  const DOM = root.DOM;

  let pendingBid = null; // stepper value for the human currently bidding; null = seed from the AI estimate

  function create(seatTypes) {
    pendingBid = null;
    return OH_HELL.createGame(seatTypes);
  }

  function actingSeat(state) {
    return state.gameOver || state.round.phase === "round-end" ? null : state.round.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.round.phase === "round-end"; }
  function handOf(state, seat) { return state.round.hands[seat]; }

  function stepAI(state, seat) {
    if (state.round.phase === "bidding") OH_HELL.placeBid(state, seat, OH_HELL.aiChooseBid(state, seat));
    else OH_HELL.playCard(state, seat, OH_HELL.aiChoosePlay(state, seat));
  }

  function isLegal(state, seat, card) {
    return OH_HELL.getLegalPlays(state, seat).some((c) => c.id === card.id);
  }

  function onCardClick(state, seat, card) {
    if (state.round.phase === "playing" && isLegal(state, seat, card)) OH_HELL.playCard(state, seat, card);
  }

  function isCardSelected() { return false; }

  function isCardDisabled(state, seat, card) {
    return state.round.phase === "playing" && !isLegal(state, seat, card);
  }

  function actionButtons(state, seat) {
    const r = state.round;
    if (r.phase === "round-end") {
      return [{ label: "Deal Next Round", primary: true, onClick: () => { OH_HELL.startRound(state); pendingBid = null; } }];
    }
    if (r.phase !== "bidding" || r.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    if (pendingBid === null) pendingBid = OH_HELL.aiChooseBid(state, seat);
    const allowed = OH_HELL.legalBids(state, seat).includes(pendingBid);
    return [
      { label: "−", disabled: pendingBid === 0, onClick: () => { pendingBid--; } },
      {
        label: allowed ? "Bid " + pendingBid : "Dealer can't bid " + pendingBid, primary: true, disabled: !allowed,
        onClick: () => { OH_HELL.placeBid(state, seat, pendingBid); pendingBid = null; },
      },
      { label: "+", disabled: pendingBid === r.handSize, onClick: () => { pendingBid++; } },
    ];
  }

  function table(headers, rows) {
    return DOM.el("table", "score-table", [
      DOM.el("thead", null, DOM.el("tr", null, headers.map((h) => DOM.el("th", null, h)))),
      DOM.el("tbody", null, rows.map((cells) => DOM.el("tr", null, cells.map((c) => DOM.el("td", null, String(c)))))),
    ]);
  }

  function bidBoard(state) {
    const r = state.round;
    return DOM.el("div", null, [
      DOM.el("div", "pile-area", DOM.cardEl(r.trumpCard, { small: true })),
      DOM.el("div", "row-label", "Trump: " + CARDS.suitName(r.trump)),
      table(["Seat", "Bid"], state.seats.map((s, i) => [s.name + (i === state.dealerSeat ? " (dealer)" : ""), r.bids[i] === null ? "..." : r.bids[i]])),
    ]);
  }

  function roundSummary(state) {
    return table(["Seat", "Won / Bid", "Round", "Total"], state.round.summary.map((s, i) => [
      state.seats[i].name, s.tricks + " / " + s.bid, s.points ? "+" + s.points : "0", state.scores[i],
    ]));
  }

  function centerNode(state, anchorSeat) {
    const r = state.round;
    if (r.phase === "bidding") return bidBoard(state);
    if (r.phase === "round-end" || r.phase === "game-end") return roundSummary(state);
    const showLast = r.currentTrick.length === 0 && r.lastTrick;
    const wrap = DOM.trickArea(showLast ? r.lastTrick.plays : r.currentTrick, anchorSeat || 0, state.seats.length);
    if (showLast) {
      wrap.classList.add("is-last-trick");
      wrap.appendChild(DOM.el("div", "trick-caption", state.seats[r.lastTrick.winner].name + " won the last trick"));
    } else if (r.currentTrick.length === 0) {
      wrap.appendChild(DOM.el("div", "center-label", "Trick " + r.trickNumber));
    }
    return wrap;
  }

  function statusLine(state) {
    const r = state.round;
    const head = "Round " + (state.roundIndex + 1) + "/" + OH_HELL.HAND_SIZES.length + " - " + r.handSize +
      (r.handSize === 1 ? " card" : " cards") + " - trump " + CARDS.suitGlyph(r.trump);
    if (r.phase === "bidding") return head + " - bidding";
    if (r.phase === "playing") {
      const total = r.bids.reduce((a, b) => a + b, 0);
      return head + " - " + total + " bid for " + r.handSize + " tricks (" + (total > r.handSize ? "overbid" : "underbid") + ")";
    }
    return head + " - round complete";
  }

  // Kept short: side seats get a 70px column on phones. The dealer is only
  // flagged while bidding, when it matters.
  function seatTag(state, seat) {
    const r = state.round;
    const pts = state.scores[seat] + " pts";
    if (r.bids[seat] === null) return pts + (seat === state.dealerSeat ? " · dealer" : "");
    return "won " + r.tricksWon[seat] + "/" + r.bids[seat] + " · " + pts;
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({
        name: s.name,
        detail: state.scores[i] + " pts" + (state.winners && state.winners.includes(i) ? " (won)" : ""),
        score: -state.scores[i],
      }))
      .sort((a, b) => a.score - b.score);
  }

  root.OH_HELL_UI = {
    key: "oh-hell", label: "Oh Hell", seatMin: 3, seatMax: 4, seatFixed: false,
    tagline: "Bid exactly how many tricks you'll take while hands shrink from 7 cards to 1 and back. Miss by one and you score nothing.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
