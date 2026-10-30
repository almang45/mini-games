# Lanjutkan Pola (What Comes Next?)

A pattern game for young kids. It's static HTML/CSS/JS with no build step and
no server: open `index.html` directly in a browser.

A string shows a repeating row of beads, twice over, and then two or three
empty places. The kid taps beads in the tray to thread the pattern on. A right
bead flies onto the string and is named aloud; a wrong one wobbles and the
game says "Coba lagi" ("Try again"). After two misses on the same place, the
right bead in the tray starts to bounce. **Dengar** (listen) reads the pattern
aloud again, so kids who can't read yet can play too.

The tray always holds every bead the pattern uses plus one that doesn't
belong, so the kid has to look at the pattern rather than tap whatever is
there.

## Levels

Three rounds clear a level, and each cleared level unlocks the next. Rounds
are random, so replaying a level gives new beads.

| | Pattern | Beads differ by |
|---|---|---|
| 1 | AB | color |
| 2 | AB | shape |
| 3 | AAB | color |
| 4 | ABB | color |
| 5 | AB | color and shape |
| 6 | ABC | color |
| 7 | AAB | shape |
| 8 | AABB | color |
| 9 | ABC | shape |
| 10 | ABC | color and shape |
| 11 | ABCD | color |
| 12 | ABAC | color |

The shapes are a circle, square, triangle and heart. Colors and their names
come from Color Fusion's `js/mix.js`, so Nila (indigo) looks and sounds the
same in both games. Blue, indigo and purple never share a string, and nor do
orange and pink. Side by side on a small bead they're too easy to mix up; the
tests check every other pair is far enough apart in OKLab.

Cleared levels are saved in `localStorage` (`patterns.v1`). The language and
sound toggles are shared with the other Kids games.

## Project layout

```
index.html               page shell: top bar, level strip, bead string, tray
css/style.css            game styling (the shared look is ../shared/kids/kids.css)
favicon.svg              beads on a string with one empty place
js/patterns.js           pure rules: levels, random rounds, checking a bead (no DOM)
js/app.js                controller: rendering, the bead flight, speech, saving
js/test/patterns.test.js plain Node test script
```

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`
