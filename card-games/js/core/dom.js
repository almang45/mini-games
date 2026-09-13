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

  // Renders one playing card. `card` is null for a face-down/back-only card.
  function cardEl(card, opts) {
    opts = opts || {};
    const face = el("div", "card" + (opts.faceDown || !card ? " card-back" : "") +
      (opts.disabled ? " card-disabled" : "") + (opts.selected ? " card-selected" : "") +
      (opts.small ? " card-small" : ""));
    if (!opts.faceDown && card) {
      const red = CARDS.isRed(card.suit);
      face.classList.add(red ? "card-red" : "card-black");
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

  function clear(node) { node.innerHTML = ""; }

  const api = { el, cardEl, renderFan, seatPosition, clear };
  root.DOM = api;
})(typeof window !== "undefined" ? window : globalThis);
