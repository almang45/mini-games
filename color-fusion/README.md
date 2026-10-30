# Color Fusion

A paint-mixing toy for young kids. It's static HTML/CSS/JS with no build step
and no server: open `index.html` directly in a browser.

There are five paint pots: red, yellow, blue, white and black. Tap a pot, or
drag a drop from it onto the bowl, and the bowl turns into the mixed color.
The game says the color's name aloud, in Indonesian or English, so kids who
can't read yet can play too. **Ups** removes the last drop and **Kosongkan**
empties the bowl. The bowl holds at most 12 drops.

- **Bebas (free play):** mix anything. A mix that lands on one of the 28
  named colors is added to the color book.
- **Tantangan (challenges):** 21 levels in four stages: secondary colors,
  tints and shades, 2:1 ratios, then three or more pigments. Each stage
  puts only the pots it needs on the shelf. **Petunjuk** (hint) shows the
  recipe as colored dots, makes those pots bounce, and reads the recipe
  aloud. Each level unlocks once the one before it is cleared.
- **Buku Warna (color book):** every named color found so far, with its
  recipe. Tap a color to hear its name and recipe.

Found colors and cleared levels are saved in `localStorage`. The language and
sound toggles are shared by every Kids game (`shared/kids/`), so switching to
English here switches the other Kids games too. If storage is blocked, the game still works but forgets
everything on reload. **Mulai dari awal** in the color book clears saved
progress (useful for siblings).

## Mixing model

Averaging RGB values makes blue + yellow come out grey, which contradicts
what kids learn in art class. `js/mix.js` mixes in RYB instead:

1. The hue comes from the red : yellow : blue *ratio*, scaled so the
   strongest primary is 1. It is then trilinearly interpolated inside an RYB
   color cube (corners from Gossett & Chen, *Paint Inspired Color
   Compositing*, 2004, retuned brighter). This gives red + yellow = orange,
   yellow + blue = green, red + blue = purple and all three = brown. Only
   the ratio matters, so 2 red + 2 yellow is the same orange as 1 + 1.
2. White and black then tint or shade that hue according to their share of
   all the drops in the bowl.

A mix counts as a named color when its OKLab distance to that color is at
most `MATCH_DISTANCE` (0.03). Within `NEAR_DISTANCE` (0.07), the game shows
"Hampir …" ("Almost …"). Anything further away is a "Warna ajaib!" ("magic
color"). The test suite checks that no two named colors sit within 2×
`MATCH_DISTANCE` of each other, so a single mix can never count as two
different colors.

## Project layout

```
index.html          page shell: top bar, mode tabs, bowl, color book, pot shelf
css/style.css       game styling, including the landscape-phone layout
favicon.svg         three overlapping primaries with their mixes
js/mix.js           pure mixing model, named colors and levels (no DOM)
js/app.js           controller: pots (tap and drag), modes, saving
js/test/mix.test.js plain Node test script
```

The table, top bar, toggles, tabs, buttons, toast, speech and sound effects
come from `../shared/kids/kids.css` and `../shared/kids/kids.js`, shared with
the other Kids games. Several of them load `js/mix.js` too, so a color has
the same name and shade everywhere.

`js/mix.js` uses the same small UMD pattern as `card-games/js/core/*.js`:
`module.exports` under Node and `window.MIX` in the browser.

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`

## Speech and sound

Color names are read aloud with the browser's Web Speech API, using an
`id-ID` or `en-US` voice when the device has one. iPads and Android tablets
usually have an Indonesian voice. On a desktop without one, the browser reads
the words with its default voice. Sound effects are synthesized with Web
Audio, so the game has no audio files. Both start on the first tap, because
iOS blocks audio until the user has interacted with the page. The speaker
button mutes both.

## Verification

Besides the unit tests, the UI was checked with a scripted Playwright run
against a local server. The run covered tap and drag pours (including a drag
released away from the bowl), undo and empty, the 12-drop limit, clearing a
challenge, the hint, keeping separate bowls per tab, the color book, the
language switch and progress surviving a reload. It also confirmed that the
page fits without scrolling, and that the pot shelf never covers the bowl,
on tablets and phones in both orientations, down to 360×640 and 667×375.
