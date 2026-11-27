# Reversi

Reversi (Othello) on an 8 × 8 board, built as static HTML/CSS/JS with no
build step and no server of its own. You can play Black or White against the
AI, two players can share one device, or two devices can play online through
the relay (see the root README, "Online play").

Standard rules: Black moves first from the usual four-disc centre. A move
must flip at least one disc. A player with no legal move passes. The game
ends when neither player can move.

## AI

The AI uses negamax search with alpha-beta pruning. Its evaluation adds
square weights to a mobility term. Corners weigh high. Squares next to a
corner weigh low, but only while that corner is still empty. Search depth
depends on the level:

| Level  | Search |
|--------|--------|
| Easy   | 1 ply, and 30% of its moves are random |
| Medium | 3 plies |
| Hard   | 6 plies, then solves the last 12 empty squares exactly |

The evaluation has no edge-stability or parity terms. Those are the next
things to add if Hard turns out to be easy to beat.

## Online

Choose "Online - two devices", then Host a game and share the code or link;
the other player joins with it. The host plays Black in the first game and the
colours swap with every new game, which only the host can start. Undo is off
online. A player who drops or reloads rejoins the same seat; the board is
locked until both players are connected. The adapter for
`shared/net/turn-sync.js` is `createOnlineAdapter` in `js/reversi.js`;
the page hands it `getState`/`setState`/`onReset` in its inline script.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/reversi.js`: rules, AI and the online adapter, with no DOM code (`window.REVERSI`, or
  `require()` in Node).
- `js/test/reversi.test.js`: Node tests for the opening moves, flips, passes,
  game end, undo and corner preference. They also play three AI-vs-AI games
  and brute-force check that Hard's endgame play is perfect.
- `js/test/reversi-online.test.js`: the online adapter, and whole games
  played across two simulated devices (`shared/js/test/net-two-seat.js`).

## Tests

```
node reversi/js/test/reversi.test.js
node reversi/js/test/reversi-online.test.js
```
