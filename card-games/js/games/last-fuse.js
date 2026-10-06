// Last Fuse engine - the Exploding Kittens rules under a generic name. 2-4 seats.
// 56 cards: 4 Bombs, 6 Defuses, and actions (Attack, Skip, Favor, Shuffle,
// See the Future, Nope) plus five kinds of cat card. On your turn play any
// number of cards, then draw one. Draw a Bomb without a Defuse and you're out;
// with one, you put the Bomb back anywhere in the pile, secretly. The last
// player standing wins.
//
// Nope cancels an action (and a Nope cancels a Nope). Two rules for who may
// play one, chosen per game:
//   "anyone": any other player, as in the printed game. Used with one human
//             player: the AIs decide on the spot (no pause gives away a Nope)
//             and the human is asked only when holding one.
//   "target": only the player an action is aimed at, and then the player who
//             made it, back and forth. Used for hot-seat play, so a Nope
//             window never means passing the device to everyone. Both are
//             always asked, Nope in hand or not, so the question gives
//             nothing away.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const CATS = ["tabby", "calico", "siamese", "sphynx", "ginger"];
  const NAME = {
    bomb: "Bomb", defuse: "Defuse", attack: "Attack", skip: "Skip", favor: "Favor", shuffle: "Shuffle",
    future: "See the Future", nope: "Nope",
    tabby: "Tabby Cat", calico: "Calico Cat", siamese: "Siamese Cat", sphynx: "Sphynx Cat", ginger: "Ginger Cat",
  };
  const COUNT = { attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, nope: 5 };
  CATS.forEach((c) => { COUNT[c] = 4; });
  const BOMBS = 4;
  const DEFUSES = 6;
  const DEAL = 7;
  const SPARE_DEFUSES = 2;
  const PEEK = 3;

  let nextId = 0;
  const card = (kind) => ({ kind, id: "lf" + nextId++ });
  const isCat = (kind) => CATS.includes(kind);
  const say = (state, text) => state.log.push({ text, fresh: true });
  const nameOf = (state, seat) => state.seats[seat].name;

  function createGame(seatTypes, opts) {
    const n = seatTypes.length;
    if (n < 2 || n > 4) throw new Error("Last Fuse supports 2-4 seats");
    const rng = opts && opts.rng;
    const humans = seatTypes.filter((t) => t === "human").length;
    let deck = [];
    Object.keys(COUNT).forEach((k) => { for (let i = 0; i < COUNT[k]; i++) deck.push(card(k)); });
    deck = CARDS.shuffle(deck, rng);
    const hands = seatTypes.map(() => deck.splice(0, DEAL).concat([card("defuse")]));
    for (let i = 0; i < SPARE_DEFUSES; i++) deck.push(card("defuse"));
    for (let i = 0; i < n - 1; i++) deck.push(card("bomb"));
    const state = {
      game: "last-fuse",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      rng,
      nopeRule: (opts && opts.nopeRule) || (humans >= 2 ? "target" : "anyone"),
      draw: CARDS.shuffle(deck, rng),
      discard: [],
      hands,
      alive: seatTypes.map(() => true),
      out: [],            // seats in the order they exploded
      known: seatTypes.map(() => []), // ids of the top cards each seat has seen, top first
      turn: 0,
      turnsLeft: 1,
      phase: "play",
      pending: null,
      drawn: null,        // the Bomb waiting to go back, during "insert"
      gameOver: false,
      winner: null,
      log: [],
    };
    // Bombs left out of the deal: 4 printed, n - 1 used.
    say(state, "Each player has " + (DEAL + 1) + " cards, one of them a Defuse. " + (n - 1) + " Bomb" + (n > 2 ? "s are" : " is") + " in the pile.");
    return state;
  }

  const bombsInPile = (state) => state.draw.filter((c) => c.kind === "bomb").length;
  const holds = (state, seat, kind) => state.hands[seat].some((c) => c.kind === kind);
  const take = (state, seat, id) => {
    const hand = state.hands[seat];
    const i = hand.findIndex((c) => c.id === id);
    if (i === -1) throw new Error("card not in hand");
    return hand.splice(i, 1)[0];
  };
  const nextAlive = (state, seat) => {
    const n = state.seats.length;
    for (let k = 1; k <= n; k++) if (state.alive[(seat + k) % n]) return (seat + k) % n;
    return seat;
  };

  function requirePlay(state, seat) {
    if (state.gameOver) throw new Error("the game is over");
    if (state.phase !== "play" || state.turn !== seat) throw new Error("not this seat's turn to play");
  }

  // ---------------------------------------------------------------- knowledge
  //
  // Each seat remembers the top cards it has seen (See the Future, or where it
  // put a Bomb back). Any shuffle wipes that; drawing takes the top one off.

  function forgetAll(state) { state.known = state.known.map(() => []); }

  function afterTopDrawn(state, drawnId) {
    state.known = state.known.map((k) => (k[0] === drawnId ? k.slice(1) : []));
  }

  // --------------------------------------------------------------- playing

  // opt: { target, ids (cat combo, including this card), name (triple) }
  function playError(state, seat, c, opt) {
    const others = state.seats.map((s, i) => i).filter((i) => i !== seat && state.alive[i]);
    if (["bomb", "defuse", "nope"].includes(c.kind)) return NAME[c.kind] + " can't be played on its own";
    if (c.kind === "favor") {
      if (!others.includes(opt.target)) return "pick who gives you a card";
      return null;
    }
    if (isCat(c.kind)) {
      const ids = opt.ids || [];
      const combo = ids.map((id) => state.hands[seat].find((x) => x.id === id));
      if (!ids.includes(c.id) || combo.some((x) => !x || x.kind !== c.kind) || new Set(ids).size !== ids.length) return "a combo is 2 or 3 of the same cat";
      if (ids.length !== 2 && ids.length !== 3) return "a combo is 2 or 3 of the same cat";
      if (!others.includes(opt.target)) return "pick who to take from";
      if (ids.length === 3 && !NAME[opt.name]) return "name a card";
      return null;
    }
    return null;
  }

  function playCard(state, seat, id, opt) {
    requirePlay(state, seat);
    opt = opt || {};
    const c = state.hands[seat].find((x) => x.id === id);
    if (!c) throw new Error("card not in hand");
    const err = playError(state, seat, c, opt);
    if (err) throw new Error(err);
    const used = isCat(c.kind) ? opt.ids.map((x) => take(state, seat, x)) : [take(state, seat, id)];
    state.discard.push(...used);
    const who = nameOf(state, seat);
    let action;
    if (isCat(c.kind)) {
      action = used.length === 2
        ? { kind: "pair", target: opt.target, label: who + " plays two " + NAME[c.kind] + "s to take a random card from " + nameOf(state, opt.target) }
        : { kind: "triple", target: opt.target, name: opt.name, label: who + " plays three " + NAME[c.kind] + "s and asks " + nameOf(state, opt.target) + " for a " + NAME[opt.name] };
    } else if (c.kind === "favor") {
      action = { kind: "favor", target: opt.target, label: who + " asks " + nameOf(state, opt.target) + " for a Favor" };
    } else if (c.kind === "attack") {
      action = { kind: "attack", target: nextAlive(state, seat), label: who + " attacks " + nameOf(state, nextAlive(state, seat)) };
    } else {
      action = { kind: c.kind, label: who + " plays " + NAME[c.kind] };
    }
    say(state, action.label + ".");
    openWindow(state, seat, action);
  }

  // ------------------------------------------------------------ Nope windows

  function openWindow(state, actor, action) {
    state.pending = { actor, action, nopes: 0, lastNoper: actor, queue: [], responder: null };
    if (state.nopeRule === "target") {
      if (action.target == null || action.target === actor) return resolve(state);
      state.pending.responder = action.target;
      state.phase = "respond";
      return undefined;
    }
    askAnyone(state);
    return undefined;
  }

  // "anyone": walk the other living players in turn order from the last
  // Noper. AIs answer at once; a human is asked only when holding a Nope.
  function askAnyone(state) {
    const p = state.pending;
    const n = state.seats.length;
    p.queue = [];
    for (let k = 1; k < n; k++) {
      const s = (p.lastNoper + k) % n;
      if (state.alive[s]) p.queue.push(s);
    }
    continueAnyone(state);
  }

  function continueAnyone(state) {
    const p = state.pending;
    while (p.queue.length) {
      const s = p.queue.shift();
      if (!holds(state, s, "nope")) continue;
      if (state.seats[s].type === "ai") {
        if (aiShouldNope(state, s)) return playNope(state, s);
        continue;
      }
      p.responder = s;
      state.phase = "respond";
      return undefined;
    }
    return resolve(state);
  }

  function playNope(state, seat) {
    const p = state.pending;
    state.discard.push(take(state, seat, state.hands[seat].find((c) => c.kind === "nope").id));
    p.nopes += 1;
    p.lastNoper = seat;
    say(state, nameOf(state, seat) + " says Nope" + (p.nopes > 1 ? " to the Nope" : "") + ".");
    if (state.nopeRule === "target") {
      p.responder = seat === p.action.target ? p.actor : p.action.target;
      state.phase = "respond";
      return undefined;
    }
    askAnyone(state);
    return undefined;
  }

  function respond(state, seat, nope) {
    const p = state.pending;
    if (state.gameOver || state.phase !== "respond" || !p || p.responder !== seat) throw new Error("not this seat's response");
    if (nope) {
      if (!holds(state, seat, "nope")) throw new Error("no Nope in hand");
      return playNope(state, seat);
    }
    if (state.nopeRule === "target") return resolve(state);
    p.responder = null;
    state.phase = "play";
    return continueAnyone(state);
  }

  // --------------------------------------------------------------- effects

  function resolve(state) {
    const p = state.pending;
    const a = p.action;
    const actor = p.actor;
    state.pending = null;
    state.phase = "play";
    if (p.nopes % 2 === 1) {
      say(state, "Noped - nothing happens.");
      return;
    }
    if (a.kind === "skip") return endTurn(state, false);
    if (a.kind === "attack") return endTurn(state, true);
    if (a.kind === "shuffle") {
      state.draw = CARDS.shuffle(state.draw, state.rng);
      forgetAll(state);
      say(state, "The pile is shuffled.");
      return;
    }
    if (a.kind === "future") {
      state.known[actor] = state.draw.slice(0, PEEK).map((c) => c.id);
      say(state, nameOf(state, actor) + " looks at the top " + Math.min(PEEK, state.draw.length) + " cards.");
      return;
    }
    const hand = state.hands[a.target];
    if (a.kind === "favor") {
      if (!hand.length) { say(state, nameOf(state, a.target) + " has nothing to give."); return; }
      state.pending = { favor: true, actor, target: a.target };
      state.phase = "favor";
      return;
    }
    if (a.kind === "pair") {
      if (!hand.length) { say(state, nameOf(state, a.target) + " has nothing to take."); return; }
      const rand = state.rng || Math.random;
      const got = hand.splice(Math.floor(rand() * hand.length), 1)[0];
      state.hands[actor].push(got);
      say(state, nameOf(state, actor) + " takes a card from " + nameOf(state, a.target) + ".");
      return;
    }
    if (a.kind === "triple") {
      const i = hand.findIndex((c) => c.kind === a.name);
      if (i === -1) { say(state, nameOf(state, a.target) + " has no " + NAME[a.name] + "."); return; }
      state.hands[actor].push(hand.splice(i, 1)[0]);
      say(state, nameOf(state, a.target) + " hands over a " + NAME[a.name] + ".");
    }
  }

  // The Favor target picks the card to give.
  function giveFavor(state, seat, id) {
    const p = state.pending;
    if (state.gameOver || state.phase !== "favor" || !p || p.target !== seat) throw new Error("not this seat's Favor");
    state.hands[p.actor].push(take(state, seat, id));
    say(state, nameOf(state, seat) + " gives " + nameOf(state, p.actor) + " a card.");
    state.pending = null;
    state.phase = "play";
  }

  // Ends the current turn without drawing (Skip ends one of the turns owed;
  // Attack ends them all and puts the next player on the hook for two more,
  // plus any this player still owed).
  function endTurn(state, attack) {
    const seat = state.turn;
    if (attack) {
      const owed = state.turnsLeft > 1 ? state.turnsLeft : 0;
      state.turn = nextAlive(state, seat);
      state.turnsLeft = owed + 2;
      say(state, nameOf(state, state.turn) + " now has " + state.turnsLeft + " turns.");
      return;
    }
    finishTurn(state);
  }

  function finishTurn(state) {
    state.turnsLeft -= 1;
    if (state.turnsLeft <= 0) {
      state.turn = nextAlive(state, state.turn);
      state.turnsLeft = 1;
    }
  }

  // Ends the turn by drawing the top card.
  function drawCard(state, seat) {
    requirePlay(state, seat);
    const c = state.draw.shift();
    afterTopDrawn(state, c.id);
    if (c.kind !== "bomb") {
      state.hands[seat].push(c);
      say(state, nameOf(state, seat) + " draws a card.");
      return finishTurn(state);
    }
    say(state, nameOf(state, seat) + " draws a Bomb!");
    if (holds(state, seat, "defuse")) {
      state.discard.push(take(state, seat, state.hands[seat].find((x) => x.kind === "defuse").id));
      say(state, nameOf(state, seat) + " defuses it and slips it back into the pile.");
      state.drawn = c;
      state.phase = "insert";
      return undefined;
    }
    explode(state, seat, c);
    return undefined;
  }

  // Puts the defused Bomb back: 0 is the top, draw.length the bottom.
  function insertBomb(state, seat, position) {
    if (state.gameOver || state.phase !== "insert" || state.turn !== seat) throw new Error("no Bomb to put back");
    if (!Number.isInteger(position) || position < 0 || position > state.draw.length) throw new Error("not a place in the pile");
    state.draw.splice(position, 0, state.drawn);
    // Everyone's memory of the pile holds up to that point; the player who
    // put it there also knows exactly where it is.
    state.known = state.known.map((k, s) => {
      if (s !== seat) return k.slice(0, position);
      return k.length >= position ? k.slice(0, position).concat([state.drawn.id], k.slice(position)) : k;
    });
    state.drawn = null;
    state.phase = "play";
    finishTurn(state);
  }

  function explode(state, seat, bomb) {
    state.alive[seat] = false;
    state.out.push(seat);
    state.discard.push(bomb, ...state.hands[seat]);
    state.hands[seat] = [];
    state.known[seat] = [];
    say(state, nameOf(state, seat) + " explodes and is out.");
    const left = state.alive.map((a, i) => (a ? i : -1)).filter((i) => i !== -1);
    if (left.length === 1) {
      state.gameOver = true;
      state.winner = left[0];
      state.phase = "over";
      say(state, nameOf(state, left[0]) + " is the last one standing.");
      return;
    }
    state.turn = nextAlive(state, seat);
    state.turnsLeft = 1;
  }

  function actingSeat(state) {
    if (state.gameOver) return null;
    if (state.phase === "respond") return state.pending.responder;
    if (state.phase === "favor") return state.pending.target;
    return state.turn;
  }

  // --------------------------------------------------------------------- AI

  // Chance the next card is a Bomb, from what this seat knows.
  function risk(state, seat) {
    const k = state.known[seat];
    if (k.length) return state.draw[0] && state.draw[0].id === k[0] && state.draw[0].kind === "bomb" ? 1 : 0;
    return state.draw.length ? bombsInPile(state) / state.draw.length : 0;
  }

  function aiShouldNope(state, seat) {
    const p = state.pending;
    const a = p.action;
    const mine = p.actor === seat;
    // Whether the action currently goes ahead.
    const goesAhead = p.nopes % 2 === 0;
    if (mine) {
      // Someone Noped my action: fight back for the ones that keep me safe.
      if (goesAhead) return false;
      return (a.kind === "skip" || a.kind === "attack") && risk(state, seat) >= 0.25;
    }
    if (!goesAhead) return false;
    if (a.target !== seat) return false;
    if (a.kind === "attack") return risk(state, seat) >= 0.2;
    if (a.kind === "favor" || a.kind === "pair") return holds(state, seat, "defuse");
    if (a.kind === "triple") return state.hands[seat].some((c) => c.kind === a.name);
    return false;
  }

  function cardValue(c) {
    if (c.kind === "defuse") return 100;
    if (c.kind === "nope") return 40;
    if (c.kind === "skip" || c.kind === "attack") return 30;
    if (c.kind === "future" || c.kind === "shuffle") return 20;
    if (c.kind === "favor") return 15;
    return 5;
  }

  function aiChooseFavor(state, seat) {
    return state.hands[seat].reduce((a, b) => (cardValue(b) < cardValue(a) ? b : a)).id;
  }

  // Where to put a defused Bomb: on top when it will hit the next player now,
  // otherwise somewhere random.
  function aiInsertPosition(state, seat) {
    const rand = state.rng || Math.random;
    if (state.turnsLeft <= 1 && nextAlive(state, seat) !== seat) return 0;
    return Math.floor(rand() * (state.draw.length + 1));
  }

  // One step of an AI turn: a card to play, or "draw".
  function aiChoosePlay(state, seat) {
    const hand = state.hands[seat];
    const find = (kind) => hand.find((c) => c.kind === kind);
    const others = state.seats.map((s, i) => i).filter((i) => i !== seat && state.alive[i]);
    const richest = others.reduce((a, b) => (state.hands[b].length > state.hands[a].length ? b : a));
    const r = risk(state, seat);
    if (r === 1) {
      for (const kind of ["attack", "skip", "shuffle"]) if (find(kind)) return { type: "play", id: find(kind).id, opt: {} };
      return { type: "draw" };
    }
    if (r >= 0.15 && !state.known[seat].length && find("future")) return { type: "play", id: find("future").id, opt: {} };
    if (r >= 0.35) {
      for (const kind of ["attack", "skip"]) if (find(kind)) return { type: "play", id: find(kind).id, opt: {} };
    }
    // Without a Defuse, go looking for one.
    if (!find("defuse") && state.hands[richest].length) {
      for (const cat of CATS) {
        const same = hand.filter((c) => c.kind === cat);
        if (same.length >= 3) return { type: "play", id: same[0].id, opt: { target: richest, ids: same.slice(0, 3).map((c) => c.id), name: "defuse" } };
        if (same.length === 2) return { type: "play", id: same[0].id, opt: { target: richest, ids: same.map((c) => c.id) } };
      }
      if (find("favor")) return { type: "play", id: find("favor").id, opt: { target: richest } };
    }
    return { type: "draw" };
  }

  function stepAI(state, seat) {
    if (state.phase === "respond") return respond(state, seat, holds(state, seat, "nope") && aiShouldNope(state, seat));
    if (state.phase === "favor") return giveFavor(state, seat, aiChooseFavor(state, seat));
    if (state.phase === "insert") return insertBomb(state, seat, aiInsertPosition(state, seat));
    const move = aiChoosePlay(state, seat);
    if (move.type === "draw") return drawCard(state, seat);
    return playCard(state, seat, move.id, move.opt);
  }

  const api = {
    CATS, NAME, COUNT, BOMBS, DEFUSES, PEEK,
    card, isCat, createGame, playError, playCard, respond, giveFavor, drawCard, insertBomb, actingSeat,
    bombsInPile, risk, aiShouldNope, aiChoosePlay, aiChooseFavor, aiInsertPosition, stepAI,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LAST_FUSE = api;
})(typeof window !== "undefined" ? window : globalThis);
