# Mancala

Mancala with Kalah rules (six pits a side, four seeds in each), built as
static HTML/CSS/JS with no build step and no server of its own. You can play
South or North against the AI, two players can share one device, or two
devices can play online through the relay (see the root README, "Online play").

South moves first. On your turn you pick up every seed in one of your pits
and sow them one at a time counter-clockwise. You drop seeds into your own
store but skip your opponent's.

- If your last seed lands in your store, you move again.
- If your last seed lands in an empty pit on your side and the pit opposite
  has seeds, you capture both into your store.
- When either side has no seeds left, each player banks the seeds on their own
  side and the game ends. The fuller store wins.

## AI

The AI uses alpha-beta search. A move that earns another turn keeps the same
player searching instead of handing over, and those moves are tried first.
Positions are scored on the store difference, plus a smaller weight for the
seeds still on each side.

| Level  | Search |
|--------|--------|
| Easy   | 2 moves deep, and 30% of its moves are random |
| Medium | 6 moves deep |
| Hard   | 14 moves deep |

## Online

Choose "Online - two devices", then Host a game and share the code or link;
the other player joins with it. The host plays South (and moves first) in the
first game and the sides swap with every new game, which only the host can
start. Undo is off online. Both devices show each move with the same sowing
animation. A player who drops or reloads rejoins the same seat; the board is
locked until both players are connected. The adapter for
`shared/net/turn-sync.js` is `createOnlineAdapter` in `js/mancala.js`;
the page hands it `getState`/`setState`/`onReset` in its inline script.

## Layout

- `index.html`: the page, its styles, and the UI wiring, including the
  seed-by-seed sowing animation.
- `js/mancala.js`: rules, AI and the online adapter, with no DOM code (`window.MANCALA`, or
  `require()` in Node).
- `js/test/mancala.test.js`: Node tests for sowing, extra turns, skipping the
  opponent's store, captures, the end sweep and undo. They also check seed
  conservation over random games, that the AI takes a big capture, and that
  Hard beats Easy.
- `js/test/mancala-online.test.js`: the online adapter, and whole games
  played across two simulated devices (`shared/js/test/net-two-seat.js`).

## Tests

```
node mancala/js/test/mancala.test.js
node mancala/js/test/mancala-online.test.js
```
