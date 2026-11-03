# Jejak Huruf dan Angka (Trace Letters and Numbers)

A tracing game for kids learning to write. It's static HTML/CSS/JS with no
build step and no server: open `index.html` directly in a browser.

Three tabs pick what to trace: capitals A–Z, small letters a–z and numbers
0–9. Each sits on a sheet from a handwriting book, with two blue lines and a
pink dashed middle line. Capitals and numbers fill the space between the blue
lines. Small letters sit lower, the way a handwriting book teaches them: the
dashed line marks the top of an x, tall letters like b, d and h reach the top
line, and the tails of g, j, p, q and y hang down to a faint fourth line.

A numbered green dot
marks where to start and an arrow shows which way to go. The kid drags a
finger along the dotted line and the ink follows. Strokes go in the order and
direction they're taught at school, so the crossbar of an A only counts after
both legs. The dots on i and j come last and are tapped, not traced.

A finger that wanders off the line keeps what it has drawn: the green dot
moves to where the trace stopped and the kid carries on from there. When the
glyph is done, a letter shows and says a word ("A, Apel 🍎" or "A is for
Apple 🍎") and a number says its name and counts out that many fruit.
**Lihat** (watch) has a pen write the glyph once, stroke by stroke.
**Ulangi** (again) starts it over.

## Rules

The strokes live in `js/glyphs.js` as SVG paths on a 100 × 100 box, and
`js/trace.js` turns each into points 2 units apart. A finger within 12 units
of the line moves the trace forward; farther than 22 and it has left the
line. The trace only looks 20 units ahead, so a finger can't cut across the
middle of an O or jump the crossing of an 8. A press has to land within 16
units of the green dot, and a stroke counts as finished within 8 units of
its end. A dot is a stroke of one point, so the press alone finishes it, and
a press nearer a dot still to come than to the green dot is refused: tapping
the dot of an i first doesn't count as starting its stem.

Finished letters and numbers, and where the kid is in each, are saved in
`localStorage` (`tracing.v1`). The language and sound toggles are shared
with the other Kids games. Ink colors come from Color Fusion's `js/mix.js`.

## Project layout

```
index.html               page shell: top bar, mode tabs, letter strip, sheet, caption, buttons
css/style.css            game styling (the shared look is ../shared/kids/kids.css)
favicon.svg              a half-traced A on a handwriting sheet
js/glyphs.js             A–Z, a–z and 0–9 as strokes in writing order, and their lines (no DOM)
js/trace.js              pure tracing rules: sampling, following a finger, stroke order (no DOM)
js/app.js                controller: drawing the sheet, pointer input, watch mode, words, saving
js/test/trace.test.js    plain Node test script
```

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`
