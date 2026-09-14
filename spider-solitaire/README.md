# Spider Solitaire

Spider Solitaire with two decks, built as static HTML/CSS/JS with no build
step and no server. You can play with 1, 2 or 4 suits.

## Rules as implemented

- **Deal:** 54 cards go out across 10 columns (6, 6, 6, 6, then six columns
  of 5). Only the bottom card of each column is face up. The other 50 cards
  form the stock, which covers five deals.
- **Building:** a card or run goes onto a card one rank higher, of any suit.
  Only a run of one suit in descending order moves as a unit. Any run can go
  into an empty column.
- **Stock:** clicking it deals one face-up card onto every column. As in the
  classic rules, it refuses while a column is empty.
- **Completing a suit:** a King-to-Ace run of one suit leaves the table at
  once. Clear all eight runs to win.
- **Score:** you start at 500. Each move or deal costs 1 point, and each
  completed suit adds 100. Undo is unlimited and restores the score as well.

Deals are numbered. The page URL carries the suits and the deal
(`#2-1234` is deal 1234 with two suits), so a deal is easy to share.

## Hints

Hint suggests the most useful move it can see and marks where the cards go.
Same-suit builds rank highest. Next come moves that uncover a face-down card
or empty a column. Moves that only shift a run from one fitting card to
another are never suggested. With nothing to suggest, the hint points at the
stock. Once no useful moves are left and the stock is empty, the page says so.
Hints are a heuristic, not a solver. Spider positions are too large to search
the way the FreeCell solver does.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/spider.js`: rules and hints, with no DOM code (`window.SPIDER`, or
  `require()` in Node).
- `js/test/spider.test.js`: Node tests for the deck and deal in every suit
  count, run moves, flipping, completing a suit, the stock rule, hints and
  undo. They also play random games in each suit count to check that all 104
  cards stay accounted for, every hint is legal, and undo rewinds to the deal.

## Tests

```
node spider-solitaire/js/test/spider.test.js
```
