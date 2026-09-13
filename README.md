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

Each game folder is self-contained (its own README documenting rule choices
and test coverage, where applicable) and can be opened directly via its own
`index.html` without the others.

## Local development

No build step. Open any game's `index.html` directly in a browser, or serve
the whole thing locally:

```
npx http-server .
```

Each project's own test suite runs directly under Node, no browser required:

```
for f in mahjong-table/js/test/*.test.js; do node "$f"; done
for f in card-games/js/test/*.test.js; do node "$f"; done
```

## Deployment

This repo is deployed via GitHub Pages, serving directly from the root of
`main` — no build/Actions workflow needed since everything is already static.
