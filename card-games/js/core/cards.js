// Shared 52-card model used by every game engine. Framework-agnostic (no DOM).
(function (root) {
  "use strict";

  const SUITS = ["C", "D", "H", "S"]; // clubs, diamonds, hearts, spades
  const SUIT_GLYPH = { C: "♣", D: "♦", H: "♥", S: "♠" };
  const SUIT_NAME = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };
  const RED_SUITS = { D: true, H: true };

  // rank is a numeric value 2-14 (2..10, J=11, Q=12, K=13, A=14).
  const RANK_LABEL = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10",
    11: "J", 12: "Q", 13: "K", 14: "A",
  };

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ suit, rank, id: rank + suit });
      }
    }
    return deck;
  }

  // mulberry32 - small deterministic PRNG so tests can reproduce a shuffle.
  function makeRng(seed) {
    let a = seed >>> 0 || 1;
    return function rng() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    const rand = rng || Math.random;
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function dealEven(deck, seatCount) {
    const hands = Array.from({ length: seatCount }, () => []);
    deck.forEach((card, i) => hands[i % seatCount].push(card));
    return hands;
  }

  function rankLabel(rank) { return RANK_LABEL[rank]; }
  function suitGlyph(suit) { return SUIT_GLYPH[suit]; }
  function suitName(suit) { return SUIT_NAME[suit]; }
  function isRed(suit) { return !!RED_SUITS[suit]; }
  function cardLabel(card) { return rankLabel(card.rank) + suitGlyph(card.suit); }

  // President ordering: 3 is lowest, Ace is second-highest, 2 is highest.
  function presidentValue(card) { return card.rank === 2 ? 15 : card.rank; }

  function sortByRank(cards) {
    return cards.slice().sort((a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  }

  function sortForPresident(cards) {
    return cards.slice().sort((a, b) => presidentValue(a) - presidentValue(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  }

  function removeCard(hand, card) {
    const idx = hand.findIndex((c) => c.id === card.id);
    if (idx === -1) throw new Error("card not in hand: " + card.id);
    hand.splice(idx, 1);
  }

  const api = {
    SUITS, RANK_LABEL,
    buildDeck, makeRng, shuffle, dealEven,
    rankLabel, suitGlyph, suitName, isRed, cardLabel,
    presidentValue, sortByRank, sortForPresident, removeCard,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.CARDS = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
