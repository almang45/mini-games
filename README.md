# Mini Games

A small collection of static, no-build browser games, deployed together on
GitHub Pages. Nothing to install — every game is plain HTML/CSS/JS with no
bundler and no server.

**[Play now →](https://almang45.github.io/mini-games/)**

## Games

Grouped the same way as the hub page: add a new game to the group it belongs
to, both here and in `index.html`.

### Mahjong

| | |
|---|---|
| **[Mahjong Table](mahjong-table/)** | Traditional, competitive 4-player mahjong — Japanese Riichi or Chinese Classical rules, 1 human vs 3 AI or full local hot-seat. Also has a "what would you discard?" trainer and a Riichi scoring quiz. |
| **[Mahjong Solitaire](mahjong-solitaire/)** | Classic single-player tile-matching puzzle. |
| **[Shisen-Sho](shisen-sho/)** | Mahjong tile-matching on a flat board. Pairs are removed when a path with at most two turns joins them. |

### Cards

| | |
|---|---|
| **[Card Table](card-games/)** | Twelve classic card games in one shared table shell — Hearts, Spades, Oh Hell, Euchre, Crazy Eights, President, Big Two, Gin Rummy, Cribbage, Chinese Poker, Texas Hold'em, Blackjack. |
| **[Klondike Solitaire](klondike-solitaire/)** | Classic single-player card game — build runs, fill the four foundations. |
| **[FreeCell](freecell/)** | Classic FreeCell solitaire with Microsoft-numbered, shareable deals and a solver-backed hint. |
| **[Spider Solitaire](spider-solitaire/)** | Two-deck Spider with 1, 2 or 4 suits. |

### Board games

| | |
|---|---|
| **[Reversi](reversi/)** | Reversi/Othello against a three-level AI, or two players on one device. |
| **[Connect Four](connect-four/)** | Connect Four against a three-level AI, or two players on one device. |
| **[Mancala](mancala/)** | Kalah-rules Mancala against a three-level AI, or two players on one device. |

Each game folder is self-contained (its own README and CSS/JS) and can be
opened directly via its own `index.html` without the others. Mahjong
Solitaire and Klondike Solitaire are the exception worth calling out: both
are simple enough to ship as a single file, so their READMEs are a few
lines and neither has a separate test suite (see
[mahjong-solitaire/README.md](mahjong-solitaire/README.md) and
[klondike-solitaire/README.md](klondike-solitaire/README.md)).

A `shared/` folder at the repo root holds the handful of things that really
are identical across projects (the color palette + base styles in
`shared/theme.css` and one DOM-shim primitive reused by both test suites)
— everything else stays local to its own game on purpose, since each game's
UI is independent by design. `shared/favicon.svg` (a generic dice icon)
backs only the top-level hub page; each game has its own favicon (PNG or
SVG) representing that specific game, also used as its icon on the hub.

Mahjong Table, Mahjong Solitaire and Shisen-Sho all render real tile artwork from
`shared/assets/tiles/` rather than relying on the Unicode Mahjong Tile
characters' inconsistent font support across platforms. Those SVGs are
CC BY-SA 4.0 (not this repo's own MIT code license) — see
[shared/assets/tiles/CREDITS.md](shared/assets/tiles/CREDITS.md) for the
source and required attribution.

## Local development

No build step. Open any game's `index.html` directly in a browser, or serve
the whole thing locally:

```
npx http-server .
```

Each project's own test suite runs directly under Node, no browser required.
The `|| exit 1` matters here: a plain `for` loop's exit code is just the
*last* file's, so without it a failing test in the middle of the run would
go unnoticed.

```
for f in */js/test/*.test.js; do node "$f" || exit 1; done
```

The same loop runs in GitHub Actions (`.github/workflows/test.yml`) on every
pull request and on pushes to `main`. A new game's tests are picked up
automatically as long as they live in `<game>/js/test/`.

## Offline play

Every page loads `shared/register-sw.js`, which registers the root `sw.js`
service worker. The worker is network first: online, you always get the
latest deploy. Each file that loads is also copied into the browser's cache,
so any page you have opened once still works with no connection. Tile faces
are the exception to "only what loaded": the first tile fetched caches the
whole `shared/assets/tiles/` set, which `shared/js/test/sw.test.js` keeps in
step with the list in `sw.js`.
`manifest.webmanifest` (icons in `shared/icon-*.png`, rendered from
`shared/icon.svg`) lets browsers install the site as an app. Service workers
only run over http(s), so opening files straight from disk works as before,
just without the offline cache.

## Deployment

This repo is deployed via GitHub Pages, serving directly from the root of
`main`. There is no build step. The only Actions workflow runs the tests.

## License

[MIT](LICENSE).

## History

This repo's git history starts at the commit that combined the three
projects — that's not lost history, though: none of the three existed as
their own git repos beforehand, so there was nothing to carry over.
