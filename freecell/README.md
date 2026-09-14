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

The game doesn't detect a position with no moves left. Undo and Restart are
the ways out.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/freecell.js`: the rules engine, with no DOM code (`window.FREECELL`, or
  `require()` in Node).
- `js/test/freecell.test.js`: Node tests. They check deals #1 and #617
  against Microsoft's layouts, move and supermove rules, autoplay safety,
  quick-move order, and 30 random-play games for card conservation and
  undo-to-start.

## Tests

```
node freecell/js/test/freecell.test.js
```
