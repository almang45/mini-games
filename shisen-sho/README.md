# Shisen-Sho

Tile-matching puzzle played on a flat 8 × 18 grid of the standard 144 mahjong
tiles. Static HTML/CSS/JS, no build step, no server.

You can remove two identical tiles when a line joins them without crossing
another tile and turns at most twice. The line may run through the empty
ring around the board. Any Flower matches any Flower and any Season matches
any Season, as in Mahjong Solitaire. The game has hint, undo, shuffle, zoom
and a timer.

Every deal can be won. The board is dealt at random and then checked with up
to 20 random playouts, each taking the first connectable pair it finds. The
first playout that clears the board proves the deal. A deal that no playout
clears is thrown away. This usually takes a few milliseconds. You can still
paint yourself into a corner by removing pairs in a bad order. Shuffle
re-deals the remaining tiles into the same cells, and prefers an arrangement
that a playout can clear. Shuffle also clears the undo history, because
earlier positions no longer apply.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/board.js`: the grid, pathfinding, hints and reshuffle, with no DOM
  code (`window.SHISEN`, or `require()` in Node).
- `js/test/board.test.js`: Node tests for the connection rule. They also play
  20 seeded games to a full clear and check every hint move independently.
  Another 30 seeded deals are replayed with no shuffles until one line clears
  each of them.

## Tests

```
node shisen-sho/js/test/board.test.js
```

Tile faces come from `../shared/assets/tiles/` and are licensed CC BY-SA 4.0,
not under this repo's MIT license. See that folder's `CREDITS.md`.
