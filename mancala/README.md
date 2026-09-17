# Mancala

Mancala with Kalah rules (six pits a side, four seeds in each), built as
static HTML/CSS/JS with no build step and no server. You can play South or
North against the AI, or two players can share one device.

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

## Layout

- `index.html`: the page, its styles, and the UI wiring, including the
  seed-by-seed sowing animation.
- `js/mancala.js`: rules and AI, with no DOM code (`window.MANCALA`, or
  `require()` in Node).
- `js/test/mancala.test.js`: Node tests for sowing, extra turns, skipping the
  opponent's store, captures, the end sweep and undo. They also check seed
  conservation over random games, that the AI takes a big capture, and that
  Hard beats Easy.

## Tests

```
node mancala/js/test/mancala.test.js
```
