// Bust Seven engine - push-your-luck with the Flip 7 rules. 2-4 seats.
// 94-card deck: one 0 and N copies of each number N (1-12), modifiers
// +2/+4/+6/+8/+10/x2, and three each of Freeze, Flip Three, Second Chance.
// Every card is face up. A round ends when nobody is left drawing, or the
// moment someone holds seven different numbers. First to 200 at the end of a
// round wins; a tie at the top plays another round.
//
// The deck carries over between rounds and is only reshuffled (from the
// discards) when it runs out, so what's left in it is public knowledge - the
// AI reads its contents (never its order) the way a player counting cards
// would.
(function (root) {
  "use strict";
  const CARDS = typeof module !== "undefined" && module.exports
    ? require("../core/cards.js")
    : root.CARDS;

  const TARGET = 200;
  const SEVEN_BONUS = 15;
  const UNIQUE_TO_WIN = 7;
  const ADD_MODIFIERS = [2, 4, 6, 8, 10];
  const ACTIONS = ["freeze", "flip3", "second"];
  const ACTION_NAME = { freeze: "Freeze", flip3: "Flip Three", second: "Second Chance" };

  let nextCardId = 0;
  function num(value) { return { kind: "number", value, id: "n" + value + "-" + nextCardId++ }; }
  function add(value) { return { kind: "add", value, id: "a" + value + "-" + nextCardId++ }; }
  function times2() { return { kind: "x2", id: "x2-" + nextCardId++ }; }
  function action(type) { return { kind: "action", value: type, id: type + "-" + nextCardId++ }; }

  function buildDeck() {
    const deck = [num(0)];
    for (let v = 1; v <= 12; v++) for (let k = 0; k < v; k++) deck.push(num(v));
    ADD_MODIFIERS.forEach((v) => deck.push(add(v)));
    deck.push(times2());
    ACTIONS.forEach((type) => { for (let k = 0; k < 3; k++) deck.push(action(type)); });
    return deck;
  }

  function cardLabel(card) {
    if (card.kind === "number") return String(card.value);
    if (card.kind === "add") return "+" + card.value;
    if (card.kind === "x2") return "x2";
    return ACTION_NAME[card.value];
  }

  function emptyHand() {
    return { numbers: [], mods: [], second: null, actions: [], bustCard: null, status: "active", roundScore: 0 };
  }

  // x2 doubles the number cards only; +N modifiers and the seven bonus are
  // added after it.
  function handScore(hand) {
    if (hand.status === "bust") return 0;
    const numbers = hand.numbers.reduce((sum, c) => sum + c.value, 0);
    const doubled = hand.mods.some((c) => c.kind === "x2") ? numbers * 2 : numbers;
    const bonus = hand.mods.reduce((sum, c) => sum + (c.kind === "add" ? c.value : 0), 0);
    return doubled + bonus + (hand.status === "seven" ? SEVEN_BONUS : 0);
  }

  const isActive = (state, seat) => state.hands[seat].status === "active";
  const holds = (hand, value) => hand.numbers.some((c) => c.value === value);
  const say = (state, text) => state.log.push({ text, fresh: true });
  const nameOf = (state, seat) => state.seats[seat].name;

  function createGame(seatTypes, opts) {
    const n = seatTypes.length;
    if (n < 2 || n > 4) throw new Error("Bust Seven supports 2-4 seats");
    const rng = opts && opts.rng;
    return {
      game: "bust-seven",
      seats: seatTypes.map((type, i) => ({ type, name: (opts && opts.names && opts.names[i]) || "Seat " + (i + 1), score: 0 })),
      rng,
      deck: CARDS.shuffle(buildDeck(), rng),
      discard: [],
      hands: seatTypes.map(emptyHand),
      round: 0,
      // Seat 1 deals first, so the deal - and every turn - starts with seat 2.
      dealer: n - 1,
      queue: [],
      turnPointer: null,
      turnSeat: null,
      pending: null,
      phase: "round-over",
      gameOver: false,
      winner: null,
      log: [{ text: "Bust Seven - first to " + TARGET + ". Deal to begin.", fresh: true }],
    };
  }

  function drawCard(state) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) throw new Error("no cards left to draw");
      state.deck = CARDS.shuffle(state.discard, state.rng);
      state.discard = [];
      say(state, "The deck ran out - the discards are reshuffled.");
    }
    return state.deck.shift();
  }

  // Cards the next draw comes from: the deck, or the discards it will be
  // reshuffled from when it's empty.
  function drawSource(state) { return state.deck.length > 0 ? state.deck : state.discard; }

  // ------------------------------------------------------------- the round
  //
  // Card flow runs off a task queue so action cards resolve in the right
  // order: a Flip Three pushes three flips and an "ftEnd" to the front, and
  // the Freeze/Flip Three cards it turns up wait on that ftEnd's `deferred`
  // list until all three are flipped. advance() works the queue until a seat
  // has to decide something (hit/stay, or who an action card goes to).

  function startRound(state) {
    if (state.gameOver) throw new Error("game is over");
    if (state.phase !== "round-over") throw new Error("current round has not finished");
    const n = state.seats.length;
    state.round += 1;
    state.dealer = (state.dealer + 1) % n;
    state.hands = state.seats.map(emptyHand);
    state.queue = [];
    for (let k = 1; k <= n; k++) state.queue.push({ type: "flip", seat: (state.dealer + k) % n });
    state.turnPointer = state.dealer;
    state.turnSeat = null;
    state.pending = null;
    state.phase = "flow";
    say(state, "Round " + state.round + " - " + nameOf(state, state.dealer) + " deals.");
    advance(state);
  }

  function advance(state) {
    while (state.phase === "flow") {
      if (state.queue.length > 0) {
        runTask(state, state.queue.shift());
        continue;
      }
      if (!state.hands.some((h) => h.status === "active")) { endRound(state); return; }
      const n = state.seats.length;
      for (let k = 1; k <= n; k++) {
        const seat = (state.turnPointer + k) % n;
        if (isActive(state, seat)) { state.turnSeat = seat; break; }
      }
      state.phase = "turn";
    }
  }

  function runTask(state, task) {
    if (task.type === "flip") {
      if (isActive(state, task.seat)) flipTo(state, task.seat, task.flipThree);
    } else if (task.type === "ftEnd") {
      if (isActive(state, task.seat)) {
        state.queue.unshift(...task.deferred.map((card) => ({ type: "resolve", seat: task.seat, card })));
      } else {
        state.discard.push(...task.deferred);
      }
    } else if (task.type === "resolve" && !isActive(state, task.seat)) {
      // A seat that bust or froze itself resolving one waiting card loses the rest.
      state.discard.push(task.card);
      say(state, nameOf(state, task.seat) + " is out of the round - their " + cardLabel(task.card) + " is discarded.");
    } else if (task.type === "resolve") {
      beginResolve(state, task.seat, task.card);
    }
  }

  // `flipThree` is the ftEnd task of a Flip Three in progress for this seat.
  function flipTo(state, seat, flipThree) {
    const card = drawCard(state);
    const hand = state.hands[seat];
    const who = nameOf(state, seat);
    if (card.kind === "number") {
      if (!holds(hand, card.value)) {
        hand.numbers.push(card);
        say(state, who + " flips " + card.value + ".");
        if (hand.numbers.length === UNIQUE_TO_WIN) {
          hand.status = "seven";
          say(state, who + " has seven different numbers! +" + SEVEN_BONUS + ", and the round ends.");
          endRound(state);
        }
      } else if (hand.second) {
        state.discard.push(card, hand.second);
        hand.second = null;
        say(state, who + " flips a second " + card.value + " - Second Chance saves them.");
      } else {
        hand.bustCard = card;
        hand.status = "bust";
        say(state, who + " flips a second " + card.value + " and busts.");
      }
    } else if (card.kind !== "action") {
      hand.mods.push(card);
      say(state, who + " flips " + cardLabel(card) + ".");
    } else if (card.value === "second" && !hand.second) {
      hand.second = card;
      say(state, who + " flips a Second Chance and keeps it.");
    } else if (card.value !== "second" && flipThree) {
      flipThree.deferred.push(card);
      say(state, who + " flips " + cardLabel(card) + " - it waits until the Flip Three is done.");
    } else {
      say(state, who + " flips " + cardLabel(card) + ".");
      state.queue.unshift({ type: "resolve", seat, card });
    }
  }

  function targetsFor(state, seat, card) {
    const active = state.hands.map((h, i) => i).filter((i) => isActive(state, i));
    if (card.value === "second") return active.filter((i) => i !== seat && !state.hands[i].second);
    return active;
  }

  // Only a real choice stops for a decision; one legal target is applied
  // straight away, and a card nobody can take is discarded.
  function beginResolve(state, seat, card) {
    const targets = targetsFor(state, seat, card);
    if (targets.length === 0) {
      state.discard.push(card);
      say(state, "Nobody can take the " + cardLabel(card) + " - it's discarded.");
    } else if (targets.length === 1) {
      applyAction(state, seat, card, targets[0]);
    } else {
      state.pending = { seat, card, targets };
      state.phase = "target";
    }
  }

  function applyAction(state, seat, card, target) {
    const hand = state.hands[target];
    const to = target === seat ? "themselves" : nameOf(state, target);
    if (card.value === "second") {
      hand.second = card;
      say(state, nameOf(state, seat) + " gives the extra Second Chance to " + to + ".");
    } else if (card.value === "freeze") {
      hand.actions.push(card);
      hand.status = "frozen";
      say(state, nameOf(state, seat) + " freezes " + to + " - they bank " + handScore(hand) + ".");
    } else {
      hand.actions.push(card);
      say(state, nameOf(state, seat) + " makes " + to + " flip three.");
      const end = { type: "ftEnd", seat: target, deferred: [] };
      state.queue.unshift(
        { type: "flip", seat: target, flipThree: end },
        { type: "flip", seat: target, flipThree: end },
        { type: "flip", seat: target, flipThree: end },
        end);
    }
  }

  function endRound(state) {
    state.phase = "round-over";
    state.turnSeat = null;
    state.pending = null;
    // A seven ends the round mid-queue; deferred action cards still waiting
    // on a Flip Three go to the discards with everything else.
    state.queue.forEach((task) => {
      if (task.type === "ftEnd") state.discard.push(...task.deferred);
      else if (task.type === "resolve") state.discard.push(task.card);
    });
    state.queue = [];
    state.hands.forEach((hand, i) => {
      hand.roundScore = handScore(hand);
      state.seats[i].score += hand.roundScore;
      state.discard.push(...hand.numbers, ...hand.mods, ...hand.actions);
      if (hand.second) state.discard.push(hand.second);
      if (hand.bustCard) state.discard.push(hand.bustCard);
    });
    say(state, "Round " + state.round + ": " + state.seats.map((s, i) =>
      s.name + " +" + state.hands[i].roundScore + " (" + s.score + ")").join(", ") + ".");
    const best = Math.max(...state.seats.map((s) => s.score));
    const leaders = state.seats.map((s, i) => i).filter((i) => state.seats[i].score === best);
    if (best >= TARGET && leaders.length === 1) {
      state.gameOver = true;
      state.winner = leaders[0];
      say(state, nameOf(state, leaders[0]) + " wins with " + best + ".");
    } else if (best >= TARGET) {
      say(state, "Tied at " + best + " - one more round.");
    }
  }

  // --------------------------------------------------------------- actions

  function requireTurn(state, seat) {
    if (state.phase !== "turn" || state.turnSeat !== seat) throw new Error("not this seat's turn");
  }

  function hit(state, seat) {
    requireTurn(state, seat);
    state.turnPointer = seat;
    state.phase = "flow";
    state.queue.push({ type: "flip", seat });
    advance(state);
  }

  function stay(state, seat) {
    requireTurn(state, seat);
    state.turnPointer = seat;
    state.hands[seat].status = "stayed";
    say(state, nameOf(state, seat) + " stays on " + handScore(state.hands[seat]) + ".");
    state.phase = "flow";
    advance(state);
  }

  function chooseTarget(state, seat, target) {
    const p = state.pending;
    if (state.phase !== "target" || !p || p.seat !== seat) throw new Error("no action card waiting on this seat");
    if (!p.targets.includes(target)) throw new Error("not a legal target");
    state.pending = null;
    state.phase = "flow";
    applyAction(state, seat, p.card, target);
    advance(state);
  }

  // --------------------------------------------------------------------- AI

  // Chance the next card is a number this seat already holds.
  function bustChance(state, seat) {
    const source = drawSource(state);
    if (source.length === 0) return 0;
    const hand = state.hands[seat];
    return source.filter((c) => c.kind === "number" && holds(hand, c.value)).length / source.length;
  }

  // Average points the next card adds when it doesn't bust.
  function expectedGain(state, seat) {
    const hand = state.hands[seat];
    const doubled = hand.mods.some((c) => c.kind === "x2");
    const numberSum = hand.numbers.reduce((sum, c) => sum + c.value, 0);
    let total = 0;
    let count = 0;
    drawSource(state).forEach((c) => {
      if (c.kind === "number") {
        if (holds(hand, c.value)) return;
        const sevenBonus = hand.numbers.length === UNIQUE_TO_WIN - 1 ? SEVEN_BONUS : 0;
        total += c.value * (doubled ? 2 : 1) + sevenBonus;
      } else if (c.kind === "add") total += c.value;
      else if (c.kind === "x2") total += doubled ? 0 : numberSum;
      count += 1;
    });
    return count === 0 ? 0 : total / count;
  }

  // One-card lookahead: hit while the expected hand after the next card beats
  // the hand now. A card that can't bust is always taken. Two end-of-game
  // overrides: bank a winning total, and keep drawing when someone has
  // already banked more than this seat can by stopping.
  function aiShouldHit(state, seat) {
    const hand = state.hands[seat];
    if (drawSource(state).length === 0) return false; // nothing left to draw
    const p = bustChance(state, seat);
    if (p === 0) return true;
    const now = handScore(hand);
    const mine = state.seats[seat].score + now;
    const others = state.seats.map((s, i) => i).filter((i) => i !== seat);
    const projected = (i) => state.seats[i].score + handScore(state.hands[i]);
    if (mine >= TARGET && others.every((i) => mine > projected(i))) return false;
    const banked = others.filter((i) => ["stayed", "frozen"].includes(state.hands[i].status) && projected(i) >= TARGET);
    if (banked.some((i) => projected(i) >= mine)) return true;
    if (hand.second) return true;
    const gain = expectedGain(state, seat);
    return (1 - p) * (now + gain) > now;
  }

  // Expected change to a seat's hand from flipping three: a rough
  // independent-draws estimate, enough to rank who to aim it at.
  function flipThreeDelta(state, seat) {
    const p = bustChance(state, seat);
    const bust3 = state.hands[seat].second ? p * p * 3 : 1 - Math.pow(1 - p, 3);
    return (1 - bust3) * 3 * expectedGain(state, seat) - bust3 * handScore(state.hands[seat]);
  }

  // What drawing one more card is worth to a seat; freezing a seat takes
  // that away, so a big positive value is the best Freeze target.
  function nextCardValue(state, seat) {
    const p = bustChance(state, seat);
    return (1 - p) * expectedGain(state, seat) - p * handScore(state.hands[seat]);
  }

  function threat(state, seat) { return state.seats[seat].score + handScore(state.hands[seat]); }

  function aiChooseTarget(state, seat) {
    const { card, targets } = state.pending;
    const opponents = targets.filter((t) => t !== seat);
    const best = (list, value) => list.reduce((a, b) => (value(b) > value(a) ? b : a));
    if (card.value === "second") return best(targets, (t) => -threat(state, t));
    if (opponents.length === 0) return seat;
    // Small lean toward hurting whoever is ahead overall.
    const lean = (t) => threat(state, t) / 20;
    if (card.value === "freeze") {
      const target = best(opponents, (t) => nextCardValue(state, t) + lean(t));
      // Freezing a seat that's better off stopping only helps it; bank
      // this seat instead when it would stay anyway.
      if (nextCardValue(state, target) <= 0 && !aiShouldHit(state, seat)) return seat;
      return target;
    }
    const target = best(opponents, (t) => -flipThreeDelta(state, t) + lean(t));
    return flipThreeDelta(state, seat) > -flipThreeDelta(state, target) + lean(target) ? seat : target;
  }

  function stepAI(state, seat) {
    if (state.phase === "target") chooseTarget(state, seat, aiChooseTarget(state, seat));
    else if (aiShouldHit(state, seat)) hit(state, seat);
    else stay(state, seat);
  }

  // Seat that must act now (hit/stay or pick a target), or null.
  function actingSeat(state) {
    if (state.gameOver) return null;
    if (state.phase === "turn") return state.turnSeat;
    if (state.phase === "target") return state.pending.seat;
    return null;
  }

  const api = {
    TARGET, SEVEN_BONUS, ACTION_NAME,
    num, add, times2, action, buildDeck, cardLabel, emptyHand, handScore,
    createGame, startRound, hit, stay, chooseTarget, actingSeat,
    bustChance, expectedGain, aiShouldHit, aiChooseTarget, stepAI,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.BUST_SEVEN = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
