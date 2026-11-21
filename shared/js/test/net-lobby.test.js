// The lobby panel itself is checked in two browser tabs (relay/README.md, "Local development"); these are its pure parts.
const assert = require("assert");
const NET = require("../../net/relay-client.js");
const LOBBY = require("../../net/lobby.js");

let passed = 0;
function ok(label, cond, extra) {
  if (!cond) console.error("FAIL:", label, extra !== undefined ? JSON.stringify(extra) : "");
  assert.ok(cond, label);
  passed++;
}

for (const [name, code] of Object.entries(NET.CLOSE)) {
  if (NET.FATAL.has(code)) {
    // Its own text, not the generic fallback every code gets.
    ok(name + " has its own message", LOBBY.hasCloseText(code));
  }
}
ok("a room that is gone explains itself", /ended or doesn't exist/.test(LOBBY.closeMessage(NET.CLOSE.ROOM_GONE)));
ok("an unknown code still says something", LOBBY.closeMessage(4999).includes("4999"));

ok("leaving forgets the seat", LOBBY.dropsSeat("left"));
for (const code of [NET.CLOSE.FORBIDDEN, NET.CLOSE.ROOM_GONE, NET.CLOSE.WRONG_GAME, NET.CLOSE.ROOM_FULL, NET.CLOSE.LEFT]) {
  ok("close " + code + " forgets the seat", LOBBY.dropsSeat(code));
}
// Another tab took the seat, or this page is outdated: the seat is still good after a reload.
for (const code of [NET.CLOSE.REPLACED, NET.CLOSE.VERSION, NET.CLOSE.TOO_LARGE, NET.CLOSE.BAD_MESSAGE]) {
  ok("close " + code + " keeps the seat", !LOBBY.dropsSeat(code));
}
ok("mountLobby is exported", typeof LOBBY.mountLobby === "function");

console.log("net lobby: " + passed + " checks passed");
