// HTTP edge of the relay: origin and rate checks, room creation, and handing WebSockets to rooms.
import { CODE_PATTERN, GAME_PATTERN, MAX_SEATS, MIN_SEATS, PROTOCOL_VERSION } from "./protocol.js";
import { randomCode } from "./ids.js";
import { json } from "./http.js";
import { log } from "./log.js";

const MAX_BODY_CHARS = 1024;
const CREATE_ATTEMPTS = 5;
const ROOM_PATH = /^\/rooms\/([^/]+)\/ws$/;

export async function handle(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request.headers.get("Origin"), env);

  if (request.method === "OPTIONS") return preflight(cors);
  if (url.pathname === "/health") {
    return request.method === "GET" ? json({ ok: true, v: PROTOCOL_VERSION }, 200, cors || {}) : notAllowed(cors);
  }
  if (url.pathname === "/rooms") {
    return request.method === "POST" ? createRoom(request, env, cors) : notAllowed(cors);
  }
  const match = ROOM_PATH.exec(url.pathname);
  if (match) return connect(request, env, match[1].toUpperCase(), cors);
  return json({ error: "not_found" }, 404, cors || {});
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
}

// null when the origin isn't allowed. The check stops other sites from using the relay from
// their visitors' browsers; it isn't authentication, since a script can send any Origin.
function corsHeaders(origin, env) {
  if (!origin || !allowedOrigins(env).includes(origin)) return null;
  return { "access-control-allow-origin": origin, vary: "Origin" };
}

function preflight(cors) {
  if (!cors) return json({ error: "origin_not_allowed" }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "86400",
    },
  });
}

const notAllowed = (cors) => json({ error: "method_not_allowed" }, 405, cors || {});
const forbidden = () => json({ error: "origin_not_allowed" }, 403);

async function underLimit(limiter, request, name) {
  if (!limiter) {
    log("warn", "rate_limiter_missing", { limiter: name });
    return true;
  }
  const { success } = await limiter.limit({ key: request.headers.get("CF-Connecting-IP") || "unknown" });
  if (!success) log("warn", "rate_limited", { limiter: name });
  return success;
}

async function createRoom(request, env, cors) {
  if (!cors) return forbidden();
  if (!(await underLimit(env.CREATE_LIMITER, request, "create"))) {
    return json({ error: "rate_limited" }, 429, { ...cors, "retry-after": "60" });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return json({ error: "body_too_large" }, 413, cors);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }
  const game = body && body.game;
  const seats = body && body.seats;
  if (typeof game !== "string" || !GAME_PATTERN.test(game)) return json({ error: "bad_game" }, 400, cors);
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) return json({ error: "bad_seats" }, 400, cors);

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    const res = await room.fetch("https://room/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, game, seats }),
    });
    if (res.status === 201) return json(await res.json(), 201, cors);
    if (res.status !== 409) {
      log("error", "room_init_failed", { status: res.status });
      return json({ error: "room_init_failed" }, 502, cors);
    }
  }
  log("error", "room_codes_exhausted", { attempts: CREATE_ATTEMPTS });
  return json({ error: "no_free_code" }, 503, cors);
}

async function connect(request, env, code, cors) {
  if (request.method !== "GET") return notAllowed(cors);
  // Browsers always send Origin on a WebSocket handshake.
  if (!cors) return forbidden();
  if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return json({ error: "upgrade_required" }, 426, cors);
  }
  if (!CODE_PATTERN.test(code)) return json({ error: "bad_code" }, 400, cors);
  if (!(await underLimit(env.CONNECT_LIMITER, request, "connect"))) {
    return json({ error: "rate_limited" }, 429, { ...cors, "retry-after": "60" });
  }
  const room = env.ROOMS.get(env.ROOMS.idFromName(code));
  return room.fetch(new Request("https://room/ws", request));
}
