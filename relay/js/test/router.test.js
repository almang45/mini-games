import { ok, count, logs } from "./fakes.js";
import { handle } from "../router.js";
import { CODE_PATTERN } from "../protocol.js";

const ORIGIN = "https://almang45.github.io";

function fakeEnv({ taken = 0, initStatus = 201, limited = false } = {}) {
  const calls = [];
  let remainingTaken = taken;
  const limiter = { limit: async () => ({ success: !limited }) };
  return {
    calls,
    ALLOWED_ORIGINS: ORIGIN + ", http://localhost:8080",
    CREATE_LIMITER: limiter,
    CONNECT_LIMITER: limiter,
    ROOMS: {
      idFromName: (name) => ({ name }),
      get: (id) => ({
        fetch: async (input, init) => {
          const request = input instanceof Request ? input : new Request(input, init);
          calls.push({ room: id.name, path: new URL(request.url).pathname, request });
          if (new URL(request.url).pathname === "/ws") return new Response("upgraded", { status: 200 });
          if (remainingTaken > 0) {
            remainingTaken--;
            return new Response("{}", { status: 409 });
          }
          const body = await request.json();
          return new Response(JSON.stringify({ code: body.code, seat: 0, token: "t", game: body.game, seats: body.seats }), { status: initStatus });
        },
      }),
    },
  };
}

const post = (body, origin = ORIGIN) => new Request("https://relay.test/rooms", {
  method: "POST",
  headers: origin ? { Origin: origin, "content-type": "text/plain" } : {},
  body: typeof body === "string" ? body : JSON.stringify(body),
});

const ws = (code, headers = {}) => new Request("https://relay.test/rooms/" + code + "/ws", {
  headers: { Origin: ORIGIN, Upgrade: "websocket", ...headers },
});

// ---- create -------------------------------------------------------------------

{
  const env = fakeEnv();
  const res = await handle(post({ game: "connect-four", seats: 2 }), env);
  const body = await res.json();
  ok("a room is created", res.status === 201 && CODE_PATTERN.test(body.code) && body.token === "t");
  ok("the room is keyed by its code", env.calls[0].room === body.code);
  ok("the allowed origin gets CORS", res.headers.get("access-control-allow-origin") === ORIGIN);
  ok("responses are never cached", res.headers.get("cache-control") === "no-store");
}
{
  const env = fakeEnv({ taken: 2 });
  const res = await handle(post({ game: "connect-four", seats: 2 }), env);
  ok("a taken code is retried with a new one", res.status === 201 && env.calls.length === 3);
}
{
  const res = await handle(post({ game: "connect-four", seats: 2 }), fakeEnv({ taken: 99 }));
  ok("running out of codes is a 503, not a loop", res.status === 503);
  ok("and it is logged", logs.some((entry) => entry.event === "room_codes_exhausted"));
}
{
  const res = await handle(post({ game: "connect-four", seats: 2 }), fakeEnv({ initStatus: 500 }));
  ok("a failing room is a 502", res.status === 502);
}
for (const [label, body, status] of [
  ["a bad game id", { game: "Connect Four!", seats: 2 }, 400],
  ["too few seats", { game: "ludo", seats: 1 }, 400],
  ["too many seats", { game: "ludo", seats: 5 }, 400],
  ["fractional seats", { game: "ludo", seats: 2.5 }, 400],
  ["invalid JSON", "{", 400],
  ["an oversized body", "x".repeat(2000), 413],
]) {
  const res = await handle(post(body), fakeEnv());
  ok(label + " is refused with " + status, res.status === status, res.status);
}
{
  const res = await handle(post({ game: "ludo", seats: 4 }, "https://evil.example"), fakeEnv());
  ok("another origin can't create rooms", res.status === 403 && !res.headers.get("access-control-allow-origin"));
  const none = await handle(post({ game: "ludo", seats: 4 }, null), fakeEnv());
  ok("a request without an Origin can't create rooms", none.status === 403);
  const limited = await handle(post({ game: "ludo", seats: 4 }), fakeEnv({ limited: true }));
  ok("creating too fast is a 429 with Retry-After", limited.status === 429 && limited.headers.get("retry-after") === "60");
}

// ---- connect ------------------------------------------------------------------

{
  const env = fakeEnv();
  const res = await handle(ws("abcde"), env);
  ok("a WebSocket goes to its room, code upper-cased", res.status === 200 && env.calls[0].room === "ABCDE" && env.calls[0].path === "/ws");
  ok("the upgrade header is passed through", env.calls[0].request.headers.get("Upgrade") === "websocket");
}
{
  ok("a code outside the alphabet is refused", (await handle(ws("ABCD0"), fakeEnv())).status === 400);
  ok("a plain GET isn't a WebSocket", (await handle(ws("ABCDE", { Upgrade: "" }), fakeEnv())).status === 426);
  ok("another origin can't connect", (await handle(ws("ABCDE", { Origin: "https://evil.example" }), fakeEnv())).status === 403);
  ok("connecting too fast is a 429", (await handle(ws("ABCDE"), fakeEnv({ limited: true }))).status === 429);
}

// ---- misc ---------------------------------------------------------------------

{
  const pre = await handle(new Request("https://relay.test/rooms", { method: "OPTIONS", headers: { Origin: ORIGIN } }), fakeEnv());
  ok("preflight from the site is allowed", pre.status === 204 && pre.headers.get("access-control-allow-methods").includes("POST"));
  const health = await handle(new Request("https://relay.test/health"), fakeEnv());
  ok("health answers with the protocol version", health.status === 200 && (await health.json()).v === 1);
  ok("unknown paths are 404", (await handle(new Request("https://relay.test/nope"), fakeEnv())).status === 404);
  ok("GET /rooms isn't allowed", (await handle(new Request("https://relay.test/rooms"), fakeEnv())).status === 405);
  const env = fakeEnv();
  delete env.CREATE_LIMITER;
  ok("a missing limiter binding fails open", (await handle(post({ game: "ludo", seats: 2 }), env)).status === 201);
  ok("but is logged", logs.some((entry) => entry.event === "rate_limiter_missing"));
}

console.log("relay router: " + count() + " checks passed");
