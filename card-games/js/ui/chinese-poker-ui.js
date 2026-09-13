// Chinese Poker table binding. No trick/pile to click through - instead,
// clicking a card in your own hand cycles which of the 3 target rows
// (front/middle/back) it's assigned to, shown via a small tag badge.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const CP = root.CHINESE_POKER;
  const DOM = root.DOM;

  const ROW_ORDER = [null, "front", "middle", "back"];
  const CAPACITY = { front: 3, middle: 5, back: 5 };
  let assignment = {}; // card id -> 'front' | 'middle' | 'back'

  function create(seatTypes) {
    assignment = {};
    const state = CP.createGame(seatTypes);
    state.seats.forEach((s, i) => {
      if (s.type === "ai") {
        const a = CP.aiArrange(state.hands[i]);
        CP.submitArrangement(state, i, a.front, a.middle, a.back);
      }
    });
    return state;
  }

  function actingSeat(state) {
    if (state.gameOver) return null;
    const idx = state.seats.findIndex((s, i) => s.type === "human" && !state.arrangements[i]);
    return idx === -1 ? null : idx;
  }

  function isInterim() { return false; }
  function handOf(state, seat) { return state.hands[seat]; }

  function stepAI(state, seat) {
    if (state.arrangements[seat]) return; // already resolved at create() time
    const a = CP.aiArrange(state.hands[seat]);
    CP.submitArrangement(state, seat, a.front, a.middle, a.back);
  }

  function rowCountFor(row, excludingId) {
    return Object.entries(assignment).filter(([id, r]) => r === row && id !== excludingId).length;
  }

  function onCardClick(state, seat, card) {
    if (state.arrangements[seat]) return;
    const currentIdx = ROW_ORDER.indexOf(assignment[card.id] || null);
    for (let step = 1; step <= ROW_ORDER.length; step++) {
      const candidate = ROW_ORDER[(currentIdx + step) % ROW_ORDER.length];
      if (candidate === null) { delete assignment[card.id]; return; }
      if (rowCountFor(candidate, card.id) < CAPACITY[candidate]) { assignment[card.id] = candidate; return; }
    }
  }

  function isCardSelected() { return false; }
  function isCardDisabled(state, seat) { return !!state.arrangements[seat]; }
  function cardTag(state, seat, card) {
    const row = assignment[card.id];
    return row ? row[0].toUpperCase() : "";
  }

  function actionButtons(state, seat) {
    if (state.gameOver || state.arrangements[seat]) return [];
    const counts = { front: 0, middle: 0, back: 0 };
    state.hands[seat].forEach((c) => { const r = assignment[c.id]; if (r) counts[r]++; });
    const ready = counts.front === 3 && counts.middle === 5 && counts.back === 5;
    return [{
      label: "Submit (F " + counts.front + "/3, M " + counts.middle + "/5, B " + counts.back + "/5)",
      primary: true, disabled: !ready,
      onClick: () => {
        const front = state.hands[seat].filter((c) => assignment[c.id] === "front");
        const middle = state.hands[seat].filter((c) => assignment[c.id] === "middle");
        const back = state.hands[seat].filter((c) => assignment[c.id] === "back");
        CP.submitArrangement(state, seat, front, middle, back);
        assignment = {};
      },
    }];
  }

  function rowPreview(cards, label) {
    return DOM.el("div", null, [
      DOM.el("div", "row-label", label),
      DOM.el("div", "row-cards", cards.map((c) => DOM.cardEl(c, { small: true }))),
    ]);
  }

  function seatShowdown(state, seat) {
    const arr = state.arrangements[seat];
    const rows = ["front", "middle", "back"].map((row) => {
      const suffix = arr.fouled ? "" : " - " + CP.CATEGORY_NAME[arr.evaluated[row].category];
      return rowPreview(arr[row], row[0].toUpperCase() + row.slice(1) + " (" + arr[row].length + ")" + suffix);
    });
    return DOM.el("div", "showdown-seat", [
      DOM.el("div", "showdown-seat-name", state.seats[seat].name + (arr.fouled ? " - FOULED" : "")),
      ...rows,
    ]);
  }

  function centerNode(state) {
    if (state.gameOver) {
      return DOM.el("div", "showdown-grid", state.seats.map((_, i) => seatShowdown(state, i)));
    }
    const seat = actingSeat(state);
    if (seat == null) return DOM.el("div", "center-label", "Waiting for everyone to arrange their hand...");
    const rows = ["front", "middle", "back"].map((row) => {
      const cards = state.hands[seat].filter((c) => assignment[c.id] === row);
      return rowPreview(cards, row[0].toUpperCase() + row.slice(1) + " (" + cards.length + ")");
    });
    return DOM.el("div", null, rows);
  }

  function statusLine(state) {
    if (state.gameOver) return "Final scores below.";
    return "Click a card to cycle it through Front / Middle / Back, then submit.";
  }

  function seatTag(state, seat) {
    if (!state.arrangements[seat]) return "Arranging...";
    if (!state.gameOver) return "Ready";
    const score = state.scores[seat];
    return (score >= 0 ? "+" : "") + score + (state.arrangements[seat].fouled ? " (fouled)" : "");
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: (state.scores[i] >= 0 ? "+" : "") + state.scores[i], score: -state.scores[i] }))
      .sort((a, b) => a.score - b.score);
  }

  root.CHINESE_POKER_UI = {
    key: "chinese-poker", label: "Chinese Poker", seatMin: 4, seatMax: 4, seatFixed: true,
    tagline: "Arrange 13 cards into 3 poker hands (front/middle/back), then everyone's hands are scored head-to-head.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, cardTag, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
