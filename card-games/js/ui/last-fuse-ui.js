// Last Fuse table binding. Click a card to see what it can do (a Favor or a
// cat combo then asks who to take from, and a triple asks what to name);
// press Draw to end the turn. A defused Bomb goes back through position
// buttons, a Favor is given by clicking a card, and a Nope window offers
// Nope / Let it happen.
//
// UI-only state (the card being played) lives in state.ui.
(function (root) {
  "use strict";
  const LF = root.LAST_FUSE;
  const DOM = root.DOM;

  const SHORT = {
    bomb: "BOMB", defuse: "Defuse", attack: "Attack", skip: "Skip", favor: "Favor", shuffle: "Shuffle",
    future: "Future", nope: "Nope", tabby: "Tabby", calico: "Calico", siamese: "Siamese", sphynx: "Sphynx", ginger: "Ginger",
  };
  const GLYPH = {
    bomb: "💣︎", defuse: "✂", attack: "⚔", skip: "⏭︎", favor: "🤲︎", shuffle: "⇄",
    future: "👁︎", nope: "✋︎", tabby: "🐈︎", calico: "🐈︎", siamese: "🐈︎", sphynx: "🐈︎", ginger: "🐈︎",
  };
  const ORDER = ["defuse", "nope", "attack", "skip", "future", "shuffle", "favor"].concat(LF.CATS);

  const ui = (state) => state.ui || (state.ui = { draft: null });
  const name = (state, seat) => state.seats[seat].name;

  function create(seatTypes) { return LF.createGame(seatTypes); }
  function actingSeat(state) { return LF.actingSeat(state); }
  function isInterim() { return false; }
  function stepAI(state, seat) { ui(state).draft = null; LF.stepAI(state, seat); }

  function handOf(state, seat) {
    return state.hands[seat].slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }

  function renderFace(card, face) {
    face.classList.add("lf-card", "lf-" + card.kind);
    if (LF.isCat(card.kind)) face.classList.add("lf-cat");
    face.title = LF.NAME[card.kind];
    face.appendChild(DOM.el("div", "lf-glyph", GLYPH[card.kind]));
    face.appendChild(DOM.el("div", "lf-label", SHORT[card.kind]));
  }

  // ----------------------------------------------------------- playing

  function onCardClick(state, seat, card) {
    if (LF.actingSeat(state) !== seat) return;
    if (state.phase === "favor") return LF.giveFavor(state, seat, card.id);
    if (state.phase !== "play") return undefined;
    const u = ui(state);
    u.draft = u.draft && u.draft.id === card.id ? null : { id: card.id, step: 0 };
    return undefined;
  }

  function isCardSelected(state, seat, card) { const d = ui(state).draft; return !!d && d.id === card.id; }
  function isCardDisabled(state, seat, card) {
    if (LF.actingSeat(state) !== seat) return true;
    if (state.phase === "favor") return false;
    if (state.phase !== "play") return true;
    return ["defuse", "nope"].includes(card.kind);
  }
  function cardTag(state, seat) { return state.phase === "favor" && LF.actingSeat(state) === seat ? "give" : null; }

  // What the drafted card can do at its current step.
  function choices(state, seat, card, draft) {
    const out = [];
    const others = LF.opponents(state, seat);
    const play = (label, opt) => { if (!LF.playError(state, seat, card, opt)) out.push({ label, opt }); };
    if (LF.isCat(card.kind)) {
      const same = state.hands[seat].filter((c) => c.kind === card.kind).map((c) => c.id);
      const ids = [card.id].concat(same.filter((id) => id !== card.id));
      if (draft.target == null) {
        others.forEach((t) => {
          if (same.length >= 2) play("Pair: random card from " + name(state, t), { target: t, ids: ids.slice(0, 2) });
          if (same.length >= 3) out.push({ label: "Three: name a card from " + name(state, t), step: { target: t } });
        });
      } else {
        Object.keys(LF.NAME).filter((k) => k !== "bomb").forEach((k) =>
          play("Ask for " + LF.NAME[k], { target: draft.target, ids: ids.slice(0, 3), name: k }));
      }
    } else if (card.kind === "favor") {
      others.forEach((t) => play("Favor from " + name(state, t), { target: t }));
    } else if (!["defuse", "nope"].includes(card.kind)) {
      play("Play " + LF.NAME[card.kind], {});
    }
    return out;
  }

  // Positions offered for a defused Bomb, 0 being the top of the pile.
  function insertSpots(state) {
    const n = state.draw.length;
    const spots = [["Top", 0], ["2nd from top", 1], ["3rd from top", 2], ["Middle", Math.floor(n / 2)], ["Bottom", n]]
      .filter(([, p]) => p <= n);
    const seen = new Set();
    return spots.filter(([, p]) => (seen.has(p) ? false : seen.add(p)));
  }

  function actionButtons(state, seat) {
    if (LF.actingSeat(state) !== seat) return [];
    const u = ui(state);
    if (state.phase === "respond") {
      return [
        { label: "Nope", primary: true, disabled: !state.hands[seat].some((c) => c.kind === "nope"), onClick: () => LF.respond(state, seat, true) },
        { label: "Let it happen", onClick: () => LF.respond(state, seat, false) },
      ];
    }
    if (state.phase === "insert") {
      const rand = Math.random;
      return insertSpots(state).map(([label, p]) => ({ label, primary: p === 0, onClick: () => LF.insertBomb(state, seat, p) }))
        .concat([{ label: "Random spot", onClick: () => LF.insertBomb(state, seat, Math.floor(rand() * (state.draw.length + 1))) }]);
    }
    if (state.phase !== "play") return [];
    const card = u.draft && state.hands[seat].find((c) => c.id === u.draft.id);
    if (card) {
      return choices(state, seat, card, u.draft).map((c) => ({
        label: c.label,
        primary: !!c.opt,
        opt: c.opt,
        step: c.step,
        onClick: () => {
          if (c.step) { Object.assign(u.draft, c.step); u.draft.step += 1; return; }
          u.draft = null;
          LF.playCard(state, seat, card.id, c.opt);
        },
      })).concat([{ label: "Cancel", onClick: () => { u.draft = null; } }]);
    }
    return [{ label: state.turnsLeft > 1 ? "Draw (" + state.turnsLeft + " turns left)" : "Draw", primary: true, onClick: () => LF.drawCard(state, seat) }];
  }

  // ------------------------------------------------------------ table chrome

  function centerNode(state, anchor) {
    const top = state.discard[state.discard.length - 1];
    const children = [
      DOM.el("div", "center-label", "Bombs in the pile: " + LF.bombsInPile(state)),
      DOM.el("div", "pile-row", [
        DOM.el("div", "pile-col", [DOM.cardEl(null, { faceDown: true }), DOM.el("div", "pile-caption", "Draw " + state.draw.length)]),
        DOM.el("div", "pile-col", [top ? DOM.cardEl(top, { renderFace }) : DOM.el("div", "card card-slot"), DOM.el("div", "pile-caption", "Discards")]),
      ]),
    ];
    // What this device's player knows of the pile: theirs alone. The run of
    // known cards from the top is shown face up; anything further down (a
    // Bomb they put back deep) is named with its place.
    const viewer = anchor;
    const seen = viewer != null && state.seats[viewer].type === "human" ? state.known[viewer] : [];
    const byId = new Map(state.draw.map((c) => [c.id, c]));
    const run = [];
    while (run.length < seen.length && seen[run.length] !== null) run.push(byId.get(seen[run.length]));
    const deeper = seen.map((id, pos) => ({ id, pos })).slice(run.length).filter((e) => e.id !== null);
    if (run.length || deeper.length) {
      const parts = [];
      if (run.length) {
        parts.push(DOM.el("span", "pile-caption", "Top of the pile (only you know):"),
          DOM.el("div", "lf-peek-row", run.map((c) => DOM.cardEl(c, { renderFace, small: true }))));
      }
      deeper.forEach((e) => parts.push(DOM.el("span", "pile-caption",
        "Only you know: " + ordinal(e.pos + 1) + " from the top is a " + LF.NAME[byId.get(e.id).kind] + ".")));
      children.push(DOM.el("div", "lf-peek", parts));
    }
    if (state.pending && state.pending.action) {
      children.push(DOM.el("div", "lf-prompt", state.pending.action.label + (state.pending.nopes ? " — Noped ×" + state.pending.nopes : "")));
    }
    return DOM.el("div", "deck-center", children);
  }

  function statusLine(state) {
    if (state.gameOver) return name(state, state.winner) + " is the last one standing.";
    const seat = LF.actingSeat(state);
    const who = name(state, seat);
    if (state.phase === "respond") return who + ": Nope it, or let it happen?";
    if (state.phase === "favor") return who + ": pick a card to give " + name(state, state.pending.actor) + ".";
    if (state.phase === "insert") return who + ": where does the Bomb go back? Only you will know.";
    const d = state.ui && state.ui.draft;
    if (d) return who + ": choose how to play it, or Cancel.";
    return who + ": play cards, then Draw" + (state.turnsLeft > 1 ? " (" + state.turnsLeft + " turns to take)" : "") + ".";
  }

  function seatTag(state, seat) {
    if (!state.alive[seat]) return "OUT";
    const n = state.hands[seat].length;
    return n + (n === 1 ? " card" : " cards") + (state.turn === seat && state.turnsLeft > 1 ? " · " + state.turnsLeft + " turns" : "");
  }

  const ordinal = (k) => k + (k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th");

  function standings(state) {
    // Winner first, then the later someone exploded, the better.
    const place = (i) => (i === state.winner ? 100 : state.out.indexOf(i));
    return state.seats
      .map((s, i) => ({ name: s.name, detail: i === state.winner ? "Last one standing" : "Exploded " + ordinal(state.out.indexOf(i) + 1), score: -place(i) }))
      .sort((a, b) => a.score - b.score);
  }

  root.LAST_FUSE_UI = {
    key: "last-fuse", label: "Last Fuse", seatMin: 2, seatMax: 4, seatFixed: false,
    tagline: "Play cards, then draw - and hope it's not a Bomb. Defuse, skip, attack, peek and steal. Last one standing wins.",
    create, actingSeat, isInterim, handOf, stepAI,
    onCardClick, isCardSelected, isCardDisabled, actionButtons, cardTag, renderFace,
    centerNode, statusLine, seatTag, standings,
  };
})(typeof window !== "undefined" ? window : globalThis);
