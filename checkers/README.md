# Checkers

English draughts (American checkers) on the 8x8 board, built as static
HTML/CSS/JS with no build step and no server. You can play Black or White
against the AI, or two players can share one device.

## Rules

- 12 men each on the dark squares. Black moves first, from the bottom.
- A man steps one square diagonally forward. A king steps diagonally either way.
- Captures are compulsory. Jump an adjacent enemy piece onto the empty square
  beyond it, and keep jumping with the same piece while you can. When several
  captures are possible you may choose any of them, but once a sequence has
  started it must be finished. There is no rule forcing the longest capture.
- A man that reaches the far row is crowned. A man crowned mid-jump stops there.
- A player with no legal move (no pieces, or every piece blocked) loses.
- 40 moves each with no capture and no man moving is a draw.

To make a multi-jump, click the piece and then each landing square in turn.
Escape cancels a half-built move.

## AI

Negamax with alpha-beta pruning. When a capture is pending at the horizon the
search continues for up to six more plies, so the AI never judges a position
halfway through an exchange. The evaluation is material (man 100, king 175),
plus a little for advanced men, central kings and a held back row. Equal moves
are chosen at random.

| Level  | Search |
|--------|--------|
| Easy   | 2 plies, and 30% of its moves are random |
| Medium | 5 plies |
| Hard   | 7 plies (about half a second at most per move) |

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/checkers.js`: rules and AI, with no DOM code (`window.CHECKERS`, or
  `require()` in Node).
- `js/test/checkers.test.js`: Node tests for steps, forced and multi-jump
  captures (a man and a king), crowning (including a crown that ends a jump),
  wins by capture and by blockade, the draw rule, undo, the AI avoiding a
  piece left hanging, and Medium beating Easy over ten games.

## Tests

```
node checkers/js/test/checkers.test.js
```
