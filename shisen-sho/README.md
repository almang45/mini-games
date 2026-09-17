# Shisen-Sho

Tile-matching puzzle played on a flat 8 × 18 grid of the standard 144 mahjong
tiles. Static HTML/CSS/JS, no build step, no server.

You can remove two identical tiles when a line joins them without crossing
another tile and turns at most twice. The line may run through the empty
ring around the board. Any Flower matches any Flower and any Season matches
any Season, as in Mahjong Solitaire. The game has hint, undo, shuffle, zoom
and a timer.

Deals are random, so a deal isn't guaranteed to be solvable. Shuffle re-deals
the remaining tiles into the same cells. It also clears the undo history,
because earlier positions no longer apply.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/board.js`: the grid, pathfinding, hints and reshuffle, with no DOM
  code (`window.SHISEN`, or `require()` in Node).
- `js/test/board.test.js`: Node tests for the connection rule. They also play
  20 seeded games to a full clear and check every hint move independently.

## Tests

```
node shisen-sho/js/test/board.test.js
```

Tile faces come from `../shared/assets/tiles/` and are licensed CC BY-SA 4.0,
not under this repo's MIT license. See that folder's `CREDITS.md`.
