# Visual asset audit

Date: 2026-11-09 · Commit: `fc8e725` · Auditor: Antigravity (asset-redesign skill)

## Summary

- Assets reviewed: 98 (icons 25, tiles 42, CSS-drawn visuals 24, art in JS 7, illustrations 0)
- P1: 10 · P2: 12 · P3: 5
- Cross-game themes: Six games use heavy raster PNGs for favicons instead of hand-written SVG; four SVGs rely on live `<text>` nodes that render unpredictably across OSs; all 42 mahjong tile SVGs carry legacy Adobe Illustrator DTDs and editor metadata; card back designs and color variables are duplicated inconsistently across solitaire and card table titles; card table side seats stretch vertically and push the player hand offscreen on phones and 800px viewports; several games rely on raw system emojis rather than bespoke vector assets; and Color Clash directly imitates commercial Uno trade dress.

## Findings

Priority: P1 broken or off-brand · P2 inconsistent with siblings · P3 polish.
Status: `open` · `done in #<PR>` · `partly done in #<PR>: <what is left>` · `won't do: <why>`.

| # | Game | Asset | Problem | Evidence | Checklist item | Priority | Plan | Medium | Status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `card-games` | `card-games/favicon.png` | Raster PNG (176.7 KB, 512x512) used as favicon and hub icon instead of hand-written SVG; violates SVG-first icon rule and is heavyweight. | `inventory.mjs` (176701 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a crisp square SVG depicting fanned cards using theme tokens; update HTML and hub links. | SVG | done in #13 |
| 2 | `freecell` | `freecell/favicon.png` | Raster PNG (18.5 KB, 512x512) used as favicon and hub icon instead of hand-written SVG. | `inventory.mjs` (18554 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a crisp square SVG depicting FreeCell's four cascading free-cell slots using theme tokens. | SVG | done in #13 |
| 3 | `mahjong-solitaire` | `mahjong-solitaire/favicon.png` | Raster PNG (194.7 KB, 512x512) used as favicon and hub icon instead of hand-written SVG; oversized file. | `inventory.mjs` (194661 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a clean square SVG showing a layered pair of matching mahjong tiles using theme tokens. | SVG | done in #13 |
| 4 | `mahjong-table` | `mahjong-table/favicon.png` | Raster PNG (171.8 KB, 512x512) used as favicon and hub icon instead of hand-written SVG; oversized file. | `inventory.mjs` (171764 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a square SVG depicting a 4-player mahjong table with a Riichi stick and red dragon tile. | SVG | done in #13 |
| 5 | `reversi` | `reversi/favicon.png` | Raster PNG (27.6 KB, 512x512) used as favicon and hub icon instead of hand-written SVG. | `inventory.mjs` (27593 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a crisp square SVG showing a 2x2 Reversi grid with beveled black and white discs. | SVG | done in #13 |
| 6 | `shisen-sho` | `shisen-sho/favicon.png` | Raster PNG (16.5 KB, 512x512) used as favicon and hub icon instead of hand-written SVG. | `inventory.mjs` (16467 bytes, 512x512); `hub_desktop.png` | Craft | P1 | Hand-code a crisp square SVG depicting two mahjong tiles connected by a two-bend line. | SVG | done in #13 |
| 7 | `shared` | `shared/favicon.svg` | Root hub favicon uses an unstyled live emoji `<text>🎲</text>` node without a background rect; renders inconsistently across OSs and is illegible on dark browser tabs. | `inventory.mjs` ("live text"); `shared/favicon.svg` source; `hub_desktop.png` | Craft | P1 | Hand-code a clean vector die on a rounded theme felt background matching `shared/icon.svg` motif. | SVG | done in #13 |
| 8 | `klondike-solitaire` | `klondike-solitaire/favicon.svg` | Uses live text `<text>` for the rank letter "A" instead of vector paths. | `inventory.mjs` ("live text"); `klondike-solitaire/favicon.svg:4` | Craft | P2 | Convert the letter "A" to font-independent SVG vector path curves. | SVG | done in #13 |
| 9 | `spider-solitaire` | `spider-solitaire/favicon.svg` | Uses live text `<text>` for rank "K" and suit glyph "♠". | `inventory.mjs` ("live text"); `spider-solitaire/favicon.svg:5-6` | Craft | P2 | Convert King monogram and spade pip to vector path curves. | SVG | done in #13 |
| 10 | `word-grid` | `word-grid/favicon.svg` | Uses live text `<text>` nodes for letters "W" and "G" inside wood tiles. | `inventory.mjs` ("live text"); `word-grid/favicon.svg:6-7` | Craft | P2 | Replace live text nodes with vector path letter outlines. | SVG | done in #13 |
| 11 | `shared` | `shared/assets/tiles/*.svg` | All 42 SVG tile files contain legacy Adobe Illustrator DTDs, `switch`/`foreignObject` tags, editor metadata, and non-standard negative viewBoxes (`-192 293.9 210 255`). | `inventory.mjs` ("non-square, editor metadata" across 42 files); `dragon-green.svg` | Craft | P1 | Clean and normalize SVG tile definitions into standard viewBoxes without editor metadata while keeping filenames and CC BY-SA 4.0 credits. | SVG | done in #13 |
| 12 | `card-games` | `card-games/index.html` | Card Table lobby features 16 plain text boxes with no game icons, card suits, or visual artwork, appearing like generic unstyled placeholders. | `card_lobby_desktop.png`, `card_lobby_phone.png` | Fit | P2 | Add distinctive visual mini card badges and suit glyphs to each lobby game card via CSS/SVG. | CSS | done in #13 |
| 13 | `card-games` | `card-games/css/style.css` | Side seat hands stack 13 cards vertically (`flex-direction: column;`), expanding table wrap beyond 950px and pushing the player's hand off the screen on 800px viewports and phones. | `card_game_hearts_desktop.png`, `card_game_hearts_phone.png` | Accessibility | P1 | Restyle side hands with overlapping negative vertical margins so 4-seat tables fit inside 800px viewports without scrolling. | CSS | done in #13 |
| 14 | `card-games` | `card-games/js/ui/color-clash-ui.js` | Color Clash card faces use a tilted white oval (`.cc-oval { transform: rotate(-24deg); }`) on solid colored cards, directly imitating the signature commercial trade dress of Uno. | `card-games/css/style.css:288-296`; `card_game_color-clash_desktop.png` | Originality | P1 | Redesign Color Clash card faces to an original layout (e.g. geometric diamond emblem with dual borders) that avoids commercial trade dress imitation. | art in JS | done in #13 |
| 15 | `card-games` | `card-games/js/ui/last-fuse-ui.js` | Last Fuse cat cards (Tabby, Calico, Siamese, Sphynx, Ginger) all display the identical Unicode cat glyph (`🐈︎`) differentiated only by tiny text and text color; action cards rely on bare Unicode text symbols. | `card-games/js/ui/last-fuse-ui.js:17-20`; `card_game_last-fuse_desktop.png` | Legibility | P2 | Redesign Last Fuse action and cat cards with distinctive vector SVG or crafted glyphs per card type rather than generic system emoji. Not colour emoji: #13 tried them and reverted, since they ignore the per-cat CSS colours and U+130E0 is missing from many system fonts. | art in JS | open |
| 16 | `spider-solitaire` | `spider-solitaire/index.html` | Card back styling uses a bright blue diagonal stripe pattern (`#2152a8`), which is inconsistent with the green felt palette and the card backs used in Klondike and Card Table. | `spider-solitaire/index.html:118`; `solitaire_spider-solitaire_desktop.png` | Consistency | P2 | Align Spider Solitaire card backs with the collection's green felt palette tokens (`--card-back-a`, `--card-back-b`). | CSS | won't do: green backs vanish into the green felt; blue kept in game and favicon for contrast |
| 17 | `mahjong-table` | `mahjong-table/css/style.css` | Player hand wraps into two rows (`.seat-hand { flex-wrap: wrap; }`), splitting 14 tiles across lines on desktop and phone and disrupting standard mahjong sequence reading. | `mahjong_table_play_desktop.png`, `mahjong_table_play_phone.png` | Fit | P2 | Prevent wrapping (`flex-wrap: nowrap`) and size tiles dynamically with `clamp()` so 14 tiles always sit in one seamless horizontal row. | CSS | partly done in #13: bottom seat spans the table and `clamp()` sizing keeps 14 tiles on one row down to 320px; `wrap` kept as fallback instead of `nowrap` so narrower screens never clip |
| 18 | `mahjong-table` | `mahjong-table/css/style.css` | On phone viewports (390px wide), the 4-seat table collapses into a vertical list where West, North, and South sit in a single column above the center, losing 4-player spatial table orientation. | `mahjong_table_play_phone.png` | Consistency | P2 | Refactor mobile table layout to retain compass positioning (top, left, right, bottom) around the center disc. | CSS | done in #13 |
| 19 | `mahjong-solitaire` | `mahjong-solitaire/index.html` | On mobile viewports (390x844), the 144-tile turtle board shrinks to ~18px per tile, making tile faces and symbols difficult to distinguish and tap accurately. | `solitaire_mahjong-solitaire_phone.png` | Legibility | P2 | Add responsive board framing and higher contrast tile face rendering to improve phone legibility and touch precision. | CSS | done in #13 |
| 20 | `backgammon` | `backgammon/index.html` | Point index numbers (1–24) have low contrast against the dark green felt background (`#49705a` on `#134430`, contrast ~2.1:1), failing WCAG 4.5:1. | `board_backgammon_desktop.png` | Accessibility | P2 | Increase point number contrast using `--ink-dim` (`#cfc3ac`, contrast > 5.5:1) for clear readability. | CSS | done in #13 |
| 21 | `memory-cards` | `memory-cards/js/app.js` | Animal theme card faces use raw system platform emoji (`🐱`, `🐶`, `🐘`, `🦁`, etc.), rendering inconsistently across devices and clashing with the Kids visual style. | `memory-cards/js/app.js:57-80`; `kids_memory_animals_desktop.png` | Consistency | P2 | Replace raw system emoji with clean, cohesive vector animal faces matching the Kids palette and styling. | art in JS | done in #13 |
| 22 | `ludo` | `ludo/index.html` | Track safety stars in white spaces are rendered in low-contrast light grey (`#bbb`), failing icon contrast against the white background. | `board_ludo_desktop.png` | Accessibility | P3 | Increase star contrast using a darker warm neutral or gold stroke border. | CSS | done in #13 |
| 23 | `shared` | `shared/theme.css` | Card styling tokens (`--card-face`, `--card-border`, `--card-red`, `--card-black`, `--card-back`) are duplicated independently across four stylesheets instead of living in `shared/theme.css`. | `inventory.mjs` CSS comparison; grep audit | Consistency | P3 | Hoist standard card visual tokens into `shared/theme.css` so all card games share unified color definitions. | CSS | done in #13 |
| 24 | `hub` | `index.html` | Hub cards apply `border-radius: 10px` to `.card-icon`, producing double-curved borders on icons that already carry internal `rx="22"` rounded rects. | `index.html:53`; `hub_desktop.png` | Craft | P3 | Harmonize icon corner radii so SVGs fill their bounding boxes cleanly without redundant clipping. | CSS | done in #13 |
| 25 | `word-grid` | `word-grid/index.html` | Bonus grid cells (Triple Word, Double Word, Triple Letter, Double Letter) rely strictly on color (red, pink, dark blue, light blue) without text abbreviations or icons. | `board_word-grid_desktop.png`; WCAG 1.4.1 | Accessibility | P2 | Add subtle text abbreviations or patterns (e.g. "3W", "2W", "3L", "2L") inside bonus squares to avoid relying on color alone. | CSS | done in #13 |
| 26 | `dots-boxes` | `dots-boxes/index.html` | Claimed boxes and drawn lines have flat visuals with narrow mobile hit targets and minimal tactile game-board feedback. | `board_dots-boxes_phone.png` | Craft | P3 | Add subtle bevel/shadow styling and expand touch target hit areas in CSS for tactile board feel. | CSS | partly done in #13: shadows on lines, boxes and dots; hit areas unchanged (their geometry is set in the inline script, out of scope) |
| 27 | `coloring-book` | `coloring-book/js/pictures.js` | Line drawings are plain and stiff: mostly bare circles, ellipses and simple paths, few details, and flat compositions. | line drawings plain and stiff | Craft | P3 | Redraw all fifteen pictures with charming rounded shapes, expressive faces, scenery details, and kid-friendly tap regions. | art in JS | done in #14 |

## Screens

| Game | Screen | Desktop | Phone | Notes |
|---|---|---|---|---|
| `hub` | `index.html` | finding #7, #24 | finding #7, #24 | Favicon live emoji and card-icon border-radius clipping |
| `backgammon` | `index.html` | finding #20 | finding #20 | Low-contrast board point numbers on dark felt |
| `checkers` | `index.html` | ok | ok | Clean board and crowned piece styling |
| `connect-four` | `index.html` | ok | ok | Clear board cutouts and disc states |
| `dots-boxes` | `index.html` | ok | finding #26 | Touch targets and tactile styling on phone |
| `ludo` | `index.html` | finding #22 | finding #22 | Track safety star contrast against white spaces |
| `mancala` | `index.html` | ok | ok | Wooden board frame and seed rendering read clearly |
| `reversi` | `index.html` | finding #5 | finding #5 | Favicon is raster PNG; board and discs are clear |
| `word-grid` | `index.html` | finding #10, #25 | finding #10, #25 | Favicon live text; bonus cells rely on color alone |
| `klondike-solitaire` | `index.html` | finding #8 | finding #8 | Favicon live text; card tableau reads well |
| `freecell` | `index.html` | finding #2 | finding #2 | Favicon is raster PNG; tableau and cascades render clearly |
| `spider-solitaire` | `index.html` | finding #9, #16 | finding #9, #16 | Favicon live text; blue card back inconsistent with green theme |
| `mahjong-solitaire` | `index.html` | finding #3 | finding #3, #19 | Favicon is raster PNG; mobile 144-tile board legibility |
| `shisen-sho` | `index.html` | finding #6 | finding #6 | Favicon is raster PNG; board grid and connection lines clear |
| `mahjong-table` | `index.html` (Start) | finding #4 | finding #4 | Favicon is raster PNG; setup screen clean |
| `mahjong-table` | `index.html` (Play) | finding #4, #17 | finding #4, #17, #18 | Hand wraps into 2 rows; mobile loses compass table orientation |
| `mahjong-table` | `guide.html` | ok | ok | Rules guide layout and tile illustrations clear |
| `mahjong-table` | `trainer.html` | ok | ok | Discard trainer single hand display reads cleanly |
| `mahjong-table` | `scoring-quiz.html` | ok | ok | Scoring quiz hand tiles and option buttons clear |
| `card-games` | `index.html` (Lobby) | finding #1, #12 | finding #1, #12 | Favicon is raster PNG; lobby cards lack game icons/artwork |
| `card-games` | `guide.html` | ok | ok | Rules guide and suit definitions clear |
| `card-games` | `Hearts` | finding #13 | finding #13 | Side seats stretch vertically, pushing hand offscreen |
| `card-games` | `Spades` | finding #13 | finding #13 | Side seats stretch vertically, pushing hand offscreen |
| `card-games` | `Oh Hell` | ok | ok | Fewer cards dealt per hand keep layout visible |
| `card-games` | `Euchre` | ok | ok | 5-card hands fit neatly within table |
| `card-games` | `Crazy Eights` | ok | ok | Standard card faces and discard pile read well |
| `card-games` | `Color Clash` | finding #14 | finding #14 | Tilted white oval card face copies commercial Uno trade dress |
| `card-games` | `President` | finding #13 | finding #13 | 13-card hand stretches side seats offscreen |
| `card-games` | `Big Two` | finding #13 | finding #13 | 13-card hand stretches side seats offscreen |
| `card-games` | `Gin Rummy` | ok | ok | 2-player layout fits cleanly |
| `card-games` | `Cribbage` | ok | ok | Cribbage board track and hand render cleanly |
| `card-games` | `Chinese Poker` | ok | ok | 3-tier hand layout fits table |
| `card-games` | `Texas Hold'em` | ok | ok | Community cards and chip chips render well |
| `card-games` | `Blackjack` | ok | ok | Dealer and player hands fit cleanly |
| `card-games` | `Bust Seven` | ok | ok | Number cards and action cards readable |
| `card-games` | `Property Deal` | ok | ok | Property color bands and bank chips readable |
| `card-games` | `Last Fuse` | finding #15 | finding #15 | Cat cards all use identical emoji glyph; action symbols generic |
| `color-fusion` | `Free play` | ok | ok | Paint bowl and pigment tubes clean and responsive |
| `color-fusion` | `Challenges` | ok | ok | Target color swatch and mixing stage clear |
| `color-fusion` | `Color book` | ok | ok | Color swatch gallery and recipe steps clear |
| `coloring-book` | `index.html` | finding #27 | finding #27 | Line drawings plain and stiff; redrawn with richer charming details |
| `kolintang` | `Free play` | ok | ok | Wooden bar resonator and pitch notes clear |
| `kolintang` | `Songs` | ok | ok | Song selector tabs and note prompts clear |
| `kolintang` | `Copy me` | ok | ok | Simon-style listening prompt clear |
| `memory-cards` | `Colors` | ok | ok | Paint blob cards flip smoothly and read well |
| `memory-cards` | `Animals` | finding #21 | finding #21 | Uses raw platform emoji instead of styled illustrations |
| `memory-cards` | `Numbers` | ok | ok | Dot arrays on cards read clearly |
| `patterns` | `index.html` | ok | ok | Bead string and tray shapes render well |
| `tracing` | `Capitals` | ok | ok | Stroke guidelines and animation clean |
| `tracing` | `Lowercase` | ok | ok | Lowercase stroke paths clear |
| `tracing` | `Numbers` | ok | ok | Digit stroke paths clear |

## Needs a logic change

Visuals that can only be fixed inside inline `<script>` blocks or JS not listed in `art-in-js.json`.

| Game | Asset | Where it is drawn | Change needed |
|---|---|---|---|
| `patterns` | Bead SVG elements | `patterns/js/app.js:123-130` | `patterns/js/app.js` is not listed in `art-in-js.json`. Any redesign of bead geometry, shine highlight, or new bead shapes requires adding the file to `art-in-js.json` or styling via CSS. |
| `dots-boxes` | Board grid & line segments | `dots-boxes/index.html:178-210` | Grid dots, line hit targets, and claimed initial text are generated inside inline `<script>` via `createElementNS`. Any structural SVG changes require editing inline script. |
| `reversi` | Discs & move hints | `reversi/index.html:180-205` | Discs and legal-move indicator dots are generated inside inline `<script>`. Visual enhancements should stay in CSS selectors (`.disc`, `.hint`). |
| `checkers` | Checker pieces | `checkers/index.html:200-270` | Pieces and crowned king markers are created dynamically in inline `<script>`. Visual changes should be restricted to CSS selectors (`.piece`, `.piece.king`). |
| `connect-four` | Drop discs | `connect-four/index.html:180-220` | Discs are created in inline `<script>`. Visual changes must remain in CSS (`.disc.red`, `.disc.yellow`). |
| `mancala` | Pit seeds | `mancala/index.html:180-210` | Seed elements inside pits are created dynamically in inline `<script>`. Visual changes must remain in CSS (`.seed`). |
| `word-grid` | Letter tiles | `word-grid/index.html:170-240` | Letter tiles and score badges are created dynamically in inline `<script>`. Visual changes must remain in CSS (`.tile`, `.pts`). |
| `shisen-sho` | Connecting path line | `shisen-sho/index.html:150-180` | The 2-bend connecting line between paired tiles is drawn on an HTML5 `<canvas>` directly from inline `<script>`. Changing line styling/glow requires inline script changes. |
