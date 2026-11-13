# Buku Mewarnai (Coloring Book)

A tap-to-fill coloring book for young kids. It's static HTML/CSS/JS with no
build step and no server: open `index.html` directly in a browser.

The kid picks a crayon from the box at the bottom, hears its name, and taps a
part of the picture to fill it. There's nothing to stay inside of: each part
fills whole, so a three-year-old's tap works as well as an older kid's.
**Ups** (oops) takes back the last color, **Hapus** (clear) empties the page,
and Ups after Hapus brings the whole page back. When every part has a color,
confetti and a "Gambar selesai!" ("All colored in!") say well done.
**Simpan** (save) downloads the page as a 1200 × 1200 PNG.

## Pictures

Fifteen line drawings, each with 14 to 26 parts to fill: animals (a fish, a
butterfly, a dinosaur, a cat, a turtle and an owl), things that go (a car, a
rocket, a train and a sailboat), a house, a flower, an ice cream, a ringed
planet with its moon, and a rainbow with seven bands for *mejikuhibiniu*.
All of them are drawn for this game, in `js/pictures.js` as plain SVG shapes
on a 400 × 400 page, so adding one is a matter of listing its shapes.

## Crayons

Fourteen crayons: red, pink, orange, yellow, light green, green, light blue,
blue, indigo, purple, brown, gray, black and white. Colors and their names
come from Color Fusion's `js/mix.js`, so Nila (indigo) looks and sounds the
same in every Kids game.

Every picture's colors, the open picture and the chosen crayon are saved in
`localStorage` (`coloring-book.v1`); undo history lasts until the page is
closed. The language and sound toggles are shared with the other Kids games.

## Project layout

```
index.html              page shell: top bar, picture strip, the page, buttons, crayon box
css/style.css           game styling (the shared look is ../shared/kids/kids.css)
favicon.svg             a half-colored heart and an indigo crayon
js/pictures.js          the line drawings as SVG shapes (no DOM)
js/book.js              pure fill state: painting, undo, clear, checking saved fills (no DOM)
js/app.js               controller: drawing the SVG, taps, thumbnails, PNG export, saving
js/test/book.test.js    plain Node test script
```

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`
