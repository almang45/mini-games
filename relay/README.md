# Relay

The server half of online play: a Cloudflare Worker plus one Durable Object
per room, at `https://mini-games-relay.almang45-395.workers.dev`. It hands out
seats and forwards messages between them. It never reads the game data: the
rules run in the browser (`shared/net/`), and the host's browser has the final
word when the two devices disagree.

This is the only part of the repo that runs anywhere other than GitHub Pages.
Every game works without it except in Online mode.

## Layout

| File | |
|---|---|
| `js/worker.js` | Entry point: exports the Worker and the `Room` class |
| `js/router.js` | HTTP: origin check, rate limits, `POST /rooms`, WebSocket hand-off |
| `js/room.js` | The `Room` Durable Object: seats, relaying, expiry |
| `js/protocol.js` | Wire constants, mirrored by `shared/net/relay-client.js` |
| `js/test/` | Node tests with an in-memory Durable Object runtime |
| `wrangler.toml` | Bindings, migration, rate limits, allowed origins |

`package.json` only marks the folder as ES modules for Node. There are no
dependencies; CI fetches a pinned `wrangler` with `npx`.

## Protocol (v1)

HTTP:

- `GET /health` returns `{"ok":true,"v":1}`.
- `POST /rooms` with `{"game":"connect-four","seats":2}` returns
  `{"code":"K7QX3","seat":0,"token":"…","game":…,"seats":…}` (201). Only
  from an allowed `Origin`, 10 per minute per IP.
- `GET /rooms/{code}/ws` upgrades to a WebSocket. Only from an allowed
  `Origin`, 60 per minute per IP.

Codes are 5 symbols from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O, 1/I),
about 33 million combinations.

WebSocket frames are JSON. The first one must be a hello within 10 seconds:

| Client sends | Meaning |
|---|---|
| `{"t":"hello","v":1,"game":"…","token":"…"}` | Take a seat. Without `token`, the next free seat, or else a guest seat nobody has been connected to for 3 minutes (its old token stops working). With it, the seat that token owns. One hello per socket |
| `{"t":"msg","data":…,"to":1}` | Forward `data` to seat `to`, or to every other seat without `to` |
| `{"t":"leave"}` | Give the seat up. The host leaving ends the room |
| `{"t":"ping"}` | Answered with `{"t":"pong"}` by the runtime, without waking the room |

| Relay sends | Meaning |
|---|---|
| `{"t":"welcome","v":1,"seat":1,"token":"…","game":"…","seats":2,"present":[0,1]}` | Seated. Keep `token` to resume |
| `{"t":"peer","seat":1,"state":"joined"\|"left"\|"gone"}` | `left` is a drop that may come back; `gone` gave the seat up |
| `{"t":"msg","from":0,"data":…}` | A forwarded message |

Close codes: 4000 bad message, 4001 no hello in time, 4003 unknown token,
4004 room gone, 4005 code is for another game, 4007 no traffic for 90 s,
4008 too many frames, 4009 room full, 4010 the seat was opened elsewhere,
4011 left, 4013 frame over 32 KB, 4026 unsupported version. The client
retries 4001, 4007, 4008 and network drops, and stops on the rest.

## Limits and lifetime

- Seat tokens are 128-bit random values, stored only as SHA-256 hashes.
- `POST /rooms` bodies over 1 KB are refused with 413; the body is read in
  chunks and the read stops at the limit.
- Each socket may send bursts of 40 frames, refilled at 5 per second.
- While anyone is connected the room checks every 60 s for seats that sent
  nothing (not even a ping) for 90 s, closes them with 4007 and tells the
  others the seat left. A phone that lost coverage never sends a TCP close.
  A sweep that finds nothing writes nothing to storage.
- A room with nobody connected is deleted after 30 minutes. Any room is
  deleted 24 hours after it was created.
- The origin check keeps other websites from using the relay through their
  visitors' browsers. It is not authentication: a script can send any
  `Origin`, which is why the rate limits and seat tokens exist.

## Failure modes

| Failure | What happens |
|---|---|
| Relay down or unreachable | "Host a game" says the server can't be reached; other modes are untouched |
| A phone sleeps or changes network | A ping goes unanswered for 45 s, so the client reconnects with backoff, and resumes its seat; the board stays locked meanwhile. A handshake that hangs is abandoned after 10 s; waking the page or the network coming back retries at once |
| A phone vanishes without closing | The relay's 90 s liveness sweep closes the seat (4007) so the other side sees it leave and the room can idle out |
| A guest loses its token (new tab, lost welcome) | After the seat has been empty for 3 minutes, joining the code again takes it over. A guest that is only reconnecting can't be displaced, and the host seat is never taken over |
| Leave pressed while offline | The page ends the room at once; the client keeps reconnecting in the background for up to 15 s to tell the relay, so the seat is freed |
| A deploy restarts the Worker | Sockets drop and reconnect the same way; rooms live in Durable Object storage and survive |
| A hidden tab's timers slow to once a minute | Liveness is timed from the unanswered ping, not the last frame, so a throttled but healthy socket stays up |
| A tab reloads | The seat token is in `sessionStorage`; the page rejoins through `?room=`. A reloaded host restores the game from its own `sessionStorage` copy, and only asks the guests when it has none; it takes their record only if every guest that answers sends the same one, else it starts a new round |
| A peer floods requests | Snapshot and sync replies come out of a small per-peer bucket (4, refilled 1/s), so a flood can't push the answering device over the relay's rate limit |
| The devices disagree | Every move carries a state hash; a mismatch makes the host resend its move list |
| A guest can't replay the host's list | It asks again after 1 s and 2 s, then shows "out of sync - reload" instead of looping |
| Pages and Worker versions differ | The relay accepts every version in `SUPPORTED_VERSIONS`; an older one is refused with 4026 and the page asks for a reload |

## Deploying

`.github/workflows/relay.yml` runs lint, tests, a `wrangler deploy --dry-run`
and CodeQL on every pull request that touches `relay/` or `shared/net/`. On
`main` it deploys and then checks `/health`. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`: an API token with **Account → Workers Scripts:
  Edit** on this account only.
- `CLOUDFLARE_ACCOUNT_ID`.

Without the token the deploy step logs a notice and does nothing. To deploy
by hand: `npx wrangler@4.157.0 deploy` from this folder after
`npx wrangler login`.

Change the wire protocol in a backward-compatible way: add the new version to
`SUPPORTED_VERSIONS`, deploy the relay, then merge the client change. Drop
the old version one release later.

## Operating

```
npx wrangler@4.157.0 deployments list          # what is live
npx wrangler@4.157.0 rollback                  # back to the previous version
npx wrangler@4.157.0 rollback <version-id>     # or to a specific one
npx wrangler@4.157.0 tail --format json        # live logs
```

Logs are one JSON object per line, also kept in Workers Logs (dashboard →
Workers → mini-games-relay → Logs). Events: `room_created`, `seat_joined`,
`seat_disconnected`, `seat_stale`, `seat_reclaimed`, `seat_left`, `room_closed` (with `reason`: idle,
max_age, host_left), `socket_rejected` (with `reason`), `rate_limited`,
`room_init_failed`, `unhandled`. No IP addresses or tokens are logged.

A rollback reverts code only. The Durable Object migration (`v1`, the `Room`
class) is never rolled back; a future migration must stay compatible with the
version before it.

## Local development

```
cd relay && npx wrangler@4.157.0 dev --port 8787     # relay on 127.0.0.1:8787
npx http-server . -p 8080                            # site, from the repo root
```

Open `http://localhost:8080/connect-four/?relay=http://127.0.0.1:8787` in two
tabs. Only pages served from `localhost` or `127.0.0.1` honour `?relay=`.

## Tests

```
node relay/js/test/room.test.js
node relay/js/test/router.test.js
```
