// Texas Hold'em table binding. Every decision goes through the action bar;
// bet sizes use a -/+ stepper that moves in half-pot steps so a big bet is a
// few clicks, with All In as the shortcut.
(function (root) {
  "use strict";
  const HOLDEM = root.HOLDEM;
  const DOM = root.DOM;

  let pendingRaise = null; // stepper value for the seat to act; null = the minimum raise

  function create(seatTypes) {
    pendingRaise = null;
    return HOLDEM.createGame(seatTypes);
  }

  function actingSeat(state) {
    return state.gameOver || state.hand.phase !== "betting" ? null : state.hand.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.hand.phase === "hand-end"; }
  function handOf(state, seat) { return state.hand.folded[seat] ? [] : state.hand.holes[seat]; }

  function act(state, seat, action) {
    HOLDEM.act(state, seat, action);
    pendingRaise = null;
  }

  function stepAI(state, seat) { act(state, seat, HOLDEM.aiChooseAction(state, seat)); }

  function onCardClick() {}
  function isCardSelected() { return false; }
  function isCardDisabled() { return false; }

  function actionButtons(state, seat) {
    const h = state.hand;
    if (h.phase === "hand-end") {
      return [{ label: "Deal Next Hand", primary: true, onClick: () => { HOLDEM.startHand(state); pendingRaise = null; } }];
    }
    if (h.phase !== "betting" || h.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    const legal = HOLDEM.legalActions(state, seat);
    const buttons = legal.canCheck
      ? [{ label: "Check", primary: true, onClick: () => act(state, seat, { type: "check" }) }]
      : [
        { label: "Fold", onClick: () => act(state, seat, { type: "fold" }) },
        { label: "Call " + legal.toCall, primary: true, onClick: () => act(state, seat, { type: "call" }) },
      ];
    if (!legal.canRaise) return buttons;

    const step = Math.max(HOLDEM.BIG_BLIND, Math.round(HOLDEM.potTotal(h) / 2 / HOLDEM.BIG_BLIND) * HOLDEM.BIG_BLIND);
    const clamp = (v) => Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, v));
    pendingRaise = clamp(pendingRaise === null ? legal.minRaiseTo : pendingRaise);
    const raise = (to) => () => act(state, seat, { type: "raise", to });
    return buttons.concat([
      { label: "−", disabled: pendingRaise === legal.minRaiseTo, onClick: () => { pendingRaise = clamp(pendingRaise - step); } },
      { label: (h.currentBet === 0 ? "Bet " : "Raise to ") + pendingRaise, onClick: raise(pendingRaise) },
      { label: "+", disabled: pendingRaise === legal.maxRaiseTo, onClick: () => { pendingRaise = clamp(pendingRaise + step); } },
      { label: "All In " + legal.maxRaiseTo, onClick: raise(legal.maxRaiseTo) },
    ]);
  }

  function boardRow(h) {
    const slots = [];
    for (let i = 0; i < 5; i++) slots.push(h.board[i] ? DOM.cardEl(h.board[i], {}) : DOM.el("div", "card card-slot"));
    return DOM.el("div", "row-cards board-row", slots);
  }

  function showdown(state) {
    const h = state.hand;
    const r = h.result;
    if (r.uncontested) {
      const winner = r.pots[0].winners[0];
      return DOM.el("div", "row-label", state.seats[winner].name + " wins " + r.pots[0].amount + " - everyone else folded");
    }
    return DOM.el("div", "showdown-grid showdown-compact", r.hands.map(({ seat, score }) => DOM.el("div", "showdown-seat", [
      DOM.el("div", "showdown-seat-name", state.seats[seat].name + (r.payouts[seat] ? " +" + r.payouts[seat] : "")),
      DOM.el("div", "row-cards", h.holes[seat].map((c) => DOM.cardEl(c, { small: true }))),
      DOM.el("div", "row-label", HOLDEM.CATEGORY_NAME[score.category]),
    ])));
  }

  function centerNode(state) {
    const h = state.hand;
    const done = h.phase !== "betting";
    return DOM.el("div", null, [
      DOM.el("div", "row-label", done ? "Hand " + state.handNumber + " result" : HOLDEM.STREET_NAME[h.street] + " · pot " + HOLDEM.potTotal(h)),
      boardRow(h),
      done ? showdown(state) : null,
    ]);
  }

  function statusLine(state) {
    const h = state.hand;
    const head = "Hand " + state.handNumber + "/" + HOLDEM.HAND_LIMIT + " - blinds " + HOLDEM.SMALL_BLIND + "/" + HOLDEM.BIG_BLIND;
    if (state.gameOver) return head + " - session over";
    if (h.phase === "hand-end") return head + " - hand complete";
    const owed = h.currentBet - h.bets[h.turnSeat];
    return head + " - " + state.seats[h.turnSeat].name + (owed > 0 ? " to call " + Math.min(owed, state.chips[h.turnSeat]) : " to act");
  }

  // Kept short: side seats get a 70px column on phones.
  function seatTag(state, seat) {
    const h = state.hand;
    if (!h.dealt[seat]) return "out";
    const bits = [state.chips[seat] + (seat === state.dealerSeat ? " · D" : "")];
    if (h.phase !== "betting") {
      if (h.result.payouts[seat]) bits.push("won " + h.result.payouts[seat]);
    } else if (h.folded[seat]) {
      bits.push("folded");
    } else if (h.allIn[seat]) {
      bits.push("all in");
    } else if (h.bets[seat]) {
      bits.push("bet " + h.bets[seat]);
    }
    return bits.join(" · ");
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: state.chips[i] + " chips", score: -state.chips[i] }))
      .sort((a, b) => a.score - b.score);
  }

  root.HOLDEM_UI = {
    key: "texas-holdem", label: "Texas Hold'em", seatMin: 2, seatMax: 4, seatFixed: false,
    tagline: "No-limit poker over 20 hands: two hole cards, five on the board, and 500 chips to bet, bluff or shove.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
