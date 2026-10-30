# Kartu Memori (Memory Cards)

A memory game for young kids. It's static HTML/CSS/JS with no build step and
no server: open `index.html` directly in a browser.

Tap a card to turn it over and hear what's on it, then tap another to look
for its pair. A pair stays up with a green edge; two different cards turn
back over after a moment, or straight away if the kid taps a third card.
"Main lagi" (play again) appears once every pair is found.

- **Warna (colors):** paint splashes in the colors from Color Fusion's
  `js/mix.js`, Nila included, each with its name.
- **Hewan (animals):** twelve animals, named in Indonesian or English.
- **Angka (numbers):** one card of each pair shows a numeral and the other
  shows that many dots, so finding a pair means counting.

Boards have 4, 6, 8, 12 or 16 cards. The game picks the column count that
gives the biggest cards for the screen, so 16 cards are 4 × 4 on a phone held
upright and 8 × 2 on one turned sideways. Card backs are Nila with a pale
kawung batik motif.

There's no timer. The game counts moves (one per pair of cards turned) and
keeps the fewest for each card set and board size, so a new record gets a
cheer. The chosen card set, board size and records are saved in
`localStorage` (`memory-cards.v1`). The language and sound toggles are shared
with the other Kids games.

## Project layout

```
index.html             page shell: top bar, card-set tabs, board sizes, board
css/style.css          game styling (the shared look is ../shared/kids/kids.css)
favicon.svg            a face-down card next to a turned-up one
js/memory.js           pure rules: dealing, turning cards, board fitting (no DOM)
js/app.js              controller: card faces per theme, flipping, speech, saving
js/test/memory.test.js plain Node test script
```

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`
