import { FakeContext, ok, count, logs } from "./fakes.js";
import { Room, IDLE_TTL_MS, MAX_AGE_MS, HELLO_TIMEOUT_MS, BUCKET_SIZE, STALE_MS, SWEEP_MS, RECLAIM_GRACE_MS } from "../room.js";
import { CLOSE, MAX_MESSAGE_CHARS, PROTOCOL_VERSION } from "../protocol.js";

let clock = 1_000_000;
Date.now = () => clock;

async function newRoom(seats = 2, game = "connect-four") {
  const ctx = new FakeContext();
  const room = new Room(ctx, {});
  await room.ready;
  const res = await room.init({ code: "ABCDE", game, seats });
  return { ctx, room, res, host: await res.json() };
}

async function connect(room, ctx, hello) {
  const ws = ctx.socket();
  await room.accept(ws);
  await room.webSocketMessage(ws, JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, game: "connect-four", ...hello }));
  return ws;
}

// ---- creation ---------------------------------------------------------------

{
  const { ctx, room, res, host } = await newRoom();
  ok("init answers 201", res.status === 201);
  ok("creator holds seat 0", host.seat === 0 && /^[0-9a-f]{32}$/.test(host.token));
  ok("token is stored hashed, never raw", !JSON.stringify([...ctx.data.values()]).includes(host.token));
  ok("a fresh room expires if nobody connects", ctx.alarmAt === clock + IDLE_TTL_MS);
  const again = await room.init({ code: "ABCDE", game: "connect-four", seats: 2 });
  ok("a code in use can't be created twice", again.status === 409);
}

// ---- seats ------------------------------------------------------------------

{
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  const welcomeA = a.last();
  ok("host resumes seat 0 with its token", welcomeA.t === "welcome" && welcomeA.seat === 0 && welcomeA.token === host.token);
  ok("welcome lists who is present", JSON.stringify(welcomeA.present) === "[0]");
  ok("an occupied room doesn't expire, only sweeps", ctx.alarmAt <= clock + SWEEP_MS && room.meta.idleSince === null);

  const b = await connect(room, ctx, {});
  const welcomeB = b.last();
  ok("a guest without a token gets the next free seat", welcomeB.seat === 1 && welcomeB.token && welcomeB.token !== host.token);
  ok("the host hears the guest join", JSON.stringify(a.last()) === JSON.stringify({ t: "peer", seat: 1, state: "joined" }));

  const c = await connect(room, ctx, {});
  ok("a third player is turned away from a two-seat room", c.closedWith && c.closedWith.code === CLOSE.ROOM_FULL);

  const thief = await connect(room, ctx, { token: "f".repeat(32) });
  ok("an unknown token is refused", thief.closedWith && thief.closedWith.code === CLOSE.FORBIDDEN);

  // Relay: broadcast and direct.
  await room.webSocketMessage(a, JSON.stringify({ t: "msg", data: { k: "move", col: 3 } }));
  ok("a message reaches the other seat with its sender", JSON.stringify(b.last()) === JSON.stringify({ t: "msg", from: 0, data: { k: "move", col: 3 } }));
  ok("the sender doesn't get its own message back", a.last().t === "peer");
  await room.webSocketMessage(b, JSON.stringify({ t: "msg", to: 0, data: "hi" }));
  ok("a direct message reaches its recipient", a.last().data === "hi" && a.last().from === 1);
  await room.webSocketMessage(b, JSON.stringify({ t: "msg", to: 1, data: "self" }));
  ok("sending to yourself is a protocol error", b.closedWith && b.closedWith.code === CLOSE.BAD_MESSAGE);
  await room.webSocketClose(b, CLOSE.BAD_MESSAGE, "bad_recipient");
  ok("the host hears that the guest dropped", a.last().t === "peer" && a.last().state === "left");
}

// ---- reconnect, replace, leave ------------------------------------------------

{
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  const b = await connect(room, ctx, {});
  const guestToken = b.last().token;

  // The guest's phone drops off; the host hears it, then hears it come back.
  b.close(1006, "");
  await room.webSocketClose(b, 1006, "");
  ok("a dropped guest is reported as left", a.last().state === "left" && a.last().seat === 1);
  const b2 = await connect(room, ctx, { token: guestToken });
  ok("the guest resumes the same seat", b2.last().seat === 1);
  ok("the host hears the guest come back", a.last().state === "joined");

  // Same seat opened again (a second tab): the newer socket wins, and no "left" is announced.
  const b3 = await connect(room, ctx, { token: guestToken });
  ok("the older socket for a seat is replaced", b2.closedWith && b2.closedWith.code === CLOSE.REPLACED);
  await room.webSocketClose(b2, CLOSE.REPLACED, "replaced");
  ok("a replaced socket isn't announced as left", a.last().state === "joined");

  await room.webSocketMessage(b3, JSON.stringify({ t: "leave" }));
  ok("leaving closes the socket", b3.closedWith && b3.closedWith.code === CLOSE.LEFT);
  ok("the host hears the seat is gone", a.last().state === "gone");
  const b4 = await connect(room, ctx, { token: guestToken });
  ok("a token that was given up no longer works", b4.closedWith && b4.closedWith.code === CLOSE.FORBIDDEN);
  const b5 = await connect(room, ctx, {});
  ok("the freed seat can be taken again", b5.last().seat === 1);

  await room.webSocketMessage(a, JSON.stringify({ t: "leave" }));
  ok("the host leaving ends the room for everyone", b5.closedWith && b5.closedWith.code === CLOSE.ROOM_GONE);
  ok("an ended room keeps nothing", ctx.data.size === 0 && ctx.alarmAt === null);
  const late = await connect(room, ctx, {});
  ok("joining an ended room says it is gone", late.closedWith && late.closedWith.code === CLOSE.ROOM_GONE);
}

// ---- validation ---------------------------------------------------------------

{
  const { ctx, room, host } = await newRoom();
  const cases = [
    ["a binary frame", new ArrayBuffer(4), CLOSE.BAD_MESSAGE],
    ["invalid JSON", "{", CLOSE.BAD_MESSAGE],
    ["a message before hello", JSON.stringify({ t: "msg", data: 1 }), CLOSE.BAD_MESSAGE],
    ["an old protocol version", JSON.stringify({ t: "hello", v: 0, game: "connect-four" }), CLOSE.VERSION],
    ["another game's code", JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, game: "reversi" }), CLOSE.WRONG_GAME],
    ["an oversized token", JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, game: "connect-four", token: "x".repeat(65) }), CLOSE.BAD_MESSAGE],
    ["an oversized frame", "x".repeat(MAX_MESSAGE_CHARS + 1), CLOSE.TOO_LARGE],
  ];
  for (const [label, frame, code] of cases) {
    const ws = ctx.socket();
    await room.accept(ws);
    await room.webSocketMessage(ws, frame);
    ok(label + " is refused with " + code, ws.closedWith && ws.closedWith.code === code, ws.closedWith);
  }

  const a = await connect(room, ctx, { token: host.token });
  // The hello already used one token from the bucket.
  for (let i = 1; i < BUCKET_SIZE; i++) await room.webSocketMessage(a, JSON.stringify({ t: "msg", data: i }));
  ok("a burst within the bucket is allowed", a.closedWith === null);
  await room.webSocketMessage(a, JSON.stringify({ t: "msg", data: "flood" }));
  ok("flooding past the bucket closes the socket", a.closedWith && a.closedWith.code === CLOSE.RATE_LIMITED);
  ok("rejections are logged with their reason", logs.some((entry) => entry.event === "socket_rejected" && entry.reason === "rate_limited"));
}

// ---- expiry -------------------------------------------------------------------

{
  const { ctx, room, host } = await newRoom();
  const silent = ctx.socket();
  await room.accept(silent);
  ok("an unidentified socket gets a hello deadline", ctx.alarmAt === clock + HELLO_TIMEOUT_MS);
  clock += HELLO_TIMEOUT_MS;
  await room.alarm();
  ok("a socket that never says hello is closed", silent.closedWith && silent.closedWith.code === CLOSE.HELLO_TIMEOUT);
  ok("the room itself survives", ctx.data.has("meta"));

  const a = await connect(room, ctx, { token: host.token });
  a.close(1001, "");
  await room.webSocketClose(a, 1001, "");
  ok("an empty room arms the idle timer", ctx.alarmAt === clock + IDLE_TTL_MS);
  clock += IDLE_TTL_MS - 1;
  await room.alarm();
  ok("it survives until the idle timer runs out", ctx.data.has("meta"));
  clock += 1;
  await room.alarm();
  ok("an idle room is deleted", ctx.data.size === 0 && room.meta === null);
}

{
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  clock += MAX_AGE_MS;
  await room.alarm();
  ok("even a busy room ends at the maximum age", a.closedWith && a.closedWith.code === CLOSE.ROOM_GONE && ctx.data.size === 0);
}

{
  // A woken object reloads its room from storage.
  const { ctx, host } = await newRoom(4);
  const revived = new Room(ctx, {});
  await revived.ready;
  ok("a room survives the object being evicted", revived.meta && revived.meta.seats === 4);
  const a = await connect(revived, ctx, { token: host.token });
  ok("and its host can still resume", a.last().seat === 0);
}

// ---- review fixes: reclaim, hello races, liveness ------------------------------------

{
  // The guest opens the link in a new tab: no token, and its old socket is gone.
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  const b = await connect(room, ctx, {});
  const oldToken = b.last().token;
  b.close(1006, "");
  await room.webSocketClose(b, 1006, "");
  const early = await connect(room, ctx, {});
  ok("a seat that just dropped can't be taken by a code holder", early.closedWith && early.closedWith.code === CLOSE.ROOM_FULL);
  clock += RECLAIM_GRACE_MS - 1000;
  const stillEarly = await connect(room, ctx, {});
  ok("nor before the grace period ends", stillEarly.closedWith && stillEarly.closedWith.code === CLOSE.ROOM_FULL);
  clock += 1000;
  const b2 = await connect(room, ctx, {});
  ok("a tokenless guest reclaims a guest seat empty for the grace period", b2.last().t === "welcome" && b2.last().seat === 1);
  ok("the reclaim is logged", logs.some((entry) => entry.event === "seat_reclaimed" && entry.seat === 1));
  const ghost = await connect(room, ctx, { token: oldToken });
  ok("the old token no longer works", ghost.closedWith && ghost.closedWith.code === CLOSE.FORBIDDEN);
  a.close(1000, "");
  await room.webSocketClose(a, 1000, "");
  const intruder = await connect(room, ctx, {});
  ok("the host seat is never reclaimed", intruder.closedWith && intruder.closedWith.code === CLOSE.ROOM_FULL);
}

{
  const { ctx, room } = await newRoom(3);
  const ws = ctx.socket();
  await room.accept(ws);
  const hello = JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, game: "connect-four" });
  const first = room.webSocketMessage(ws, hello);
  const second = room.webSocketMessage(ws, hello);
  await Promise.all([first, second]);
  ok("a second hello during the first is refused", ws.closedWith && ws.closedWith.code === CLOSE.BAD_MESSAGE);
  ok("and claims no seat", room.meta.tokens.filter(Boolean).length === 1);
}

{
  const { ctx, room } = await newRoom(3);
  const ws = ctx.socket();
  await room.accept(ws);
  const pending = room.webSocketMessage(ws, JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, game: "connect-four" }));
  room.closeSocket(ws, CLOSE.HELLO_TIMEOUT, "hello_timeout");
  await pending;
  ok("a socket closed while its hello hashed gets no seat", room.meta.tokens.filter(Boolean).length === 1 && ws.frames().length === 0);
}

{
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  const b = await connect(room, ctx, {});
  ok("an occupied room sweeps for dead sockets", ctx.alarmAt <= clock + SWEEP_MS);
  clock += STALE_MS / 2;
  a.autoAt = clock;
  clock += STALE_MS / 2 + 1000;
  await room.alarm();
  ok("a pinging seat survives the sweep", !a.closedWith);
  ok("a silent seat is closed as stale", b.closedWith && b.closedWith.code === CLOSE.STALE);
  ok("and the host hears it left", a.last().t === "peer" && a.last().seat === 1 && a.last().state === "left");
  const before = a.sent.length;
  await room.webSocketClose(b, CLOSE.STALE, "stale");
  ok("the close event doesn't announce it twice", a.sent.length === before);
  clock += STALE_MS + 1000;
  await room.alarm();
  ok("once everyone is stale the room starts its idle timer", a.closedWith && a.closedWith.code === CLOSE.STALE && room.meta.idleSince === clock);
}

{
  // A guest that comes back inside the grace period keeps its seat, and the clock restarts.
  const { ctx, room, host } = await newRoom();
  await connect(room, ctx, { token: host.token });
  const b = await connect(room, ctx, {});
  const token = b.last().token;
  b.close(1006, "");
  await room.webSocketClose(b, 1006, "");
  clock += RECLAIM_GRACE_MS - 1000;
  const back = await connect(room, ctx, { token });
  ok("the guest resumes inside the grace period", back.last().t === "welcome" && back.last().seat === 1);
  ok("which clears its empty-since time", room.meta.leftAt[1] === null);
}

{
  const { ctx, room, host } = await newRoom();
  const a = await connect(room, ctx, { token: host.token });
  a.autoAt = clock;
  const before = ctx.puts;
  clock += SWEEP_MS;
  a.autoAt = clock;
  await room.alarm();
  ok("a sweep that finds nothing writes nothing", ctx.puts === before && !a.closedWith);
}

{
  // The host reconnects every 30 s; a vanished guest must still be swept.
  const { ctx, room, host } = await newRoom();
  let a = await connect(room, ctx, { token: host.token });
  const b = await connect(room, ctx, {});
  clock = ctx.alarmAt; // the earlier hello-timeout alarm fires and schedules the sweep
  await room.alarm();
  const sweepAt = ctx.alarmAt;
  ok("the next sweep is a minute out", sweepAt === clock + SWEEP_MS);
  clock += 30 * 1000;
  a.close(1006, "");
  await room.webSocketClose(a, 1006, "");
  a = await connect(room, ctx, { token: host.token });
  ok("a reconnect never pushes the pending sweep later", ctx.alarmAt <= sweepAt);
  for (let i = 0; i < 6; i++) {
    clock = Math.max(clock, ctx.alarmAt);
    a.autoAt = clock;
    await room.alarm();
    if (b.closedWith) break;
    clock += 30 * 1000;
    a.autoAt = clock;
    a.close(1006, "");
    await room.webSocketClose(a, 1006, "");
    a = await connect(room, ctx, { token: host.token });
  }
  ok("so the silent guest is swept despite the churn", b.closedWith && b.closedWith.code === CLOSE.STALE);
}

{
  // Rooms stored before leftAt existed still load and reclaim nothing early.
  const ctx = new FakeContext();
  ctx.data.set("meta", { code: "ABCDE", game: "connect-four", seats: 2, tokens: ["x", "y"], createdAt: clock, idleSince: clock });
  const room = new Room(ctx, {});
  await room.ready;
  ok("an old room gets an empty leftAt", JSON.stringify(room.meta.leftAt) === "[null,null]");
  const c = await connect(room, ctx, {});
  ok("and its seats aren't reclaimed without a recorded drop", c.closedWith && c.closedWith.code === CLOSE.ROOM_FULL);
}

console.log("relay room: " + count() + " checks passed");
