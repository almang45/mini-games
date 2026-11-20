import { FakeContext, ok, count, logs } from "./fakes.js";
import { Room, IDLE_TTL_MS, MAX_AGE_MS, HELLO_TIMEOUT_MS, BUCKET_SIZE } from "../room.js";
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
  ok("an occupied room doesn't expire", ctx.alarmAt === clock + MAX_AGE_MS);

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

console.log("relay room: " + count() + " checks passed");
