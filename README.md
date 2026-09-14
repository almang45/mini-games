# Mini Games

A small collection of static, no-build browser games, deployed together on
GitHub Pages. Nothing to install — every game is plain HTML/CSS/JS with no
bundler and no server.

**[Play now →](https://almang45.github.io/mini-games/)**

## Games

| | |
|---|---|
| **[Mahjong Table](mahjong-table/)** | Traditional, competitive 4-player mahjong — Japanese Riichi or Chinese Classical rules, 1 human vs 3 AI or full local hot-seat. |
| **[Card Table](card-games/)** | Six classic card games in one shared table shell — Hearts, Crazy Eights, President, Big Two, Chinese Poker, Blackjack. |
| **[Mahjong Solitaire](mahjong-solitaire/)** | Classic single-player tile-matching puzzle. |
| **[Klondike Solitaire](klondike-solitaire/)** | Classic single-player card game — build runs, fill the four foundations. |

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

Mahjong Table and Mahjong Solitaire both render real tile artwork from
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
for f in mahjong-table/js/test/*.test.js; do node "$f" || exit 1; done
for f in card-games/js/test/*.test.js; do node "$f" || exit 1; done
```

## Deployment

This repo is deployed via GitHub Pages, serving directly from the root of
`main` — no build/Actions workflow needed since everything is already static.

## License

[MIT](LICENSE).

## History

This repo's git history starts at the commit that combined the three
projects — that's not lost history, though: none of the three existed as
their own git repos beforehand, so there was nothing to carry over.
