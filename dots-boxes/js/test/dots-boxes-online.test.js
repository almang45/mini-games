// Dots and Boxes with up to four players, and over shared/net/turn-sync.js on up to four devices,
// with the host's AI filling the empty seats.
const assert = require("assert");
const D = require("../dots-boxes.js");
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

// mulberry32, as the other tests use, so a failure replays the same game.
function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- rules with more than two players ---------------------------------------------------------

{
  assert.throws(() => D.createGame(3, 3, 1), /player count/);
  assert.throws(() => D.createGame(3, 3, 5), /player count/);
  const s = D.createGame(2, 1, 3);
  ok("three players score from zero", s.players === 3 && s.score[1] === 0 && s.score[3] === 0 && s.score[4] === undefined);
  D.play(s, 0);
  ok("no box: the turn passes to player 2", s.turn === 2);
  D.play(s, 1);
  D.play(s, 2);
  ok("after the last player, back to player 1", s.turn === 1);
  ok("undo restores the turn", D.undo(s) && s.turn === 3);
}

{
  // Four players on a random 3x3 game: every box is owned, turns go round, the winner leads.
  const random = makeRng(11);
  const s = D.createGame(3, 3, 4);
  const seen = new Set();
  while (!s.gameOver) {
    seen.add(s.turn);
    const before = s.turn;
    const made = D.play(s, D.chooseMove(s, "hard", random));
    if (!made) ok("the turn moves to the next player", s.turn === (before % 4) + 1);
  }
  const total = [1, 2, 3, 4].reduce((n, p) => n + s.score[p], 0);
  ok("every box is owned", total === 9 && s.boxes.every((b) => b >= 1 && b <= 4));
  ok("every player had a turn", seen.size === 4);
  const leaders = D.leadersOf(s);
  ok("the winner is the only leader, or nobody on a shared lead",
    leaders.length === 1 ? s.winner === leaders[0] : s.winner === null, { leaders, winner: s.winner });
}

{
  const tie = D.createGame(1, 1, 3);
  tie.score = { 1: 2, 2: 2, 3: 1 };
  ok("a shared top score is listed", JSON.stringify(D.leadersOf(tie)) === "[1,2]");
}

// ---- config -----------------------------------------------------------------------------------

ok("a config names the board and who plays each seat", D.isValidOnlineConfig({ w: 4, h: 4, controllers: [0, 1, 0, 3] }));
for (const bad of [null, [], {}, { w: 4, h: 4, controllers: [0] }, { w: 4, h: 4, controllers: [0, 1, 2, 3, 4] },
  { w: 9, h: 4, controllers: [0, 1] }, { w: "4", h: 4, controllers: [0, 1] }, { w: 4, h: 4, controllers: [1, 1] },
  { w: 4, h: 4, controllers: [0, 2, 2] }, { w: 4, h: 4, controllers: [0, 1], pad: "x" }]) {
  ok("rejects " + JSON.stringify(bad), !D.isValidOnlineConfig(bad));
}
ok("empty seats go to the host's AI", JSON.stringify(D.onlineConfig(4, [0, 2], 5, 5)) === '{"w":5,"h":5,"controllers":[0,0,2,0]}');
ok("a seat can be handed to the AI", JSON.stringify(D.withAI({ w: 4, h: 4, controllers: [0, 1, 2, 3] }, 2)) === '{"w":4,"h":4,"controllers":[0,1,0,3]}');
ok("absent players are the human seats not connected",
  JSON.stringify(D.absentPlayers({ w: 4, h: 4, controllers: [0, 1, 0, 3] }, [0, 1])) === "[3]");

// ---- over TurnSync ----------------------------------------------------------------------------

function player(hub, seat, timers, size) {
  const p = { state: null };
  p.adapter = D.createOnlineAdapter({ getState: () => p.state, setState: (next) => { p.state = next; } });
  p.session = hub.join(seat);
  p.sync = new TurnSync({ session: p.session, adapter: p.adapter, timers, onChange: (e) => {
    if (e.type === "need-round") p.sync.newRound(D.onlineConfig(hub.seats, p.session.present, size, size));
  } });
  return p;
}

function room(count, connected, size) {
  warnings = [];
  const hub = new Hub(count);
  const timers = fakeTimers();
  const players = [];
  for (let seat = 0; seat < count; seat++) players.push(player(hub, seat, timers, size || 3));
  for (const seat of connected) hub.connect(seat);
  return { hub, timers, players };
}

// One line by whichever device controls the turn (the host for an AI seat).
function step(players, random) {
  const controller = players[players[0].adapter.turnSeat()];
  return controller.sync.play(D.chooseMove(controller.state, "medium", random));
}

// Steps until `done`, failing (instead of hanging) on a refused move or a runaway game.
function stepUntil(players, random, done) {
  for (let i = 0; i < 500 && !done(); i++) ok("the move is accepted", step(players, random));
  ok("reached the wanted position", done());
}

const hashes = (players) => new Set(players.filter((p) => p.sync.started).map((p) => p.adapter.hash()));

{
  // Four seats: the host, two guests, and one seat the host's AI plays.
  const { hub, players } = room(4, [0], 4);
  const [host, second, third, fourth] = players;
  ok("an alone host starts with AI in every other seat", host.sync.started
    && JSON.stringify(host.adapter.controllers) === "[0,0,0,0]" && host.state.players === 4);
  hub.connect(1);
  hub.connect(2);
  host.sync.newRound(D.onlineConfig(4, host.session.present, 4, 4));
  ok("a new round seats the players who joined", JSON.stringify(host.adapter.controllers) === "[0,1,2,0]");
  ok("the guests get the round and the board", second.sync.started && third.sync.started && third.state.w === 4);
  ok("the absent seat doesn't hold up play", host.sync.playersPresent && host.sync.canMove());
  ok("a guest can't move on the host's turn", second.sync.play(0) === false);

  const random = makeRng(5);
  let steps = 0, aiMoves = 0;
  while (!host.state.gameOver && steps < 200) {
    const turn = host.state.turn;
    if (!step(players, random)) break;
    if (host.adapter.isAI(turn - 1)) aiMoves++;
    steps++;
    if (hashes(players).size !== 1) break;
  }
  ok("the game runs to the end", host.state.gameOver, { steps });
  ok("every device ends on the same position", hashes(players).size === 1);
  ok("the host played the AI seat", aiMoves > 0);
  ok("nobody resynced on the way", !warnings.some((w) => w.includes("resync")), warnings.slice(0, 3));
  ok("the scores are the same everywhere", JSON.stringify(third.state.score) === JSON.stringify(host.state.score));
  ok("the unconnected seat never started", !fourth.sync.started);
}

{
  const { hub, players } = room(3, [0, 1, 2]);
  const [host, two, three] = players;
  host.sync.newRound(D.onlineConfig(3, host.session.present, 3, 3));
  const random = makeRng(9);

  // Player 3 drops: everyone waits, then carries on when they return.
  stepUntil(players, random, () => host.adapter.turnSeat() === 0);
  hub.disconnect(2);
  ok("a dropped player pauses the game", !host.sync.canMove()
    && JSON.stringify(D.absentPlayers(host.sync.config, host.session.present)) === "[2]");
  hub.connect(2);
  ok("and it resumes when they return", host.sync.canMove() && three.adapter.hash() === host.adapter.hash());

  // A modified page: a line out of turn, an illegal line, something that isn't a line.
  stepUntil(players, random, () => host.adapter.turnSeat() === 1);
  const before = host.sync.moves.length;
  const drawn = host.state.lines.findIndex((x) => x);
  for (const [from, move] of [[2, 0], [1, -1], [1, 9999], [1, "3"], [1, 2.5], [1, { l: 1 }], [1, drawn]]) {
    warnings = [];
    host.session.emit("message", { from, data: { k: "move", round: host.sync.round, i: before, move, hash: "x" } });
    ok("refuses " + JSON.stringify(move) + " from seat " + from, host.sync.moves.length === before && warnings.length > 0);
  }

  // Player 2 leaves for good: the host's AI takes the seat and nothing else changes.
  const hash = host.adapter.hash();
  ok("the host hands a seat to the AI", host.sync.changeConfig(D.withAI(host.sync.config, 1)));
  ok("every device sees the AI take it", host.adapter.isAI(1) && three.adapter.isAI(1) && two.adapter.isAI(1));
  ok("with the board as it was", host.adapter.hash() === hash && three.adapter.hash() === hash);
  ok("and the host plays seat 2's turn", host.sync.canMove() && !two.sync.canMove());
  ok("an AI seat isn't waited for", D.absentPlayers(host.sync.config, [0, 2]).length === 0);
}

{
  // A bad config from a hostile host never reaches a guest's board.
  const { players } = room(2, [0, 1]);
  const guest = players[1];
  const before = guest.adapter.hash();
  guest.session.emit("message", { from: 0, data: { k: "state", round: 9, config: { w: 40, h: 40, controllers: [0, 1] }, moves: [] } });
  ok("a guest keeps its game on a bad config", guest.adapter.hash() === before && guest.sync.round === 1);
}

console.log("dots-boxes-online.test.js: " + passed + " assertions passed");
