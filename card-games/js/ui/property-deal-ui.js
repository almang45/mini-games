// Property Deal table binding.
//
// Hands are hidden as usual; each seat's bank and property sets are public
// and drawn by seatExtra under its name. Playing a card is a short dialogue
// in the action bar: click the card, then pick what to do with it (bank,
// which colour, who to charge, what to take). Paying a debt is done by
// clicking cards in your own table area, then Pay.
//
// UI-only state (the card being played, the cards picked to pay with) lives
// in state.ui; the engine never reads it.
(function (root) {
  "use strict";
  const PD = root.PROPERTY_DEAL;
  const DOM = root.DOM;

  const SHORT = {
    brown: "BRN", lightblue: "LBL", pink: "PNK", orange: "ORG", red: "RED",
    yellow: "YEL", green: "GRN", darkblue: "DBL", station: "STN", utility: "UTL",
  };
  const ACTION_SHORT = {
    setgrab: "Set Grab", block: "Block", steal: "Steal", swap: "Swap", debt: "Debt",
    birthday: "B'day", bonusdraw: "+2 Draw", house: "House", hotel: "Hotel", double: "×2 Rent",
  };

  function ui(state) {
    if (!state.ui) state.ui = { draft: null, paySel: new Set() };
    return state.ui;
  }

  function create(seatTypes) { return PD.createGame(seatTypes); }
  function actingSeat(state) { return PD.actingSeat(state); }
  function isInterim() { return false; }
  function stepAI(state, seat) { ui(state).draft = null; PD.stepAI(state, seat); }

  const KIND_ORDER = { prop: 0, rent: 1, action: 2, money: 3 };
  function handOf(state, seat) {
    return state.hands[seat].slice().sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.value - a.value);
  }

  // ---------------------------------------------------------------- faces

  function stripes(colors) {
    const band = DOM.el("div", "pd-band");
    if (PD.isAnyColor({ colors })) band.classList.add("pd-rainbow");
    else colors.forEach((c) => band.appendChild(DOM.el("span", "pd-c-" + c)));
    return band;
  }

  function renderFace(card, face) {
    face.classList.add("pd-card", "pd-" + card.kind);
    face.title = PD.cardLabel(card) + (card.value ? " ($" + card.value + "M)" : "");
    if (card.value) face.appendChild(DOM.el("div", "pd-corner", "$" + card.value));
    if (card.kind === "money") {
      face.appendChild(DOM.el("div", "pd-value", "$" + card.value + "M"));
    } else if (card.kind === "prop") {
      face.appendChild(stripes(card.colors));
      face.appendChild(DOM.el("div", "pd-label", PD.isAnyColor(card) ? "ANY" : card.colors.map((c) => SHORT[c]).join("/")));
    } else if (card.kind === "rent") {
      face.appendChild(DOM.el("div", "pd-label", "RENT"));
      face.appendChild(stripes(card.colors));
    } else {
      face.appendChild(DOM.el("div", "pd-label pd-action-" + card.type, ACTION_SHORT[card.type]));
    }
  }

  // ------------------------------------------------------- the public table

  function seatExtra(state, seat, helpers) {
    const t = state.tables[seat];
    const wrap = DOM.el("div", "pd-tableau");
    const paying = helpers.canAct && state.phase === "pay" && PD.actingSeat(state) === seat && state.seats[seat].type === "human";
    if (paying) {
      const sel = ui(state).paySel;
      PD.payable(t).forEach(({ card, where }) => {
        const label = (where === "bank" ? "" : PD.COLOR_NAME[where] + " ") + (card.kind === "action" ? PD.ACTION_NAME[card.type] + " " : "") + "$" + card.value + "M";
        const chip = DOM.el("button", "pd-chip pd-pick" + (sel.has(card.id) ? " is-picked" : ""), label);
        chip.type = "button";
        chip.dataset.id = card.id;
        chip.addEventListener("click", () => {
          if (sel.has(card.id)) sel.delete(card.id); else sel.add(card.id);
          helpers.refresh();
        });
        wrap.appendChild(chip);
      });
      return wrap;
    }
    wrap.appendChild(DOM.el("span", "pd-chip pd-bank", "Bank $" + PD.bankTotal(t) + "M"));
    PD.COLORS.forEach((color) => {
      const set = t.sets[color];
      if (set.cards.length === 0) return;
      const full = PD.isFull(t, color);
      const text = Math.min(set.cards.length, PD.setSize(color)) + "/" + PD.setSize(color) +
        (set.cards.length > PD.setSize(color) ? "+" + (set.cards.length - PD.setSize(color)) : "") +
        (set.hotel ? " · Hotel" : set.house ? " · House" : "") +
        (set.cards.every(PD.isAnyColor) ? " · wilds only" : "");
      const chip = DOM.el("span", "pd-chip pd-set" + (full ? " is-full" : ""), [DOM.el("i", "pd-swatch pd-c-" + color), text]);
      chip.title = PD.COLOR_NAME[color] + ": " + set.cards.map(PD.cardLabel).join(", ") + " - rent $" + PD.rentFor(t, color) + "M";
      wrap.appendChild(chip);
    });
    return wrap;
  }

  // ------------------------------------------------------ playing a card

  function onCardClick(state, seat, card) {
    if (PD.actingSeat(state) !== seat) return;
    if (state.phase === "discard") return PD.discardCard(state, seat, card.id);
    if (state.phase !== "play" || state.plays >= PD.PLAYS_PER_TURN) return;
    const u = ui(state);
    u.moving = false;
    u.draft = u.draft && u.draft.id === card.id ? null : { id: card.id, step: 0 };
  }

  function isCardSelected(state, seat, card) { const d = ui(state).draft; return !!d && d.id === card.id; }
  function isCardDisabled(state, seat) {
    if (PD.actingSeat(state) !== seat) return true;
    if (state.phase === "discard") return false;
    return state.phase !== "play" || state.plays >= PD.PLAYS_PER_TURN;
  }
  function cardTag(state, seat, card) {
    return state.phase === "discard" && PD.actingSeat(state) === seat ? "drop" : null;
  }

  const name = (state, seat) => state.seats[seat].name;

  // A property where it sits, saying which wild it is: an any-colour wild
  // ($0) and a two-colour wild in the same set must never read the same.
  function propName(card, where) {
    if (PD.isAnyColor(card)) return PD.COLOR_NAME[where] + " (any-colour wild)";
    if (PD.isWild(card)) return PD.COLOR_NAME[where] + " (" + card.colors.map((c) => PD.COLOR_NAME[c]).join("/") + " wild)";
    return PD.COLOR_NAME[where];
  }

  // Two identical cards give identical labels; number them so each button
  // (found by its label) is distinct.
  function dedupeLabels(list) {
    const seen = {};
    list.forEach((c) => { seen[c.label] = (seen[c.label] || 0) + 1; if (seen[c.label] > 1) c.label += " (" + seen[c.label] + ")"; });
    return list;
  }

  // Every way to play the drafted card at its current step. Each choice is
  // either final (opt: play it) or a step (step: fields to add to the draft).
  function choices(state, seat, card, draft) {
    const others = PD.others(state, seat);
    const out = [];
    const final = (label, opt) => { if (!PD.playError(state, seat, card, opt)) out.push({ label, opt }); };
    if (card.kind !== "prop" && card.value > 0 && draft.step === 0) final("Bank $" + card.value + "M", { as: "bank" });

    if (card.kind === "prop") {
      card.colors.forEach((color) => final(card.colors.length > 1 ? "Play as " + PD.COLOR_NAME[color] : "Play to table", { as: "prop", color }));
    } else if (card.kind === "rent") {
      const canDouble = state.hands[seat].some((c) => c.type === "double") && state.plays + 2 <= PD.PLAYS_PER_TURN;
      if (draft.color == null) {
        card.colors.forEach((color) => {
          const amount = PD.rentFor(state.tables[seat], color);
          if (!amount) return;
          [false, true].forEach((double) => {
            if (double && !canDouble) return;
            const label = (double ? "Rent ×2: " : "Rent: ") + PD.COLOR_NAME[color] + " $" + amount * (double ? 2 : 1) + "M";
            if (PD.isAnyColor(card)) out.push({ label, step: { color, double } });
            else final(label, { as: "rent", color, double });
          });
        });
      } else {
        others.forEach((target) => final("Charge " + name(state, target), { as: "rent", color: draft.color, double: draft.double, target }));
      }
    } else if (card.kind === "action") {
      const loose = (s) => PD.loosePropertyIds(state.tables[s]).map((id) => PD.locate(state.tables[s], id));
      switch (card.type) {
        case "bonusdraw": final("Draw 2", { as: "action" }); break;
        case "birthday": final("Birthday: $2M from everyone", { as: "action" }); break;
        case "debt": others.forEach((t) => final("Collect $5M from " + name(state, t), { as: "action", target: t })); break;
        case "steal":
          others.forEach((t) => loose(t).forEach(({ card: c, where }) =>
            final("Steal " + name(state, t) + "'s " + propName(c, where), { as: "action", target: t, theirId: c.id })));
          break;
        case "swap":
          if (draft.theirId == null) {
            others.forEach((t) => loose(t).forEach(({ card: c, where }) => {
              if (PD.loosePropertyIds(state.tables[seat]).length) out.push({ label: "Take " + name(state, t) + "'s " + propName(c, where), step: { target: t, theirId: c.id } });
            }));
          } else {
            loose(seat).forEach(({ card: c, where }) =>
              final("Give my " + propName(c, where), { as: "action", target: draft.target, theirId: draft.theirId, myId: c.id }));
          }
          break;
        case "setgrab":
          others.forEach((t) => PD.fullColors(state.tables[t]).forEach((color) =>
            final("Grab " + name(state, t) + "'s " + PD.COLOR_NAME[color] + " set", { as: "action", target: t, color })));
          break;
        case "house": case "hotel":
          PD.COLORS.forEach((color) => final((card.type === "house" ? "House on " : "Hotel on ") + PD.COLOR_NAME[color], { as: "action", color }));
          break;
        default: break; // Block and Double Rent can only be banked here
      }
    }
    return dedupeLabels(out);
  }

  function actionButtons(state, seat) {
    if (PD.actingSeat(state) !== seat) return [];
    const u = ui(state);
    if (state.phase === "respond") {
      return [
        { label: "Block", primary: true, disabled: !PD.holdsBlock(state, seat), onClick: () => PD.respond(state, seat, true) },
        { label: "Let it happen", onClick: () => PD.respond(state, seat, false) },
      ];
    }
    if (state.phase === "pay") {
      const owed = state.pending.effect.amount;
      const picked = PD.payable(state.tables[seat]).filter((x) => u.paySel.has(x.card.id));
      const total = picked.reduce((s, x) => s + x.card.value, 0);
      return [
        { label: "Pay $" + total + "M of $" + owed + "M", primary: true, disabled: total < owed,
          onClick: () => { PD.pay(state, seat, picked.map((x) => x.card.id)); u.paySel = new Set(); } },
        { label: "Clear", disabled: picked.length === 0, onClick: () => { u.paySel = new Set(); } },
      ];
    }
    if (state.phase !== "play") return [];
    const card = u.draft && state.hands[seat].find((c) => c.id === u.draft.id);
    if (card) {
      return choices(state, seat, card, u.draft).map((c) => ({
        label: c.label,
        primary: !!c.opt && c.opt.as !== "bank",
        opt: c.opt,
        step: c.step,
        onClick: () => {
          if (c.step) { Object.assign(u.draft, c.step); u.draft.step += 1; return; }
          u.draft = null;
          PD.playCard(state, seat, card.id, c.opt);
        },
      })).concat([{ label: "Cancel", onClick: () => { u.draft = null; } }]);
    }
    const t = state.tables[seat];
    const moves = [];
    PD.COLORS.forEach((from) => {
      if (t.sets[from].house) return;
      t.sets[from].cards.filter(PD.isWild).forEach((c) => c.colors.forEach((to) => {
        if (to !== from) moves.push({ label: propName(c, from) + " → " + PD.COLOR_NAME[to], move: { id: c.id, color: to }, onClick: () => { u.moving = false; PD.moveWild(state, seat, c.id, to); } });
      }));
    });
    // An any-colour wild can go to nine colours, so the moves wait behind one button.
    if (u.moving && moves.length) return dedupeLabels(moves).concat([{ label: "Cancel", onClick: () => { u.moving = false; } }]);
    const buttons = [{ label: "End Turn", primary: state.plays >= PD.PLAYS_PER_TURN, onClick: () => PD.endTurn(state, seat) }];
    if (moves.length) buttons.push({ label: "Move a wild…", onClick: () => { u.moving = true; } });
    return buttons;
  }

  // ---------------------------------------------------------- table chrome

  function centerNode(state) {
    const top = state.discard[state.discard.length - 1];
    const children = [
      DOM.el("div", "center-label", "Three full sets win"),
      DOM.el("div", "pile-row", [
        DOM.el("div", "pile-col", [DOM.cardEl(null, { faceDown: true }), DOM.el("div", "pile-caption", "Draw " + state.drawPile.length)]),
        DOM.el("div", "pile-col", [top ? DOM.cardEl(top, { renderFace }) : DOM.el("div", "card card-slot"), DOM.el("div", "pile-caption", "Discards")]),
      ]),
    ];
    if (!state.gameOver && state.phase === "play") {
      children.push(DOM.el("div", "pile-caption", "Plays left: " + (PD.PLAYS_PER_TURN - state.plays)));
    }
    if (state.pending) {
      const p = state.pending;
      const e = p.effect;
      const what = e.type === "pay" ? "$" + e.amount + "M for " + e.why : e.type === "steal" ? "a Steal" : e.type === "swap" ? "a Swap" : "a Set Grab";
      children.push(DOM.el("div", "pd-prompt", name(state, p.from) + " → " + name(state, p.targets[p.idx]) + ": " + what +
        (p.blocks ? " (Blocked " + p.blocks + "×)" : "")));
    }
    return DOM.el("div", "deck-center", children);
  }

  function statusLine(state) {
    if (state.gameOver) return name(state, state.winner) + " wins - final standings below.";
    const seat = PD.actingSeat(state);
    const who = name(state, seat);
    if (state.phase === "respond") return who + ": Block it, or let it happen?";
    if (state.phase === "pay") return who + ": pick cards from your table worth $" + state.pending.effect.amount + "M (no change given).";
    if (state.phase === "discard") return who + ": discard down to " + PD.HAND_LIMIT + " cards.";
    const d = state.ui && state.ui.draft;
    if (d) return who + ": choose how to play the card, or Cancel.";
    return who + ": play a card (" + (PD.PLAYS_PER_TURN - state.plays) + " left) or End Turn.";
  }

  function seatTag(state, seat) {
    return PD.fullColors(state.tables[seat]).length + "/3 sets";
  }

  function standings(state) {
    return state.seats
      .map((s, i) => ({ name: s.name, detail: PD.fullColors(state.tables[i]).length + " full sets, $" + PD.payableTotal(state.tables[i]) + "M on the table", score: -PD.rank(state, i) - (i === state.winner ? 1e6 : 0) }))
      .sort((a, b) => a.score - b.score);
  }

  root.PROPERTY_DEAL_UI = {
    key: "property-deal", label: "Property Deal", seatMin: 2, seatMax: 4, seatFixed: false,
    tagline: "Bank money, lay down properties and charge rent. Steal, swap and grab sets - Block what's aimed at you. Three full sets wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons, cardTag, renderFace, seatExtra,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
