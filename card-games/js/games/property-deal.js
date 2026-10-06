// Property Deal engine - the Monopoly Deal rules under a generic name. 2-4 seats.
// 106 cards: money, properties (and two-colour / any-colour wilds), rent
// cards, and actions. Each turn: draw 2 (5 on an empty hand), play up to 3
// cards, end with no more than 7 in hand. A card goes to your bank as money,
// to your table as a property, or is played for its action. The first seat
// with three full sets of different colours wins at once.
//
// Payments come from what's on the table (bank, properties, buildings), never
// the hand, and no change is given. A Block cancels an action against you;
// the player it's aimed at may Block that Block, and so on.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const COLORS = ["brown", "lightblue", "pink", "orange", "red", "yellow", "green", "darkblue", "station", "utility"];
  const COLOR_NAME = {
    brown: "Brown", lightblue: "Light Blue", pink: "Pink", orange: "Orange", red: "Red",
    yellow: "Yellow", green: "Green", darkblue: "Dark Blue", station: "Station", utility: "Utility",
  };
  // Rent for 1, 2, ... cards of a colour; the list's length is the full set size.
  const RENT = {
    brown: [1, 2], lightblue: [1, 2, 3], pink: [1, 2, 4], orange: [1, 3, 5], red: [2, 3, 6],
    yellow: [2, 4, 6], green: [2, 4, 7], darkblue: [3, 8], station: [1, 2, 3, 4], utility: [1, 2],
  };
  const PROP_VALUE = { brown: 1, lightblue: 1, pink: 2, orange: 2, red: 3, yellow: 3, green: 4, darkblue: 4, station: 2, utility: 2 };
  const NO_BUILDINGS = new Set(["station", "utility"]);
  const ACTION_NAME = {
    setgrab: "Set Grab", block: "Block", steal: "Steal", swap: "Swap", debt: "Debt Collector",
    birthday: "Birthday", bonusdraw: "Bonus Draw", house: "House", hotel: "Hotel", double: "Double Rent",
  };
  const ACTION_VALUE = { setgrab: 5, block: 4, steal: 3, swap: 3, debt: 3, birthday: 2, bonusdraw: 1, house: 3, hotel: 4, double: 1 };
  const ACTION_COUNT = { setgrab: 2, block: 3, steal: 3, swap: 3, debt: 3, birthday: 3, bonusdraw: 10, house: 3, hotel: 2, double: 2 };
  const PLAYS_PER_TURN = 3;
  const HAND_LIMIT = 7;
  const SETS_TO_WIN = 3;
  const HOUSE_RENT = 3;
  const HOTEL_RENT = 4;
  const DEBT = 5;
  const BIRTHDAY = 2;
  // AI-only games almost always finish; this only stops a stalemate.
  const MAX_TURNS = 400;

  let nextCardId = 0;
  const make = (fields) => Object.assign({ id: "pd" + nextCardId++ }, fields);
  const money = (value) => make({ kind: "money", value });
  const prop = (colors, value) => make({ kind: "prop", colors, value });
  const rent = (colors, value) => make({ kind: "rent", colors, value });
  const action = (type) => make({ kind: "action", type, value: ACTION_VALUE[type] });

  function buildDeck() {
    const deck = [];
    [[1, 6], [2, 5], [3, 3], [4, 3], [5, 2], [10, 1]].forEach(([v, k]) => { for (let i = 0; i < k; i++) deck.push(money(v)); });
    COLORS.forEach((c) => { for (let i = 0; i < RENT[c].length; i++) deck.push(prop([c], PROP_VALUE[c])); });
    [[["darkblue", "green"], 4, 1], [["lightblue", "brown"], 1, 1], [["pink", "orange"], 2, 2], [["station", "green"], 4, 1],
      [["lightblue", "station"], 4, 1], [["utility", "station"], 2, 1], [["red", "yellow"], 3, 2], [COLORS, 0, 2]]
      .forEach(([colors, v, k]) => { for (let i = 0; i < k; i++) deck.push(prop(colors.slice(), v)); });
    for (let i = 0; i < 3; i++) deck.push(rent(COLORS.slice(), 3));
    [["green", "darkblue"], ["brown", "lightblue"], ["pink", "orange"], ["station", "utility"], ["red", "yellow"]]
      .forEach((pair) => { deck.push(rent(pair.slice(), 1), rent(pair.slice(), 1)); });
    Object.keys(ACTION_COUNT).forEach((t) => { for (let i = 0; i < ACTION_COUNT[t]; i++) deck.push(action(t)); });
    return deck;
  }

  const isWild = (c) => c.kind === "prop" && c.colors.length > 1;
  const isAnyColor = (c) => c.colors && c.colors.length === COLORS.length;

  function cardLabel(c) {
    if (c.kind === "money") return "$" + c.value + "M";
    if (c.kind === "action") return ACTION_NAME[c.type];
    const colors = isAnyColor(c) ? "Any colour" : c.colors.map((x) => COLOR_NAME[x]).join("/");
    return c.kind === "rent" ? "Rent: " + colors : colors + (isWild(c) ? " wild" : "");
  }

  // ------------------------------------------------------------ the table

  function emptyTable() {
    const sets = {};
    COLORS.forEach((c) => { sets[c] = { cards: [], house: null, hotel: null }; });
    return { bank: [], sets };
  }

  const setSize = (color) => RENT[color].length;
  // As in the published rules, any-colour wilds alone are no set: a colour
  // needs at least one other card to count toward a full set or charge rent.
  const anchored = (set) => set.cards.some((c) => !isAnyColor(c));
  const isFull = (table, color) => anchored(table.sets[color]) && table.sets[color].cards.length >= setSize(color);
  const fullColors = (table) => COLORS.filter((c) => isFull(table, c));

  function rentFor(table, color) {
    const set = table.sets[color];
    const n = Math.min(set.cards.length, setSize(color));
    if (n === 0 || !anchored(set)) return 0;
    return RENT[color][n - 1] + (isFull(table, color) ? (set.house ? HOUSE_RENT : 0) + (set.hotel ? HOTEL_RENT : 0) : 0);
  }

  const bankTotal = (table) => table.bank.reduce((s, c) => s + c.value, 0);

  // Everything on the table that can pay a debt, each with where it sits.
  // An any-colour wild is worth nothing, so it can't pay.
  function payable(table) {
    const out = table.bank.map((card) => ({ card, where: "bank" }));
    COLORS.forEach((color) => {
      const set = table.sets[color];
      set.cards.forEach((card) => { if (card.value > 0) out.push({ card, where: color }); });
      if (set.house) out.push({ card: set.house, where: color });
      if (set.hotel) out.push({ card: set.hotel, where: color });
    });
    return out;
  }
  const payableTotal = (table) => payable(table).reduce((s, p) => s + p.card.value, 0);

  // Finds a card on the table: { card, where } with where = "bank" or a colour.
  function locate(table, id) {
    const banked = table.bank.find((c) => c.id === id);
    if (banked) return { card: banked, where: "bank" };
    for (const color of COLORS) {
      const set = table.sets[color];
      const card = set.cards.find((c) => c.id === id) || (set.house && set.house.id === id && set.house) || (set.hotel && set.hotel.id === id && set.hotel);
      if (card) return { card, where: color };
    }
    return null;
  }

  // Takes a card off the table. A set that stops being full sends its
  // buildings to the owner's bank, since they can only stand on a full set.
  function takeFromTable(table, id) {
    const found = locate(table, id);
    if (!found) throw new Error("card not on the table");
    const { card, where } = found;
    if (where === "bank") {
      table.bank.splice(table.bank.indexOf(card), 1);
      return found;
    }
    const set = table.sets[where];
    if (set.hotel === card) set.hotel = null;
    else if (set.house === card) {
      set.house = null;
      if (set.hotel) { table.bank.push(set.hotel); set.hotel = null; }
    } else {
      set.cards.splice(set.cards.indexOf(card), 1);
      if (!isFull(table, where)) {
        if (set.house) table.bank.push(set.house);
        if (set.hotel) table.bank.push(set.hotel);
        set.house = null;
        set.hotel = null;
      }
    }
    return found;
  }

  // Properties land in their colour's set; anything else is money.
  function receive(table, card, color) {
    if (card.kind === "prop") table.sets[color].cards.push(card);
    else table.bank.push(card);
  }

  // ---------------------------------------------------------------- game

  const say = (state, text) => state.log.push({ text, fresh: true });
  const nameOf = (state, seat) => state.seats[seat].name;
  const others = (state, seat) => state.seats.map((s, i) => i).filter((i) => i !== seat);

  // Most full sets, then the most on the table: the turn-limit winner and
  // the order of the final standings.
  const rank = (state, seat) => fullColors(state.tables[seat]).length * 1000 + payableTotal(state.tables[seat]);

  function createGame(seatTypes, opts) {
    if (seatTypes.length < 2 || seatTypes.length > 4) throw new Error("Property Deal supports 2-4 seats");
    const state = {
      game: "property-deal",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1) })),
      rng: opts && opts.rng,
      drawPile: (opts && opts.deck) ? opts.deck.slice() : CARDS.shuffle(buildDeck(), opts && opts.rng),
      discard: [],
      hands: seatTypes.map(() => []),
      tables: seatTypes.map(emptyTable),
      turn: 0,
      turns: 0,
      plays: 0,
      phase: "play",
      pending: null,
      gameOver: false,
      winner: null,
      log: [],
    };
    for (let k = 0; k < 5; k++) state.seats.forEach((s, i) => draw(state, i, 1));
    say(state, "Five cards each. " + nameOf(state, 0) + " goes first.");
    startTurn(state);
    return state;
  }

  function draw(state, seat, count) {
    for (let k = 0; k < count; k++) {
      if (state.drawPile.length === 0) {
        if (state.discard.length === 0) return;
        state.drawPile = CARDS.shuffle(state.discard, state.rng);
        state.discard = [];
        say(state, "The draw pile ran out - the discards are reshuffled.");
      }
      state.hands[seat].push(state.drawPile.pop());
    }
  }

  function startTurn(state) {
    const seat = state.turn;
    const count = state.hands[seat].length === 0 ? 5 : 2;
    draw(state, seat, count);
    state.plays = 0;
    state.phase = "play";
    say(state, nameOf(state, seat) + " draws " + count + ".");
  }

  // Checked after every change to a table. If one move completes three sets
  // for two seats (a Swap can), the seat that made the move wins.
  function checkWin(state, mover) {
    const n = state.seats.length;
    const order = Array.from({ length: n }, (_, k) => (mover + k) % n);
    const winner = order.find((i) => fullColors(state.tables[i]).length >= SETS_TO_WIN);
    if (winner === undefined) return false;
    state.gameOver = true;
    state.winner = winner;
    state.phase = "over";
    state.pending = null;
    say(state, nameOf(state, winner) + " has three full sets and wins!");
    return true;
  }

  function requireTurn(state, seat) {
    if (state.gameOver) throw new Error("game is over");
    if (state.phase !== "play" || state.turn !== seat) throw new Error("not this seat's turn to play");
  }

  function takeFromHand(state, seat, id) {
    const hand = state.hands[seat];
    const i = hand.findIndex((c) => c.id === id);
    if (i === -1) throw new Error("card not in hand");
    return hand.splice(i, 1)[0];
  }

  // Cards a Steal or Swap may take: any property not in a full set.
  function loosePropertyIds(table) {
    return COLORS.filter((c) => !isFull(table, c)).flatMap((c) => table.sets[c].cards.map((card) => card.id));
  }

  // Checks a play without changing anything; returns an error message or null.
  function playError(state, seat, card, opt) {
    const as = opt.as;
    const mine = state.tables[seat];
    const needsColor = as === "prop" || as === "rent" || ["setgrab", "house", "hotel"].includes(card.type);
    if (needsColor && as !== "bank" && !COLORS.includes(opt.color)) return "pick a colour";
    if (opt.target != null && !state.seats[opt.target]) return "no such seat";
    if (as === "bank") return card.kind === "prop" ? "properties can't be banked" : null;
    if (as === "prop") {
      if (card.kind !== "prop") return "not a property";
      return card.colors.includes(opt.color) ? null : "that property isn't " + opt.color;
    }
    if (as === "rent") {
      if (card.kind !== "rent") return "not a rent card";
      if (!card.colors.includes(opt.color)) return "this rent card can't charge " + opt.color;
      if (rentFor(mine, opt.color) === 0) return "no " + opt.color + " properties to charge for";
      if (opt.double) {
        if (!state.hands[seat].some((c) => c.type === "double")) return "no Double Rent in hand";
        if (state.plays + 2 > PLAYS_PER_TURN) return "Double Rent needs a second play";
      }
      if (isAnyColor(card) && !others(state, seat).includes(opt.target)) return "pick who pays";
      return null;
    }
    if (as !== "action" || card.kind !== "action") return "can't play that card that way";
    const target = opt.target;
    const theirs = target != null && state.tables[target];
    switch (card.type) {
      case "bonusdraw": case "birthday": return null;
      case "debt": return others(state, seat).includes(target) ? null : "pick who pays";
      case "steal":
        if (!theirs || target === seat) return "pick whose property";
        return loosePropertyIds(theirs).includes(opt.theirId) ? null : "that property can't be stolen";
      case "swap":
        if (!theirs || target === seat) return "pick whose property";
        if (!loosePropertyIds(theirs).includes(opt.theirId)) return "that property can't be taken";
        return loosePropertyIds(mine).includes(opt.myId) ? null : "that property of yours can't be given";
      case "setgrab":
        if (!theirs || target === seat) return "pick whose set";
        return isFull(theirs, opt.color) ? null : "that isn't a full set";
      case "house":
        if (NO_BUILDINGS.has(opt.color) || !isFull(mine, opt.color)) return "a house needs a full set (not stations or utilities)";
        return mine.sets[opt.color].house ? "that set already has a house" : null;
      case "hotel":
        if (NO_BUILDINGS.has(opt.color) || !isFull(mine, opt.color) || !mine.sets[opt.color].house) return "a hotel needs a full set with a house";
        return mine.sets[opt.color].hotel ? "that set already has a hotel" : null;
      default: return ACTION_NAME[card.type] + " can't be played on its own";
    }
  }

  // opt.as: "bank" | "prop" (with color) | "rent" (color, target for an
  // any-colour rent, double) | "action" (target, theirId, myId, color).
  function playCard(state, seat, id, opt) {
    requireTurn(state, seat);
    if (state.plays >= PLAYS_PER_TURN) throw new Error("no plays left this turn");
    const card = state.hands[seat].find((c) => c.id === id);
    if (!card) throw new Error("card not in hand");
    const err = playError(state, seat, card, opt);
    if (err) throw new Error(err);
    takeFromHand(state, seat, id);
    const mine = state.tables[seat];
    const who = nameOf(state, seat);
    state.plays += 1;

    if (opt.as === "bank") {
      mine.bank.push(card);
      say(state, who + " banks " + cardLabel(card) + " ($" + card.value + "M).");
      return;
    }
    if (opt.as === "prop") {
      mine.sets[opt.color].cards.push(card);
      say(state, who + " plays " + cardLabel(card) + " as " + COLOR_NAME[opt.color] + ".");
      checkWin(state, seat);
      return;
    }
    state.discard.push(card);
    if (opt.as === "rent") {
      let amount = rentFor(mine, opt.color);
      if (opt.double) {
        state.discard.push(takeFromHand(state, seat, state.hands[seat].find((c) => c.type === "double").id));
        state.plays += 1;
        amount *= 2;
      }
      const targets = isAnyColor(card) ? [opt.target] : others(state, seat);
      say(state, who + " charges " + COLOR_NAME[opt.color] + " rent" + (opt.double ? ", doubled," : "") + ": $" + amount + "M from " +
        (targets.length === 1 ? nameOf(state, targets[0]) : "everyone") + ".");
      return startPending(state, seat, { type: "pay", amount, why: COLOR_NAME[opt.color] + " rent" }, targets);
    }
    const target = opt.target;
    switch (card.type) {
      case "bonusdraw":
        draw(state, seat, 2);
        say(state, who + " plays Bonus Draw and draws 2.");
        return;
      case "birthday":
        say(state, who + " has a birthday: $" + BIRTHDAY + "M from everyone.");
        return startPending(state, seat, { type: "pay", amount: BIRTHDAY, why: "a birthday present" }, others(state, seat));
      case "debt":
        say(state, who + " collects a $" + DEBT + "M debt from " + nameOf(state, target) + ".");
        return startPending(state, seat, { type: "pay", amount: DEBT, why: "a debt" }, [target]);
      case "steal":
        say(state, who + " tries to steal " + nameOf(state, target) + "'s " + cardLabel(locate(state.tables[target], opt.theirId).card) + ".");
        return startPending(state, seat, { type: "steal", theirId: opt.theirId }, [target]);
      case "swap":
        say(state, who + " tries to swap with " + nameOf(state, target) + ".");
        return startPending(state, seat, { type: "swap", theirId: opt.theirId, myId: opt.myId }, [target]);
      case "setgrab":
        say(state, who + " tries to grab " + nameOf(state, target) + "'s " + COLOR_NAME[opt.color] + " set.");
        return startPending(state, seat, { type: "setgrab", color: opt.color }, [target]);
      case "house": case "hotel":
        mine.sets[opt.color][card.type] = card;
        state.discard.pop();
        say(state, who + " builds a " + card.type + " on " + COLOR_NAME[opt.color] + ".");
        return;
      default:
        throw new Error("unhandled action " + card.type);
    }
  }

  // Moving a wild between its colours is free, any time on your own turn,
  // but not out of a set with buildings.
  function moveWild(state, seat, id, color) {
    requireTurn(state, seat);
    const table = state.tables[seat];
    const found = locate(table, id);
    if (!found || found.where === "bank" || !isWild(found.card)) throw new Error("not a wild on your table");
    if (!found.card.colors.includes(color) || color === found.where) throw new Error("can't move it there");
    if (table.sets[found.where].house) throw new Error("not out of a set with buildings");
    takeFromTable(table, id);
    table.sets[color].cards.push(found.card);
    say(state, nameOf(state, seat) + " moves a wild to " + COLOR_NAME[color] + ".");
    checkWin(state, seat);
  }

  // ------------------------------------------------- actions with targets
  //
  // pending = { from, effect, targets, idx, blocks, responder }. Each target
  // in turn may Block (and be Blocked back), then pays or loses the card.
  // Every target gets the chance to respond, Block or not, and so does the
  // player after a Block: stopping only for seats that hold one would show
  // everyone what's in a hidden hand.

  const holdsBlock = (state, seat) => state.hands[seat].some((c) => c.type === "block");

  function startPending(state, from, effect, targets) {
    state.pending = { from, effect, targets, idx: 0, blocks: 0, responder: null };
    nextTarget(state);
  }

  function nextTarget(state) {
    const p = state.pending;
    // A payment or take can finish a third set before the last target.
    if (checkWin(state, p.from)) return;
    if (p.idx >= p.targets.length) {
      state.pending = null;
      state.phase = "play";
      return;
    }
    p.blocks = 0;
    p.responder = p.targets[p.idx];
    state.phase = "respond";
  }

  function respond(state, seat, useBlock) {
    const p = state.pending;
    if (state.gameOver || state.phase !== "respond" || p.responder !== seat) throw new Error("not this seat's response");
    if (!useBlock) return resolveTarget(state);
    if (!holdsBlock(state, seat)) throw new Error("no Block in hand");
    state.discard.push(takeFromHand(state, seat, state.hands[seat].find((c) => c.type === "block").id));
    p.blocks += 1;
    say(state, nameOf(state, seat) + " plays Block.");
    const target = p.targets[p.idx];
    p.responder = seat === target ? p.from : target;
  }

  function resolveTarget(state) {
    const p = state.pending;
    const target = p.targets[p.idx];
    p.responder = null;
    if (p.blocks % 2 === 1) {
      say(state, "Blocked - " + nameOf(state, target) + " is untouched.");
      p.idx += 1;
      return nextTarget(state);
    }
    const e = p.effect;
    const theirs = state.tables[target];
    const mine = state.tables[p.from];
    if (e.type === "pay") {
      const total = payableTotal(theirs);
      if (total <= e.amount) {
        // Can't cover it (or exactly): everything payable goes, no choice to make.
        transfer(state, target, p.from, payable(theirs).map((x) => x.card.id));
        p.idx += 1;
        return nextTarget(state);
      }
      state.phase = "pay";
      return;
    }
    if (e.type === "steal") {
      const { card, where } = takeFromTable(theirs, e.theirId);
      receive(mine, card, where);
      say(state, nameOf(state, p.from) + " steals " + cardLabel(card) + ".");
    } else if (e.type === "swap") {
      const got = takeFromTable(theirs, e.theirId);
      const gave = takeFromTable(mine, e.myId);
      receive(mine, got.card, got.where);
      receive(theirs, gave.card, gave.where);
      say(state, nameOf(state, p.from) + " swaps " + cardLabel(gave.card) + " for " + cardLabel(got.card) + ".");
    } else if (e.type === "setgrab") {
      const from = theirs.sets[e.color];
      const to = mine.sets[e.color];
      to.cards.push(...from.cards);
      // A set grabbed on top of cards already held keeps one house and hotel; spares go to the bank.
      [["house", from.house], ["hotel", from.hotel]].forEach(([kind, b]) => {
        if (!b) return;
        if (to[kind]) mine.bank.push(b); else to[kind] = b;
      });
      theirs.sets[e.color] = { cards: [], house: null, hotel: null };
      say(state, nameOf(state, p.from) + " grabs the " + COLOR_NAME[e.color] + " set.");
    }
    p.idx += 1;
    nextTarget(state);
  }

  // Moves cards off `payer`'s table to `payee`.
  function transfer(state, payer, payee, ids) {
    const from = state.tables[payer];
    const to = state.tables[payee];
    let total = 0;
    ids.forEach((id) => {
      const { card, where } = takeFromTable(from, id);
      receive(to, card, where === "bank" ? null : where);
      total += card.value;
    });
    say(state, nameOf(state, payer) + " pays $" + total + "M" + (ids.length === 0 ? " - nothing to pay with" : "") + ".");
  }

  // The payer picks cards worth at least the debt; no change is given.
  function pay(state, seat, ids) {
    const p = state.pending;
    if (state.gameOver || state.phase !== "pay" || p.targets[p.idx] !== seat) throw new Error("not this seat's payment");
    const table = state.tables[seat];
    const options = new Map(payable(table).map((x) => [x.card.id, x.card]));
    if (new Set(ids).size !== ids.length || !ids.every((id) => options.has(id))) throw new Error("can't pay with those cards");
    const total = ids.reduce((s, id) => s + options.get(id).value, 0);
    if (total < p.effect.amount) throw new Error("that's only $" + total + "M of $" + p.effect.amount + "M");
    transfer(state, seat, p.from, ids);
    p.idx += 1;
    nextTarget(state);
  }

  function endTurn(state, seat) {
    requireTurn(state, seat);
    if (state.hands[seat].length > HAND_LIMIT) {
      state.phase = "discard";
      return;
    }
    passTurn(state);
  }

  function discardCard(state, seat, id) {
    if (state.gameOver || state.phase !== "discard" || state.turn !== seat) throw new Error("not discarding now");
    state.discard.push(takeFromHand(state, seat, id));
    if (state.hands[seat].length <= HAND_LIMIT) passTurn(state);
  }

  function passTurn(state) {
    state.turns += 1;
    if (state.turns >= MAX_TURNS) return endByTurnLimit(state);
    state.turn = (state.turn + 1) % state.seats.length;
    startTurn(state);
  }

  // The turn limit ends a stalemate: the best rank wins.
  function endByTurnLimit(state) {
    state.winner = state.seats.map((s, i) => i).reduce((a, b) => (rank(state, b) > rank(state, a) ? b : a));
    state.gameOver = true;
    state.phase = "over";
    say(state, "Turn limit reached - " + nameOf(state, state.winner) + " wins on sets and value.");
  }

  function actingSeat(state) {
    if (state.gameOver) return null;
    if (state.phase === "respond") return state.pending.responder;
    if (state.phase === "pay") return state.pending.targets[state.pending.idx];
    return state.turn;
  }

  // --------------------------------------------------------------------- AI

  // How much a property card helps a table in a colour: completing a set
  // matters most, then progress toward one.
  function colorNeed(table, color) {
    const have = table.sets[color].cards.length;
    const size = setSize(color);
    if (have >= size) return 0;
    return (have + 1) / size + (have + 1 === size ? 2 : 0) + PROP_VALUE[color] / 20;
  }

  function bestColorFor(table, card) {
    return card.colors.reduce((a, b) => (colorNeed(table, b) > colorNeed(table, a) ? b : a));
  }

  // The opponent with the most to pay with.
  function richest(state, seat) {
    return others(state, seat).reduce((a, b) => (payableTotal(state.tables[b]) > payableTotal(state.tables[a]) ? b : a));
  }

  // One play (or end of turn) for the seat whose turn it is.
  function aiChoosePlay(state, seat) {
    const hand = state.hands[seat];
    const mine = state.tables[seat];
    const left = PLAYS_PER_TURN - state.plays;
    const of = (pred) => hand.filter(pred);
    const end = { type: "end" };
    if (left <= 0) return end;
    const play = (card, opt) => ({ type: "play", id: card.id, opt });

    const bonus = of((c) => c.type === "bonusdraw");
    if (bonus.length && left >= 2) return play(bonus[0], { as: "action" });

    // A Set Grab that wins, or takes any full set.
    for (const c of of((x) => x.type === "setgrab")) {
      const options = others(state, seat).flatMap((t) => fullColors(state.tables[t]).filter((col) => !isFull(mine, col)).map((col) => ({ t, col })));
      if (options.length) {
        const best = options.reduce((a, b) => (rentFor(state.tables[b.t], b.col) > rentFor(state.tables[a.t], a.col) ? b : a));
        return play(c, { as: "action", target: best.t, color: best.col });
      }
    }

    const props = of((c) => c.kind === "prop");
    if (props.length) {
      const card = props.reduce((a, b) => (colorNeed(mine, bestColorFor(mine, b)) > colorNeed(mine, bestColorFor(mine, a)) ? b : a));
      return play(card, { as: "prop", color: bestColorFor(mine, card) });
    }

    // Steal the loose property this table needs most.
    for (const c of of((x) => x.type === "steal" || x.type === "swap")) {
      let best = null;
      others(state, seat).forEach((t) => loosePropertyIds(state.tables[t]).forEach((id) => {
        const found = locate(state.tables[t], id);
        const need = colorNeed(mine, found.where);
        if (mine.sets[found.where].cards.length > 0 && (!best || need > best.need)) best = { t, id, need };
      }));
      if (!best) continue;
      if (c.type === "steal") return play(c, { as: "action", target: best.t, theirId: best.id });
      const giveable = loosePropertyIds(mine).filter((id) => locate(mine, id).where !== locate(state.tables[best.t], best.id).where);
      if (giveable.length) {
        const give = giveable.reduce((a, b) => (colorNeed(mine, locate(mine, b).where) < colorNeed(mine, locate(mine, a).where) ? b : a));
        if (colorNeed(mine, locate(mine, give).where) < best.need) return play(c, { as: "action", target: best.t, theirId: best.id, myId: give });
      }
    }

    for (const c of of((x) => x.type === "house" || x.type === "hotel")) {
      const color = COLORS.find((col) => !playError(state, seat, c, { as: "action", color: col }));
      if (color) return play(c, { as: "action", color });
    }

    // Rent: the colour that charges most, doubled when that's worth two plays.
    const canDouble = of((x) => x.type === "double").length > 0 && left >= 2;
    let bestRent = null;
    of((x) => x.kind === "rent").forEach((c) => c.colors.forEach((col) => {
      const amount = rentFor(mine, col);
      if (amount > 0 && (!bestRent || amount > bestRent.amount)) bestRent = { c, col, amount };
    }));
    if (bestRent && bestRent.amount >= 2) {
      const target = isAnyColor(bestRent.c) ? richest(state, seat) : undefined;
      return play(bestRent.c, { as: "rent", color: bestRent.col, target, double: canDouble && bestRent.amount >= 3 });
    }

    const debt = of((x) => x.type === "debt");
    if (debt.length && payableTotal(state.tables[richest(state, seat)]) >= 3) return play(debt[0], { as: "action", target: richest(state, seat) });
    const bday = of((x) => x.type === "birthday");
    if (bday.length && others(state, seat).some((t) => payableTotal(state.tables[t]) > 0)) return play(bday[0], { as: "action" });

    const cash = of((x) => x.kind === "money");
    if (cash.length) return play(cash.reduce((a, b) => (b.value > a.value ? b : a)), { as: "bank" });
    // With a thin bank, bank the action cards it can't use now (keep Blocks).
    if (bankTotal(mine) < 6) {
      const spare = of((x) => x.kind !== "prop" && x.type !== "block" && x.value > 0);
      if (spare.length) return play(spare.reduce((a, b) => (b.value > a.value ? b : a)), { as: "bank" });
    }
    return end;
  }

  // Block what hurts: a Set Grab, a Steal or Swap of a set-building card, or
  // a payment that's big or most of what this seat has.
  function aiShouldBlock(state, seat) {
    if (!holdsBlock(state, seat)) return false;
    const p = state.pending;
    const e = p.effect;
    const target = p.targets[p.idx];
    if (seat !== target) return e.type === "setgrab" || (e.type === "pay" && e.amount >= 5);
    if (e.type === "setgrab") return true;
    if (e.type === "pay") return e.amount >= 5 || e.amount * 2 >= payableTotal(state.tables[seat]);
    return true;
  }

  // Money first, as close to the debt as possible; then the properties
  // this seat needs least.
  function aiChoosePayment(state, seat) {
    const owed = state.pending.effect.amount;
    const table = state.tables[seat];
    const bank = table.bank.slice();
    // Smallest bank subset that covers the debt (subset sums by DP).
    const best = new Map([[0, []]]);
    bank.forEach((c) => {
      Array.from(best.entries()).forEach(([sum, ids]) => {
        const next = sum + c.value;
        if (!best.has(next)) best.set(next, ids.concat(c.id));
      });
    });
    const covering = Array.from(best.keys()).filter((s) => s >= owed);
    if (covering.length) return best.get(Math.min(...covering));
    const ids = bank.map((c) => c.id);
    let total = bankTotal(table);
    const rest = payable(table).filter((x) => x.where !== "bank")
      .sort((a, b) => (isFull(table, a.where) - isFull(table, b.where)) || (colorNeed(table, a.where) - colorNeed(table, b.where)) || a.card.value - b.card.value);
    for (const x of rest) {
      if (total >= owed) break;
      ids.push(x.card.id);
      total += x.card.value;
    }
    return ids;
  }

  function keepScore(card) {
    if (card.type === "block") return 50;
    if (card.kind === "prop") return 30 + card.value;
    if (card.type === "setgrab") return 40;
    return card.value;
  }

  function stepAI(state, seat) {
    if (state.phase === "respond") return respond(state, seat, aiShouldBlock(state, seat));
    if (state.phase === "pay") return pay(state, seat, aiChoosePayment(state, seat));
    if (state.phase === "discard") {
      const hand = state.hands[seat];
      return discardCard(state, seat, hand.reduce((a, b) => (keepScore(b) < keepScore(a) ? b : a)).id);
    }
    const move = aiChoosePlay(state, seat);
    if (move.type === "end") return endTurn(state, seat);
    return playCard(state, seat, move.id, move.opt);
  }

  const api = {
    COLORS, COLOR_NAME, RENT, ACTION_NAME, PLAYS_PER_TURN, HAND_LIMIT, MAX_TURNS,
    money, prop, rent, action, buildDeck, cardLabel, isWild, isAnyColor,
    emptyTable, setSize, isFull, fullColors, rentFor, rank, others, holdsBlock, bankTotal, payable, payableTotal, locate, loosePropertyIds,
    createGame, playError, playCard, moveWild, respond, pay, endTurn, discardCard, actingSeat,
    aiChoosePlay, aiShouldBlock, aiChoosePayment, stepAI,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PROPERTY_DEAL = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
