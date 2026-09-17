# Reversi

Reversi (Othello) on an 8 × 8 board, built as static HTML/CSS/JS with no
build step and no server. You can play Black or White against the AI, or two
players can share one device.

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

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/reversi.js`: rules and AI, with no DOM code (`window.REVERSI`, or
  `require()` in Node).
- `js/test/reversi.test.js`: Node tests for the opening moves, flips, passes,
  game end, undo and corner preference. They also play three AI-vs-AI games
  and brute-force check that Hard's endgame play is perfect.

## Tests

```
node reversi/js/test/reversi.test.js
```
