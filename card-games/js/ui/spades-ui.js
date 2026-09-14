// Spades table binding. Bidding runs through the action bar (a -/+ stepper
// pre-set to the AI's own estimate for that hand); tricks then play like Hearts.
(function (root) {
  "use strict";
  const SPADES = root.SPADES;
  const DOM = root.DOM;

  let pendingBid = null; // stepper value for the human currently bidding; null = seed from the AI estimate

  function create(seatTypes) {
    pendingBid = null;
    return SPADES.createGame(seatTypes);
  }

  function actingSeat(state) {
    return state.gameOver || state.round.phase === "round-end" ? null : state.round.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.round.phase === "round-end"; }
  function handOf(state, seat) { return state.round.hands[seat]; }

  function stepAI(state, seat) {
    const r = state.round;
    if (r.phase === "bidding") SPADES.placeBid(state, seat, SPADES.aiChooseBid(r.hands[seat]));
    else SPADES.playCard(state, seat, SPADES.aiChoosePlay(state, seat));
  }

  function isLegal(state, seat, card) {
    return SPADES.getLegalPlays(state, seat).some((c) => c.id === card.id);
  }

  function onCardClick(state, seat, card) {
    if (state.round.phase === "playing" && isLegal(state, seat, card)) SPADES.playCard(state, seat, card);
  }

  function isCardSelected() { return false; }

  // Not greyed out while bidding - the hand needs to stay readable to judge it.
  function isCardDisabled(state, seat, card) {
    return state.round.phase === "playing" && !isLegal(state, seat, card);
  }

  function actionButtons(state, seat) {
    const r = state.round;
    if (r.phase === "round-end") {
      return [{ label: "Deal Next Round", primary: true, onClick: () => { SPADES.startRound(state); pendingBid = null; } }];
    }
    if (r.phase !== "bidding" || r.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    if (pendingBid === null) pendingBid = SPADES.aiChooseBid(r.hands[seat]);
    return [
      { label: "−", disabled: pendingBid === 0, onClick: () => { pendingBid--; } },
      {
        label: pendingBid === 0 ? "Bid Nil" : "Bid " + pendingBid, primary: true,
        onClick: () => { SPADES.placeBid(state, seat, pendingBid); pendingBid = null; },
      },
      { label: "+", disabled: pendingBid === 13, onClick: () => { pendingBid++; } },
    ];
  }

  function bidLabel(bid) { return bid === null ? "..." : bid === 0 ? "Nil" : String(bid); }

  function bidBoard(state) {
    const rows = state.seats.map((s, i) => DOM.el("tr", null, [
      DOM.el("td", null, s.name),
      DOM.el("td", null, "Team " + (SPADES.teamOf(i) + 1)),
      DOM.el("td", null, bidLabel(state.round.bids[i])),
    ]));
    return DOM.el("table", "score-table", [
      DOM.el("thead", null, DOM.el("tr", null, [DOM.el("th", null, "Seat"), DOM.el("th", null, "Team"), DOM.el("th", null, "Bid")])),
      DOM.el("tbody", null, rows),
    ]);
  }

  function roundSummary(state) {
    const rows = state.round.summary.map((s, t) => DOM.el("tr", null, [
      DOM.el("td", null, "Team " + (t + 1)),
      DOM.el("td", null, s.tricks + " / " + s.contract),
      DOM.el("td", null, (s.delta >= 0 ? "+" : "") + s.delta + (s.bagPenalty ? " -" + SPADES.BAG_PENALTY : "")),
      DOM.el("td", null, state.teamScores[t] + " (" + state.teamBags[t] + " bags)"),
    ]));
    return DOM.el("table", "score-table", [
      DOM.el("thead", null, DOM.el("tr", null, ["Team", "Won / Bid", "Round", "Total"].map((h) => DOM.el("th", null, h)))),
      DOM.el("tbody", null, rows),
    ]);
  }

  function centerNode(state, anchorSeat) {
    const r = state.round;
    if (r.phase === "bidding") return bidBoard(state);
    if (r.phase === "round-end" || r.phase === "game-end") return roundSummary(state);
    const showLast = r.currentTrick.length === 0 && r.lastTrick;
    const wrap = DOM.trickArea(showLast ? r.lastTrick.plays : r.currentTrick, anchorSeat || 0, SPADES.SEATS);
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
    const teams = [0, 1].map((t) => "Team " + (t + 1) + " " + state.teamScores[t]).join(" vs ");
    if (r.phase === "bidding") return "Bidding - " + teams;
    if (r.phase === "playing") return "Trick " + r.trickNumber + " - spades " + (r.spadesBroken ? "broken" : "not broken") + " - " + teams;
    return "Round complete - " + teams;
  }

  function seatTag(state, seat) {
    const bid = state.round.bids[seat];
    const team = "T" + (SPADES.teamOf(seat) + 1);
    return bid === null ? team : team + " | bid " + bidLabel(bid) + ", won " + state.round.tricksWon[seat];
  }

  function standings(state) {
    return state.seats
      .map((s, i) => {
        const t = SPADES.teamOf(i);
        return {
          name: s.name,
          detail: "Team " + (t + 1) + ": " + state.teamScores[t] + " pts" + (state.winningTeam === t ? " (won)" : ""),
          score: -state.teamScores[t] * 10 + t,
        };
      })
      .sort((a, b) => a.score - b.score);
  }

  root.SPADES_UI = {
    key: "spades", label: "Spades", seatMin: 4, seatMax: 4, seatFixed: true,
    tagline: "Partners bid how many tricks they'll take. Spades are always trump. First team to 500 wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
