# Mahjong Solitaire

Classic single-player tile-matching puzzle — static HTML/CSS/JS, a single
`index.html` file, no build step, no server.

144 tiles (34 kinds × 4, plus flowers/seasons) laid out in a 5-layer nested
pyramid (60/40/26/14/4 tiles, generated via an elliptical-distance-sort
layout algorithm). A tile is free to pick up if it isn't covered from above
and has an open left or right side; match two free identical tiles to clear
them. Includes hint, shuffle-remaining, and a timer.

Simple enough to stay in one file — there's no separate `css/`/`js/` split
and no automated test suite here, unlike the other two games in this
collection, which are large enough to warrant one.
