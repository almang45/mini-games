// Ludo over shared/net/turn-sync.js: four seats, AI filling the empty ones on the host.
const assert = require("assert");
const L = require("../ludo.js");
const { TurnSync } = require("../../../shared/net/turn-sync.js");
const { Hub, fakeTimers } = require("../../../shared/js/test/net-fakes.js");

let passed = 0;
// Kept before console.error is captured below, so a failure still reaches the CI log.
const realError = console.error.bind(console);
function ok(label, cond, extra) {
  if (!cond) realError("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

let warnings = [];
console.warn = (...args) => warnings.push(args.join(" "));
console.error = (...args) => warnings.push(args.join(" "));

// Seeded, so a failure replays the same game.
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function player(hub, seat, timers) {
  const p = { state: null, events: [] };
  p.adapter = L.createOnlineAdapter({ getState: () => p.state, setState: (next) => { p.state = next; } });
  p.session = hub.join(seat);
  p.sync = new TurnSync({ session: p.session, adapter: p.adapter, timers, onChange: (e) => {
    p.events.push(e);
    if (e.type === "need-round") p.sync.newRound(L.onlineConfig(hub.seats, p.session.present));
  } });
  return p;
}

function room(count, connected) {
  warnings = [];
  const hub = new Hub(count);
  const timers = fakeTimers();
  const players = [];
  for (let seat = 0; seat < count; seat++) players.push(player(hub, seat, timers));
  for (const seat of connected) hub.connect(seat);
  return { hub, timers, players };
}

// One action by whichever device controls the turn: a roll, or a token (the AI's choice).
function step(players, random) {
  const host = players[0];
  const controller = players[host.adapter.turnSeat()];
  const s = controller.state;
  if (s.phase === "roll") return controller.sync.play({ r: 1 + Math.floor(random() * 6) });
  return controller.sync.play({ t: L.chooseMove(s, "normal") });
}

// Steps until `done`, failing (instead of hanging) on a refused action or a runaway game.
function stepUntil(players, random, done) {
  for (let i = 0; i < 1000 && !done(); i++) ok("the action is accepted", step(players, random));
  ok("reached the wanted turn", done());
}

const hashes = (players) => new Set(players.filter((p) => p.sync.started).map((p) => p.adapter.hash()));

// ---- config ---------------------------------------------------------------------------------

ok("a config names who plays each seat", L.isValidOnlineConfig({ count: 4, controllers: [0, 1, 0, 3] }));
ok("absent players are the human seats not connected",
  JSON.stringify(L.absentPlayers({ count: 4, controllers: [0, 1, 0, 3] }, [0, 1])) === "[3]"
  && L.absentPlayers({ count: 4, controllers: [0, 0, 0, 0] }, [0]).length === 0);
for (const bad of [null, {}, { count: 5, controllers: [0, 1, 2, 3, 4] }, { count: 2, controllers: [0] },
  { count: 2, controllers: [1, 1] }, { count: 3, controllers: [0, 2, 2] }, { count: 2, controllers: [0, 1], pad: "x" }]) {
  ok("rejects " + JSON.stringify(bad), !L.isValidOnlineConfig(bad));
}
ok("empty seats go to the host's AI", JSON.stringify(L.onlineConfig(4, [0, 2]).controllers) === "[0,0,2,0]");
ok("a seat can be handed to the AI", JSON.stringify(L.withAI({ count: 4, controllers: [0, 1, 2, 3] }, 2)) === '{"count":4,"controllers":[0,1,0,3]}');

// ---- a full four-seat game: two guests, one AI seat ---------------------------------------------

{
  const { hub, players } = room(4, [0]);
  const [host, green, yellow, blue] = players;
  ok("an alone host starts with AI in every other seat", host.sync.started
    && JSON.stringify(host.adapter.controllers) === "[0,0,0,0]");
  hub.connect(1);
  hub.connect(2);
  host.sync.newRound(L.onlineConfig(4, host.session.present));
  ok("a new round seats the players who joined", JSON.stringify(host.adapter.controllers) === "[0,1,2,0]");
  ok("the guests get the round", green.sync.started && yellow.sync.started && green.adapter.isAI(3));
  ok("blue is the host's AI", host.adapter.isAI(3) && !host.adapter.isAI(1));
  ok("the absent seat doesn't hold up play", host.sync.playersPresent && host.sync.canMove());
  ok("a guest can't act on the host's turn", green.sync.play({ r: 6 }) === false);

  const random = rng(7);
  let steps = 0, aiActions = 0;
  while (!host.state.gameOver && steps < 5000) {
    const turn = host.state.turn;
    if (!step(players, random)) break;
    if (host.adapter.isAI(turn)) aiActions++;
    steps++;
    if (hashes(players).size !== 1) break;
  }
  ok("the game runs to the end", host.state.gameOver, { steps });
  ok("every device ends on the same position", hashes(players).size === 1);
  ok("the host played the AI seat", aiActions > 0);
  ok("nobody resynced on the way", !warnings.some((w) => w.includes("resync")), warnings.slice(0, 3));
  ok("the winner is the same everywhere", green.state.winner === host.state.winner && yellow.state.winner === host.state.winner);
  ok("blue never connected", !blue.sync.started);
}

// ---- joining, dropping, cheating --------------------------------------------------------------------

{
  const { hub, players } = room(4, [0, 1]);
  const [host, green, , blue] = players;
  host.sync.newRound(L.onlineConfig(4, host.session.present));
  const random = rng(3);
  for (let i = 0; i < 40; i++) step(players, random);
  hub.connect(3);
  ok("a player joining mid-game watches it", blue.sync.started && blue.adapter.hash() === host.adapter.hash());
  ok("and controls nothing until the next round", blue.adapter.isAI(3) && !blue.sync.canMove());
  host.sync.newRound(L.onlineConfig(4, host.session.present));
  ok("the next round seats them", JSON.stringify(blue.adapter.controllers) === "[0,1,0,3]");

  // Green drops: green is a player this round, so nobody may move until it is back - not even
  // the host on its own turn.
  stepUntil(players, random, () => host.adapter.turnSeat() === 0);
  ok("the host may move on its turn", host.sync.canMove());
  hub.disconnect(1);
  ok("a dropped player pauses the game", !host.sync.playersPresent && !blue.sync.playersPresent && !host.sync.canMove());
  hub.connect(1);
  ok("and it resumes when they return", host.sync.canMove() && green.adapter.hash() === host.adapter.hash());

  stepUntil(players, random, () => host.adapter.turnSeat() === 1);
  warnings = [];
  host.session.emit("message", { from: 1, data: { k: "move", round: host.sync.round, i: host.sync.moves.length, move: { r: 9 }, hash: "x" } });
  ok("a die that isn't 1-6 is refused", warnings.some((w) => w.includes("illegal_move")) && green.adapter.hash() === host.adapter.hash());
  const moves = host.sync.moves.length;
  host.session.emit("message", { from: 2, data: { k: "move", round: host.sync.round, i: moves, move: { r: 6 }, hash: "x" } });
  ok("a seat moving out of turn is refused", host.sync.moves.length === moves && warnings.some((w) => w.includes("out_of_order")));

  // A modified page sends moves carrying more than a roll or a token.
  stepUntil(players, random, () => host.adapter.turnSeat() === 1 && host.state.phase === "roll");
  for (const move of [{ r: 1, t: 0 }, { r: 6, p: "a".repeat(1000) }, { t: 0, r: 2 }, [], 3]) {
    warnings = [];
    const before = host.sync.moves.length;
    host.session.emit("message", { from: 1, data: { k: "move", round: host.sync.round, i: before, move, hash: "x" } });
    ok("a move like " + JSON.stringify(move).slice(0, 20) + " is refused", host.sync.moves.length === before && warnings.some((w) => w.includes("illegal_move")));
  }

  // Green leaves for good mid-game: the host hands the seat to its AI, and nothing else changes.
  const hash = host.adapter.hash();
  const played = host.sync.moves.length;
  ok("the host hands a seat to the AI", host.sync.changeConfig(L.withAI(host.sync.config, 1)));
  ok("every device sees the AI take it", host.adapter.isAI(1) && blue.adapter.isAI(1) && green.adapter.isAI(1));
  ok("with the game as it was", host.adapter.hash() === hash && blue.adapter.hash() === hash && host.sync.moves.length === played);
  ok("and the host plays green's turn", host.sync.canMove() && !green.sync.canMove());
  ok("a bad config change is refused", !host.sync.changeConfig({ count: 4, controllers: [1, 1, 1, 1] }) && host.sync.started);
  ok("only the host changes the round", (() => { try { green.sync.changeConfig(host.sync.config); return false; } catch { return true; } })());
}

{
  // A bad config from a hostile host never reaches a guest's board.
  const { players } = room(2, [0, 1]);
  const guest = players[1];
  const before = guest.adapter.hash();
  guest.session.emit("message", { from: 0, data: { k: "state", round: 9, config: { count: 2, controllers: [1, 1] }, moves: [] } });
  ok("a guest keeps its game on a bad config", guest.adapter.hash() === before && guest.sync.round === 1);
}

console.log("ludo-online.test.js: " + passed + " assertions passed");
