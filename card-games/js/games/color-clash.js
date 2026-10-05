// Color Clash engine - shed-your-hand with the Uno rules. 2-4 seats.
// 108-card deck: in each of four colours one 0, two each of 1-9, Skip,
// Reverse and Draw Two; plus four Wild and four Wild Draw Four. Match the
// discard by colour, number or symbol. The first seat out scores every card
// left in the other hands; first to 500 wins.
//
// Wild Draw Four may be played at any time, but it's only honest with no card
// of the current colour in hand. The next seat may challenge it: a bluffer
// draws the four instead; an honest play costs the challenger six.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const COLORS = ["R", "Y", "G", "B"];
  const COLOR_NAME = { R: "Red", Y: "Yellow", G: "Green", B: "Blue" };
  const ACTIONS = ["skip", "reverse", "draw2"];
  const KIND_LABEL = { skip: "Skip", reverse: "Reverse", draw2: "Draw Two", wild: "Wild", wild4: "Wild Draw Four" };
  const HAND_SIZE = 7;
  const TARGET = 500;

  let nextCardId = 0;
  function card(kind, color, value) {
    return { kind, color: color || null, value: kind === "number" ? value : null, id: kind + (color || "") + (value != null ? value : "") + "-" + nextCardId++ };
  }

  function buildDeck() {
    const deck = [];
    COLORS.forEach((color) => {
      deck.push(card("number", color, 0));
      for (let v = 1; v <= 9; v++) deck.push(card("number", color, v), card("number", color, v));
      ACTIONS.forEach((kind) => deck.push(card(kind, color), card(kind, color)));
    });
    for (let k = 0; k < 4; k++) deck.push(card("wild"), card("wild4"));
    return deck;
  }

  const isWild = (c) => c.kind === "wild" || c.kind === "wild4";

  function cardLabel(c) {
    const face = c.kind === "number" ? String(c.value) : KIND_LABEL[c.kind];
    return c.color ? COLOR_NAME[c.color] + " " + face : face;
  }

  function cardPoints(c) {
    if (c.kind === "number") return c.value;
    return isWild(c) ? 50 : 20;
  }

  const say = (state, text) => state.log.push({ text, fresh: true });
  const nameOf = (state, seat) => state.seats[seat].name;
  const n = (state) => state.seats.length;

  function createGame(seatTypes, opts) {
    if (seatTypes.length < 2 || seatTypes.length > 4) throw new Error("Color Clash supports 2-4 seats");
    return {
      game: "color-clash",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1), score: 0 })),
      rng: opts && opts.rng,
      hands: seatTypes.map(() => []),
      drawPile: [],
      discard: [],
      color: null,
      direction: 1,
      // Seat 1 deals first, so seat 2 plays first.
      dealer: seatTypes.length - 1,
      handNo: 0,
      turnSeat: null,
      drawn: null,
      pending: null,
      phase: "hand-over",
      handWinner: null,
      gameOver: false,
      winner: null,
      log: [{ text: "Color Clash - first to " + TARGET + ". Deal to begin.", fresh: true }],
    };
  }

  function topCard(state) { return state.discard[state.discard.length - 1]; }

  function stepFrom(state, seat, steps) {
    const count = n(state);
    return (((seat + state.direction * steps) % count) + count) % count;
  }

  // Draws from the pile, reshuffling the discards under the top card when it
  // runs dry. Returns null only when every card is in someone's hand.
  function drawOne(state) {
    if (state.drawPile.length === 0) {
      if (state.discard.length <= 1) return null;
      const top = state.discard.pop();
      state.drawPile = CARDS.shuffle(state.discard, state.rng);
      state.discard = [top];
      say(state, "The draw pile ran out - the discards are reshuffled.");
    }
    return state.drawPile.pop();
  }

  function give(state, seat, count) {
    let got = 0;
    for (; got < count; got++) {
      const c = drawOne(state);
      if (!c) break;
      state.hands[seat].push(c);
    }
    return got;
  }

  // ---------------------------------------------------------------- a hand

  function dealHand(state, opts) {
    if (state.gameOver) throw new Error("game is over");
    if (state.phase !== "hand-over") throw new Error("current hand has not finished");
    state.handNo += 1;
    state.dealer = (state.dealer + 1) % n(state);
    state.direction = 1;
    state.drawPile = (opts && opts.deck) ? opts.deck.slice() : CARDS.shuffle(buildDeck(), state.rng);
    state.discard = [];
    state.hands = state.seats.map(() => []);
    state.drawn = null;
    state.pending = null;
    state.handWinner = null;
    for (let k = 0; k < HAND_SIZE; k++) state.seats.forEach((s, i) => state.hands[(state.dealer + 1 + i) % n(state)].push(drawOne(state)));
    // A Wild Draw Four can't start the discard: it goes back and another is turned.
    let starter = state.drawPile.pop();
    while (starter.kind === "wild4") {
      state.drawPile.unshift(starter);
      starter = state.drawPile.pop();
    }
    state.discard.push(starter);
    state.color = starter.color;
    say(state, "Hand " + state.handNo + " - " + nameOf(state, state.dealer) + " deals. " + cardLabel(starter) + " starts the discard.");
    const first = stepFrom(state, state.dealer, 1);
    state.phase = "play";
    if (starter.kind === "wild") {
      state.turnSeat = first;
      state.pending = { type: "color", seat: first, starter: true };
      state.phase = "color";
    } else if (starter.kind === "reverse") {
      // The dealer goes first and play runs the other way (with two seats
      // that's the same as skipping the first player).
      state.direction = -1;
      state.turnSeat = state.dealer;
    } else if (starter.kind === "skip") {
      state.turnSeat = stepFrom(state, first, 1);
    } else if (starter.kind === "draw2") {
      give(state, first, 2);
      say(state, nameOf(state, first) + " draws 2 and is skipped.");
      state.turnSeat = stepFrom(state, first, 1);
    } else {
      state.turnSeat = first;
    }
  }

  function isPlayable(state, c) {
    if (isWild(c)) return true;
    const top = topCard(state);
    if (c.color === state.color) return true;
    if (c.kind === "number") return top.kind === "number" && top.value === c.value;
    return c.kind === top.kind;
  }

  // An honest Wild Draw Four: no card of the current colour in hand.
  function wild4IsHonest(state, seat) {
    return !state.hands[seat].some((c) => c.color === state.color);
  }

  function legalPlays(state, seat) {
    if (state.phase === "drawn" && state.turnSeat === seat) return isPlayable(state, state.drawn) ? [state.drawn] : [];
    if (state.phase !== "play" || state.turnSeat !== seat) return [];
    return state.hands[seat].filter((c) => isPlayable(state, c));
  }

  function requirePhase(state, phase, seat) {
    if (state.gameOver || state.phase !== phase) throw new Error("not the " + phase + " phase");
    const actor = phase === "challenge" ? state.pending.victim : phase === "color" ? state.pending.seat : state.turnSeat;
    if (actor !== seat) throw new Error("not this seat's move");
  }

  function playCard(state, seat, cardId) {
    if (!["play", "drawn"].includes(state.phase)) throw new Error("not the play phase");
    requirePhase(state, state.phase, seat);
    const hand = state.hands[seat];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx === -1) throw new Error("card not in hand");
    const c = hand[idx];
    if (state.phase === "drawn" && c.id !== state.drawn.id) throw new Error("only the drawn card can be played");
    if (!isPlayable(state, c)) throw new Error("card does not match the discard");
    const honest = c.kind !== "wild4" || hand.filter((x) => x !== c).every((x) => x.color !== state.color);
    const prevColor = state.color;
    hand.splice(idx, 1);
    state.discard.push(c);
    state.drawn = null;
    say(state, nameOf(state, seat) + " plays " + cardLabel(c) + ".");
    if (hand.length === 1) say(state, nameOf(state, seat) + " has one card left!");

    if (hand.length === 0) {
      // The last card's draw penalty still lands, so it counts in the score.
      const victim = stepFrom(state, seat, 1);
      if (c.kind === "draw2" || c.kind === "wild4") {
        const count = c.kind === "draw2" ? 2 : 4;
        give(state, victim, count);
        say(state, nameOf(state, victim) + " draws " + count + ".");
      }
      endHand(state, seat);
      return;
    }

    if (isWild(c)) {
      state.pending = { type: "color", seat, card: c, honest, prevColor };
      state.phase = "color";
      return;
    }
    state.color = c.color;
    applyEffect(state, seat, c);
  }

  function applyEffect(state, seat, c) {
    state.phase = "play";
    if (c.kind === "skip") {
      say(state, nameOf(state, stepFrom(state, seat, 1)) + " is skipped.");
      state.turnSeat = stepFrom(state, seat, 2);
    } else if (c.kind === "reverse") {
      state.direction *= -1;
      // With two seats a Reverse works like a Skip.
      state.turnSeat = n(state) === 2 ? seat : stepFrom(state, seat, 1);
    } else if (c.kind === "draw2") {
      const victim = stepFrom(state, seat, 1);
      give(state, victim, 2);
      say(state, nameOf(state, victim) + " draws 2 and is skipped.");
      state.turnSeat = stepFrom(state, seat, 2);
    } else {
      state.turnSeat = stepFrom(state, seat, 1);
    }
  }

  function chooseColor(state, seat, color) {
    requirePhase(state, "color", seat);
    if (!COLORS.includes(color)) throw new Error("unknown colour " + color);
    const p = state.pending;
    state.color = color;
    say(state, nameOf(state, seat) + " picks " + COLOR_NAME[color] + ".");
    state.pending = null;
    if (p.starter) { state.phase = "play"; return; }
    if (p.card.kind === "wild4") {
      state.pending = { type: "challenge", offender: seat, victim: stepFrom(state, seat, 1), honest: p.honest, prevColor: p.prevColor };
      state.phase = "challenge";
      return;
    }
    applyEffect(state, seat, p.card);
  }

  // The seat hit by a Wild Draw Four: take the four, or challenge it.
  function respondToWild4(state, seat, challenge) {
    requirePhase(state, "challenge", seat);
    const { offender, victim, honest, prevColor } = state.pending;
    state.pending = null;
    state.phase = "play";
    if (!challenge) {
      give(state, victim, 4);
      say(state, nameOf(state, victim) + " draws 4 and is skipped.");
      state.turnSeat = stepFrom(state, victim, 1);
    } else if (honest) {
      give(state, victim, 6);
      say(state, nameOf(state, victim) + " challenges, but " + nameOf(state, offender) + " had no " + COLOR_NAME[prevColor] + " - " +
        nameOf(state, victim) + " draws 6 and is skipped.");
      state.turnSeat = stepFrom(state, victim, 1);
    } else {
      give(state, offender, 4);
      say(state, nameOf(state, victim) + " challenges and wins - " + nameOf(state, offender) + " was holding " +
        COLOR_NAME[prevColor] + " and draws 4.");
      state.turnSeat = victim;
    }
  }

  // Draw one card. A playable one may be played straight away or kept.
  function draw(state, seat) {
    requirePhase(state, "play", seat);
    const c = drawOne(state);
    if (!c) {
      say(state, "Nothing left to draw - " + nameOf(state, seat) + " passes.");
      state.turnSeat = stepFrom(state, seat, 1);
      return null;
    }
    state.hands[seat].push(c);
    say(state, nameOf(state, seat) + " draws a card.");
    if (isPlayable(state, c)) {
      state.drawn = c;
      state.phase = "drawn";
    } else {
      state.turnSeat = stepFrom(state, seat, 1);
    }
    return c;
  }

  function keepDrawn(state, seat) {
    requirePhase(state, "drawn", seat);
    state.drawn = null;
    state.phase = "play";
    say(state, nameOf(state, seat) + " keeps it.");
    state.turnSeat = stepFrom(state, seat, 1);
  }

  function endHand(state, seat) {
    const points = state.hands.reduce((sum, h, i) => (i === seat ? sum : sum + h.reduce((s, c) => s + cardPoints(c), 0)), 0);
    state.seats[seat].score += points;
    state.handWinner = seat;
    state.phase = "hand-over";
    state.turnSeat = null;
    state.pending = null;
    say(state, nameOf(state, seat) + " goes out and scores " + points + " (" + state.seats[seat].score + ").");
    if (state.seats[seat].score >= TARGET) {
      state.gameOver = true;
      state.winner = seat;
      say(state, nameOf(state, seat) + " wins the game.");
    }
  }

  function actingSeat(state) {
    if (state.gameOver || state.phase === "hand-over") return null;
    if (state.phase === "color") return state.pending.seat;
    if (state.phase === "challenge") return state.pending.victim;
    return state.turnSeat;
  }

  // --------------------------------------------------------------------- AI

  function colorCounts(hand) {
    const counts = { R: 0, Y: 0, G: 0, B: 0 };
    hand.forEach((c) => { if (c.color) counts[c.color] += 1; });
    return counts;
  }

  function aiChooseColor(state, seat) {
    const counts = colorCounts(state.hands[seat]);
    return COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
  }

  // Keep wilds for when nothing else fits. Go after a seat close to going
  // out with Skip/Draw Two; otherwise shed high points from the colour held
  // most, so later turns keep having a match.
  function aiChoosePlay(state, seat) {
    const legal = legalPlays(state, seat);
    if (legal.length === 0) return null;
    const hand = state.hands[seat];
    const counts = colorCounts(hand);
    const nextSize = state.hands[stepFrom(state, seat, 1)].length;
    const honest4 = wild4IsHonest(state, seat);
    const score = (c) => {
      if (c.kind === "wild4") return honest4 || nextSize <= 1 ? -50 + (nextSize <= 2 ? 80 : 0) : -1000;
      if (c.kind === "wild") return -40;
      let s = counts[c.color] * 3 + cardPoints(c) / 10;
      if (nextSize <= 2 && (c.kind === "draw2" || c.kind === "skip")) s += 30;
      if (nextSize <= 2 && c.kind === "reverse" && n(state) > 2) s += 10;
      return s;
    };
    const best = legal.reduce((a, b) => (score(b) > score(a) ? b : a));
    return score(best) <= -1000 ? null : best;
  }

  // Chance the Wild Draw Four was a bluff: at least one of the offender's
  // cards is of the old colour, judged from the cards this seat can't see.
  // Each colour has 25 cards; wilds have none.
  function bluffChance(state, seat) {
    const { offender, prevColor } = state.pending;
    const seen = state.hands[seat].concat(state.discard);
    const unseen = 108 - seen.length;
    const unseenColor = 25 - seen.filter((c) => c.color === prevColor).length;
    const share = unseen > 0 ? unseenColor / unseen : 0;
    return 1 - Math.pow(1 - share, state.hands[offender].length);
  }

  function aiShouldChallenge(state, seat) {
    // Losing costs 2 more cards; winning moves 4 onto the offender and keeps
    // this seat's turn, so challenge only on a likely bluff.
    return bluffChance(state, seat) > 0.6;
  }

  function stepAI(state, seat) {
    if (state.phase === "color") return chooseColor(state, seat, aiChooseColor(state, seat));
    if (state.phase === "challenge") return respondToWild4(state, seat, aiShouldChallenge(state, seat));
    if (state.phase === "drawn") {
      const c = state.drawn;
      return c.kind === "wild4" && !wild4IsHonest(state, seat) ? keepDrawn(state, seat) : playCard(state, seat, c.id);
    }
    const choice = aiChoosePlay(state, seat);
    if (choice) return playCard(state, seat, choice.id);
    const drawnCard = draw(state, seat);
    if (drawnCard && state.phase === "drawn") stepAI(state, seat);
  }

  const api = {
    COLORS, COLOR_NAME, TARGET,
    card, buildDeck, cardLabel, cardPoints, isWild, topCard,
    createGame, dealHand, isPlayable, legalPlays, playCard, chooseColor, respondToWild4, draw, keepDrawn, actingSeat,
    aiChoosePlay, aiChooseColor, aiShouldChallenge, bluffChance, stepAI,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.COLOR_CLASH = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
