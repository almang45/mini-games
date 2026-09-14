// Gin Rummy table binding. The engine keeps every hand optimally melded, so
// your cards carry meld badges (A, B, C...) and a turn is: draw from the stock
// or discard pile, select a card, then Discard / Knock / Gin with it.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;
  const GIN = root.GIN_RUMMY;
  const DOM = root.DOM;
  const MELD_TAGS = ["A", "B", "C", "D"];

  let selectedId = null;
  let tagCache = { key: null, tags: new Map() }; // bestMelds is exact search; don't redo it per card render

  function create(seatTypes) {
    selectedId = null;
    return GIN.createGame(seatTypes);
  }

  function actingSeat(state) {
    return state.gameOver || state.hand.phase === "hand-end" ? null : state.hand.turnSeat;
  }

  function isInterim(state) { return !state.gameOver && state.hand.phase === "hand-end"; }
  function handOf(state, seat) { return state.hand.hands[seat]; }
  function stepAI(state, seat) { GIN.aiStep(state, seat); }

  function onCardClick(state, seat, card) {
    if (GIN.canDiscard(state, seat, card)) selectedId = selectedId === card.id ? null : card.id;
  }

  function isCardSelected(state, seat, card) { return card.id === selectedId; }

  // Only the card just taken from the discard pile is off-limits; during the
  // draw step the hand stays readable rather than greyed out.
  function isCardDisabled(state, seat, card) {
    return state.hand.phase === "discard" && !GIN.canDiscard(state, seat, card);
  }

  function cardTag(state, seat, card) {
    const hand = state.hand.hands[seat];
    const key = hand.map((c) => c.id).join(",");
    if (tagCache.key !== key) {
      tagCache = { key, tags: new Map() };
      GIN.bestMelds(hand).melds.forEach((meld, i) => meld.forEach((c) => tagCache.tags.set(c.id, MELD_TAGS[i])));
    }
    return tagCache.tags.get(card.id) || null;
  }

  function actionButtons(state, seat) {
    const h = state.hand;
    if (h.phase === "hand-end") {
      return [{ label: "Deal Next Hand", primary: true, onClick: () => { GIN.nextHand(state); selectedId = null; } }];
    }
    if (h.turnSeat !== seat || state.seats[seat].type !== "human") return [];
    if (h.phase === "draw") {
      return [
        { label: "Draw from Stock", primary: true, onClick: () => GIN.drawStock(state, seat) },
        { label: "Take " + CARDS.cardLabel(GIN.topDiscard(state)), onClick: () => GIN.takeDiscard(state, seat) },
      ];
    }
    const card = h.hands[seat].find((c) => c.id === selectedId);
    if (!card) return [{ label: "Select a card to discard", disabled: true, onClick: () => {} }];
    const deadwood = GIN.deadwoodAfterDiscard(state, seat, card);
    const play = (knock) => () => { GIN.discard(state, seat, card, knock); selectedId = null; };
    return [
      { label: "Discard " + CARDS.cardLabel(card), primary: true, onClick: play(false) },
      deadwood === 0
        ? { label: "Gin!", onClick: play(true) }
        : { label: "Knock (" + deadwood + " deadwood)", disabled: deadwood > GIN.KNOCK_LIMIT, onClick: play(true) },
    ];
  }

  function pile(cardNode, caption) {
    return DOM.el("div", null, [cardNode, DOM.el("div", "row-label", caption)]);
  }

  function smallRow(cards, laidOff) {
    return DOM.el("div", "row-cards", cards.map((c) => DOM.cardEl(c, { small: true, tag: laidOff.has(c.id) ? "+" : null })));
  }

  function resultText(state) {
    const res = state.hand.result;
    const name = (seat) => state.seats[seat].name;
    if (res.type === "void") return "Stock ran out - no score this hand.";
    if (res.type === "gin") return name(res.winner) + " goes gin: +" + res.points + " (" + GIN.GIN_BONUS + " bonus).";
    if (res.type === "undercut") return name(res.winner) + " undercuts " + name(res.knocker) + ": +" + res.points + " (" + GIN.UNDERCUT_BONUS + " bonus).";
    return name(res.winner) + " knocks and scores +" + res.points + ".";
  }

  function showdown(state) {
    const res = state.hand.result;
    const grid = DOM.el("div", "showdown-grid");
    if (res.type !== "void") {
      const laidOff = new Set(res.laidOff.map((c) => c.id));
      res.arrangements.forEach((arr, seat) => {
        const box = DOM.el("div", "showdown-seat", DOM.el("div", "showdown-seat-name",
          state.seats[seat].name + (seat === res.knocker ? " (knocked)" : "") + " - deadwood " + arr.points));
        arr.melds.forEach((meld) => box.appendChild(smallRow(meld, laidOff)));
        if (arr.deadwood.length > 0) {
          box.appendChild(DOM.el("div", "row-label", "Deadwood"));
          box.appendChild(smallRow(arr.deadwood, laidOff));
        }
        grid.appendChild(box);
      });
    }
    grid.appendChild(DOM.el("div", "row-label", resultText(state)));
    return grid;
  }

  function centerNode(state) {
    const h = state.hand;
    if (h.phase === "hand-end") return showdown(state);
    const top = GIN.topDiscard(state);
    const row = DOM.el("div", "pile-area", [
      pile(DOM.cardEl(null, { faceDown: true }), h.stock.length + " in stock"),
      pile(top ? DOM.cardEl(top, {}) : DOM.el("div", "card card-slot"), "discard"),
    ]);
    row.style.gap = "18px";
    return row;
  }

  function statusLine(state) {
    const h = state.hand;
    if (h.phase === "hand-end") return resultText(state);
    const seat = h.turnSeat;
    let line = "Hand " + state.handNumber + " - " + state.seats[seat].name + (h.phase === "draw" ? " to draw" : " to discard");
    if (state.seats[seat].type !== "human") return line;
    if (h.phase === "draw") return line + " - deadwood " + GIN.bestMelds(h.hands[seat]).points;
    const best = Math.min(...h.hands[seat].filter((c) => GIN.canDiscard(state, seat, c)).map((c) => GIN.deadwoodAfterDiscard(state, seat, c)));
    return line + " - best discard leaves " + best + " deadwood";
  }

  function seatTag(state, seat) {
    return state.scores[seat] + " pts" + (seat === state.dealerSeat ? " | dealer" : "");
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: state.scores[i] + " pts" + (state.winner === i ? " (won)" : ""), score: -state.scores[i] }))
      .sort((a, b) => a.score - b.score);
  }

  root.GIN_RUMMY_UI = {
    key: "gin-rummy", label: "Gin Rummy", seatMin: 2, seatMax: 2, seatFixed: false,
    tagline: "Build sets and runs to cut your deadwood, then knock - or go gin for the bonus. First to 100.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, cardTag, actionButtons,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
