// Generic DOM helpers shared by every game's UI layer. Browser-only.
(function (root) {
  "use strict";
  const CARDS = root.CARDS;

  function el(tag, className, children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (children) {
      for (const c of [].concat(children)) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  // Face of a standard 52-card-deck card ({suit, rank}).
  function standardFace(card, face) {
    face.classList.add(CARDS.isRed(card.suit) ? "card-red" : "card-black");
    face.appendChild(el("div", "card-corner card-corner-tl", [
      el("div", "card-rank", CARDS.rankLabel(card.rank)),
      el("div", "card-suit", CARDS.suitGlyph(card.suit)),
    ]));
    face.appendChild(el("div", "card-pip", CARDS.suitGlyph(card.suit)));
    face.appendChild(el("div", "card-corner card-corner-br", [
      el("div", "card-rank", CARDS.rankLabel(card.rank)),
      el("div", "card-suit", CARDS.suitGlyph(card.suit)),
    ]));
  }

  // Renders one card. `card` is null for a face-down/back-only card.
  // `opts.renderFace(card, faceEl)` draws a game's own deck (one that isn't
  // suits and ranks) onto the shared card frame, so selection, disabled,
  // small and tag styling stay identical across every game.
  function cardEl(card, opts) {
    opts = opts || {};
    const face = el("div", "card" + (opts.faceDown || !card ? " card-back" : "") +
      (opts.disabled ? " card-disabled" : "") + (opts.selected ? " card-selected" : "") +
      (opts.small ? " card-small" : ""));
    if (!opts.faceDown && card) (opts.renderFace || standardFace)(card, face);
    if (opts.tag) face.appendChild(el("div", "card-tag", opts.tag));
    if (opts.onClick) face.addEventListener("click", opts.onClick);
    if (opts.title) face.title = opts.title;
    return face;
  }

  function renderFan(container, cards, opts) {
    opts = opts || {};
    container.innerHTML = "";
    cards.forEach((card) => {
      const disabled = opts.isDisabled ? opts.isDisabled(card) : false;
      const selected = opts.isSelected ? opts.isSelected(card) : false;
      const tag = opts.tag ? opts.tag(card) : null;
      container.appendChild(cardEl(card, {
        faceDown: opts.faceDown,
        disabled,
        selected,
        small: opts.small,
        renderFace: opts.renderFace,
        tag,
        onClick: opts.onCard && !disabled ? () => opts.onCard(card) : null,
      }));
    });
  }

  // Seat order starting from the human/current seat and going clockwise,
  // mapped to table positions for 2, 3 or 4 total seats.
  const SEAT_LAYOUT = {
    2: ["bottom", "top"],
    3: ["bottom", "left", "right"],
    4: ["bottom", "left", "top", "right"],
  };

  function seatPosition(seatCount, offsetFromViewer) {
    return SEAT_LAYOUT[seatCount][offsetFromViewer];
  }

  // Trick-taking felt: each play sits on the table side of its seat, measured
  // clockwise from `anchorSeat` (which lands at the bottom).
  function trickArea(plays, anchorSeat, seatCount) {
    const wrap = el("div", "trick-area");
    plays.forEach((play) => {
      const pos = seatPosition(seatCount, (play.seat - anchorSeat + seatCount) % seatCount);
      wrap.appendChild(el("div", "trick-slot pos-" + pos, cardEl(play.card, {})));
    });
    return wrap;
  }

  function clear(node) { node.innerHTML = ""; }

  const api = { el, cardEl, renderFan, seatPosition, trickArea, clear };
  root.DOM = api;
})(typeof window !== "undefined" ? window : globalThis);
