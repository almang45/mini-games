# FreeCell

Classic FreeCell solitaire, built as static HTML/CSS/JS with no build step and
no server.

Deals use Microsoft's numbering, so deal #11982 here is the same deal as in
any other FreeCell. The page URL carries the deal number (`#11982`), which
makes a deal easy to share. New Game picks from the classic 1–32000 range.
The deal box accepts any number up to 1,000,000.

## Rules as implemented

- **Moving runs:** you can move several cards together if they descend and
  alternate colours. The largest run you can move is (free cells + 1) × 2^(empty
  columns). An empty column doesn't count toward that limit when it is the
  run's destination.
- **Autoplay:** a card goes to its foundation automatically once it's "safe".
  That means it is an Ace or a 2, or both opposite-colour foundations already
  hold the rank below it. No card left in play can then need it.
- **Double-click:** sends a card to its best spot. The order tried is the
  foundation, then building on a column, then a free cell, then an empty
  column.
- **Undo:** there's no limit. One undo reverses a move together with any
  autoplay it triggered.

## Hints and dead ends

**Hint** runs a solver from the current position. The solver is a best-first
search that plays moves exactly as the game does, autoplay included. It ignores
column order and cell order, so positions that differ only in those count once.
If it finds a win, the page picks up the first move's cards and marks where
they go. The search stops after 100,000 positions. That's under a second, and
enough for 994 of Microsoft deals #1–1000 from the start. When the search
stops early, the page says it couldn't find a solution quickly. When every
reachable position has been tried, it says there is no way to win from there.
Deal #11982, the famous impossible deal, gets that answer.

After every move a much smaller search (3,000 positions) runs. It only
speaks up when it has proven the game can no longer be won.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/freecell.js`: the rules engine and solver, with no DOM code
  (`window.FREECELL`, or `require()` in Node).
- `js/test/freecell.test.js`: Node tests. They check deals #1 and #617
  against Microsoft's layouts, move and supermove rules, autoplay safety,
  quick-move order, and 30 random-play games for card conservation and
  undo-to-start. For the solver, they replay found solutions through `move()`
  and prove #11982 unsolvable. They also check that the move generator offers
  only legal moves and misses no useful one.

## Tests

```
node freecell/js/test/freecell.test.js
```
