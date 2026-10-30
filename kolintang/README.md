# Kolintang Warna (Color Kolintang)

A rainbow kolintang for young kids. Kolintang is the wooden xylophone from
Minahasa, North Sulawesi. It's static HTML/CSS/JS with no build step and no
server: open `index.html` directly in a browser.

Eight bars play one octave of C major, low do on the left to high do on the
right. Each bar shows its note in Indonesian *not angka* (number notation,
1 to 7, then 1 with a dot above for the high do) and its solfège name. The
colors run the rainbow Indonesian kids learn as *mejikuhibiniu* (merah,
jingga, kuning, hijau, biru, nila, ungu), so la is Nila, and the high do is
pink. Colors and their names come from Color Fusion's `js/mix.js`.

Tap a bar, slide a finger across several, or press keys 1 to 8.

- **Bebas (free play):** play anything. The last bar shows big, with its
  number, note and color.
- **Lagu (songs):** pick a song and tap whichever bar is glowing. A wrong bar
  still sounds, but the song waits for the right one. **Dengar** (listen)
  plays the whole song with the bars lighting up, and **Ulangi** starts it
  over. A finished song gets a star.
- **Tiru (copy me):** the kolintang plays a short tune and lights its bars,
  then the kid plays it back. Each tune copied adds one more note, up to 12.
  A mistake replays the same tune. The longest tune copied is kept as a
  record. No bar comes three times in a row, which is hard to hear as a tune.

## Songs

Only public-domain melodies whose notes all fit the one octave, ordered by
how many different bars they need:

| Song | Bars |
|---|---|
| Hot Cross Buns | 3 |
| Mary Had a Little Lamb | 4 |
| Ode to Joy (Beethoven) | 5 |
| Twinkle Twinkle Little Star | 6 |
| Row, Row, Row Your Boat | 6 |

Indonesian children's songs such as *Balonku* and *Bintang Kecil* are still
under copyright, so they aren't included.

## Sound

Bars are synthesized with Web Audio, so the game has no audio files. Each
strike is a sine at the note's pitch plus two quieter overtones, at 4× and 10×,
that die away fast. Those give the knock of a mallet on wood. Sound starts on
the first tap, because iOS blocks audio until the user has interacted with the
page. The speaker button mutes it, and the bars still light up.

Finished songs and the copy-me record are saved in `localStorage`
(`kolintang.v1`). The language and sound toggles are shared with the other
Kids games.

## Project layout

```
index.html                page shell: top bar, mode tabs, song list, the kolintang
css/style.css             game styling (the shared look is ../shared/kids/kids.css)
favicon.svg               the rainbow bars on their wooden box
js/kolintang.js           pure music: bars, songs, timing, copy-me rules (no DOM)
js/app.js                 controller: drawing and ringing bars, the three modes, saving
js/test/kolintang.test.js plain Node test script
```

Run the tests from inside this folder:
`for f in js/test/*.test.js; do node "$f" || exit 1; done`
