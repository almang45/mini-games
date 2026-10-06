# Word Grid

A two-player crossword tile game on a 15x15 board, built as static
HTML/CSS/JS with no build step and no server. Play the AI (Easy or Normal),
or share one device with a friend.

## Rules

- Each player has a rack of 7 tiles drawn from a bag of 100. On your turn,
  lay tiles in one row or one column, with no gaps, to make words that join
  the tiles already on the board. The first word must cover the centre star.
- Every word your tiles make, along the line and across it, must be in the
  word list. You score each of those words.
- Premium squares count only on the turn a tile is first placed on them:
  DL/TL double or triple that letter, DW/TW double or triple the word (the
  centre is a DW).
- Using all seven tiles in one turn scores 50 extra.
- Blanks stand for any letter you choose and score 0.
- Instead of playing you may exchange tiles (if at least 7 are left in the
  bag) or pass.
- The game ends when a player uses their last tile with the bag empty (they
  also gain the value of the other rack), or when both players have passed
  or exchanged twice in a row. Tiles left on a rack are subtracted.

Tile values and counts are the long-standing English ones. The premium
square layout is this game's own design: symmetric in every direction like
the classic board, but a different pattern.

## Word list

The public-domain ENABLE list, 168,551 words of 2-15 letters. It ships as
`js/words.js`, a plain script, so the game also works when `index.html` is
opened straight from disk. `tools/build-words.js` regenerates it from
`enable1.txt` and refuses any file whose SHA-256 doesn't match; see
[CREDITS.md](CREDITS.md) for the source. ENABLE predates QI and ZA, so
those aren't words here.

## AI

`js/lexicon.js` builds a trie in flat typed arrays (375k nodes, under 100 ms
in Node). `generateMoves` uses Appel and Jacobson's method across the board
and its transpose: cross-checks limit each empty square to letters that make
a valid word with the tiles above and below, and every word is built through
an anchor square from a left part plus a right extension, including blanks.
It finds every legal move; the tests compare it against an exhaustive search.

| Level  | Play |
|--------|------|
| Easy   | A random move from the lower-scoring half of all legal moves |
| Normal | The best score plus a value for the tiles it keeps (blanks and an S are good; duplicates, a Q without a U, and too many vowels or consonants are bad) |

With no legal move it exchanges the tiles that hurt its rack most, or passes
when the bag is too low.

## Layout

- `index.html`: the page, its styles and the UI wiring: tap a rack tile then
  a square, tap a placed tile to take it back, and the Play button shows the
  words and score (or what's wrong) as you go.
- `js/wordgrid.js`: rules, scoring, move generation and AI, no DOM
  (`window.WORD_GRID`, or `require()` in Node).
- `js/lexicon.js`: the trie.
- `js/words.js`: the generated word list.
- `tools/build-words.js`: rebuilds `js/words.js`.
- `js/test/wordgrid.test.js`: Node tests for the lexicon, tiles, the premium
  layout's symmetry, placement rules, scoring by hand-worked examples
  (premiums, blanks, parallel plays, the 50 bonus), exchanging, passing,
  going out, the move generator against brute force (racks of 3-5 letters,
  one blank and two blanks; every move found, each once, with its score), and
  full Normal vs
  Easy games that check all 100 tiles are kept.

## Tests

```
node word-grid/js/test/wordgrid.test.js
```
