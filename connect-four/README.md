# Connect Four

Connect Four on the standard 7-column, 6-row board, built as static
HTML/CSS/JS with no build step and no server. You can play Red or Yellow
against the AI, or two players can share one device.

Red moves first. A disc drops to the lowest free hole in its column. Four in
a row across, down or diagonally wins. A full board with no four is a draw.

## AI

The AI uses negamax search with alpha-beta pruning, trying central columns
first. It scores open lines of two and three plus discs in the centre column.

| Level  | Search |
|--------|--------|
| Easy   | 2 plies, and 30% of its moves are random |
| Medium | 5 plies |
| Hard   | 10 plies |

The evaluation has no odd/even threat parity, which is what separates strong
endgame play from merely good play. Add it if Hard loses long games it should
hold.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/connect-four.js`: rules and AI, with no DOM code
  (`window.CONNECT_FOUR`, or `require()` in Node).
- `js/test/connect-four.test.js`: Node tests for gravity, every kind of win,
  full columns, draws and undo. They also check on random positions that each
  level takes a win, blocks a single threat and never hands one over, and that
  Hard beats Easy.

## Tests

```
node connect-four/js/test/connect-four.test.js
```
