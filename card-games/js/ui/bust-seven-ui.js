// Bust Seven table binding. Every card is face up and nothing is played from
// hand, so the adapter sets openHands and has no card-click hooks: all seats
// render as plain fans and hot-seat play needs no "pass the device" screen.
// All decisions (hit, stay, who gets an action card) go through the action bar.
(function (root) {
  "use strict";
  const B7 = root.BUST_SEVEN;
  const DOM = root.DOM;

  // \uFE0E keeps the snowflake a text glyph instead of a colour emoji.
  const ACTION_GLYPH = { freeze: "❄\uFE0E", flip3: "⇶", second: "♥" };
  const ACTION_SHORT = { freeze: "Freeze", flip3: "Flip 3", second: "2nd" };

  function create(seatTypes) {
    const state = B7.createGame(seatTypes);
    B7.startRound(state);
    return state;
  }

  function actingSeat(state) { return B7.actingSeat(state); }
  function isInterim(state) { return !state.gameOver && state.phase === "round-over"; }
  function stepAI(state, seat) { B7.stepAI(state, seat); }

  function handOf(state, seat) {
    const h = state.hands[seat];
    const numbers = h.numbers.slice().sort((a, b) => a.value - b.value);
    return numbers.concat(h.bustCard ? [h.bustCard] : [], h.mods, h.second ? [h.second] : [], h.actions);
  }

  function cardTag(state, seat, card) { return card === state.hands[seat].bustCard ? "BUST" : null; }

  function renderFace(card, face) {
    face.classList.add("b7-card", "b7-" + card.kind);
    face.title = B7.cardLabel(card);
    if (card.kind === "number") {
      face.classList.add("b7-n" + card.value);
      face.appendChild(DOM.el("div", "b7-value", String(card.value)));
    } else if (card.kind === "action") {
      face.classList.add("b7-" + card.value);
      face.appendChild(DOM.el("div", "b7-value", ACTION_GLYPH[card.value]));
      face.appendChild(DOM.el("div", "b7-caption", ACTION_SHORT[card.value]));
    } else {
      face.appendChild(DOM.el("div", "b7-value", B7.cardLabel(card)));
    }
  }

  const TARGET_LABEL = { freeze: "Freeze ", flip3: "Flip Three: ", second: "Give to " };

  function actionButtons(state, seat) {
    if (!state.gameOver && state.phase === "round-over") {
      return [{ label: "Deal Next Round", primary: true, onClick: () => B7.startRound(state) }];
    }
    if (state.phase === "target" && state.pending.seat === seat) {
      const { card, targets } = state.pending;
      return targets.map((t) => ({
        label: TARGET_LABEL[card.value] + state.seats[t].name,
        primary: t !== seat,
        onClick: () => B7.chooseTarget(state, seat, t),
      }));
    }
    if (state.phase !== "turn" || state.turnSeat !== seat) return [];
    return [
      { label: "Hit", primary: true, onClick: () => B7.hit(state, seat) },
      { label: "Stay", onClick: () => B7.stay(state, seat) },
    ];
  }

  function centerNode(state) {
    const top = state.discard[state.discard.length - 1];
    const piles = DOM.el("div", "b7-piles", [
      DOM.el("div", "b7-pile", [DOM.cardEl(null, { faceDown: true }), DOM.el("div", "b7-pile-label", "Deck " + state.deck.length)]),
      DOM.el("div", "b7-pile", [
        top ? DOM.cardEl(top, { renderFace }) : DOM.el("div", "card card-slot"),
        DOM.el("div", "b7-pile-label", "Discards " + state.discard.length),
      ]),
    ]);
    const children = [DOM.el("div", "center-label", "Round " + state.round + " · first to " + B7.TARGET), piles];
    if (state.phase === "target") {
      const p = state.pending;
      children.push(DOM.el("div", "b7-prompt", [
        DOM.cardEl(p.card, { renderFace, small: true }),
        DOM.el("span", null, state.seats[p.seat].name + " picks who gets " + B7.cardLabel(p.card)),
      ]));
    }
    return DOM.el("div", "b7-center", children);
  }

  function statusLine(state) {
    if (state.gameOver) return state.seats[state.winner].name + " wins - final scores below.";
    if (state.phase === "round-over") return "Round " + state.round + " scored - deal the next round when ready.";
    if (state.phase === "target") return state.seats[state.pending.seat].name + " drew " + B7.cardLabel(state.pending.card) + " - choose a player.";
    return state.seats[state.turnSeat].name + ": hit or stay on " + B7.handScore(state.hands[state.turnSeat]) + ".";
  }

  const STATUS_TAG = { stayed: "stayed", frozen: "frozen", bust: "BUST", seven: "SEVEN!" };

  function seatTag(state, seat) {
    const h = state.hands[seat];
    const hand = state.phase === "round-over" ? "+" + h.roundScore : String(B7.handScore(h));
    const status = STATUS_TAG[h.status] ? " " + STATUS_TAG[h.status] : "";
    return hand + status + " | " + state.seats[seat].score;
  }

  function standings(state) {
    return state.seats
      .map((s) => ({ name: s.name, detail: s.score + " pts", score: -s.score }))
      .sort((a, b) => a.score - b.score);
  }

  root.BUST_SEVEN_UI = {
    key: "bust-seven", label: "Bust Seven", seatMin: 2, seatMax: 4, seatFixed: false, openHands: true,
    tagline: "Flip numbers until you stop - a repeat busts you. Seven different numbers ends the round. First to 200.",
    create, actingSeat, isInterim, handOf, stepAI,
    actionButtons, cardTag, renderFace,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
