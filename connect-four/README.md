# Connect Four

Connect Four on the standard 7-column, 6-row board, built as static
HTML/CSS/JS with no build step and no server. You can play Red or Yellow
against the AI, two players can share one device, or two devices can play
online through the relay (see the root README, "Online play").

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

## Online

Choose "Online - two devices", then Host a game and share the code or link;
the other player joins with it. The host plays Red in the first game and the
colours swap with every new game, which only the host can start. Undo is off
online. A player who drops or reloads rejoins the same seat; the board is
locked until both players are connected. The page's adapter for
`shared/net/turn-sync.js` is the "online" block at the end of the inline
script.

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
