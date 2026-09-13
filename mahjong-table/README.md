# Mahjong Table

A traditional, competitive four-player mahjong game — static HTML/CSS/JS, no build
step, no server. Open `index.html` directly in a browser.

Two rulesets, two play modes, both selectable from the start screen:

- **Ruleset**: Japanese Riichi, or Chinese Classical
- **Mode**: You vs 3 AI, or local hot-seat (pass the device between 4 human players)

Player-facing rules explanations (table layout, controls, full yaku/scoring
tables, glossary) live in `guide.html` — linked from the start screen. This
README is the developer-facing companion: what's implemented, what's
simplified, and how it's tested.

## Project layout

```
index.html              page shell / screens
css/style.css           styling
js/tiles.js             tile model, wall building/shuffling, dora indicators
js/hand.js              hand decomposition + shanten calculation
js/yaku-riichi.js       riichi yaku/fu detection
js/score-riichi.js      riichi han/fu -> point formula
js/score-classical.js   Chinese Classical doubling-point scoring
js/game.js              turn/call state machine (shared by both rulesets)
js/ai.js                AI opponent decision policy
js/ui.js                DOM rendering + input handling
js/test/*.test.js       plain Node test scripts (run with `node js/test/x.test.js`)
```

Run all tests: `for f in js/test/*.test.js; do node "$f"; done`

## Known simplifications / rule choices

**Riichi:**
- Yakuman supported: kokushi musou, suuankou, daisangen, shousuushii/daisuushii,
  tsuuiisou, chinroutou, ryuuiisou. **Not** implemented: tenhou/chiihou/renhou
  (dealt-in/first-uncalled-draw yakuman) — these require detecting "won on the
  very first go-around with no calls," which the state machine doesn't track
  explicitly — nor chuurenpoutou (nine gates) or suukantsu (four kans), which
  are simply out of scope for this build.
- No wall-size check on riichi eligibility: the real rule forbids declaring
  riichi with fewer than 4 tiles left in the live wall; `getTurnOptions`
  doesn't enforce that cutoff.
- Furiten is treated as permanent only (temporary furiten from a passed-up
  ron this go-around, and riichi furiten-until-next-draw, are not modelled as
  separate expiring states — once any of your winning tiles has been in your
  discards, ron stays blocked for the rest of the hand).
- Kan after riichi is disabled entirely (no ankan-after-riichi path), rather
  than implementing the "must not change wait/yaku" legality check.
- Dead wall is a fixed 14-tile slice front-loaded with the replacement tiles
  and dora/ura-dora indicators, rather than a literal physical rearrangement
  of the live wall — functionally equivalent, just modelled differently.
- Honba count increases on dealer win and on exhaustive draw; it resets on a
  non-dealer win, matching standard convention.
- Riichi sticks are pooled and paid to the eventual hand winner; on exhaustive
  draw with no winner, sticks carry over to the next hand rather than being
  split.
- Exhaustive draw (ryuukyoku) tenpai payments use the standard flat 3000-point
  pool split among tenpai players / paid by noten players.
- Game end conditions: hanchan (East + South) completion, or any player
  busting below zero.

**Chinese Classical:**
- Scoring is a custom, documented doubling-point variant (base points +
  doubles for common patterns, capped at a limit), not a transcription of any
  single regional rule set (there is no single universal standard for
  Classical scoring in the first place). Payment convention: a self-drawn win
  is paid in full by all three opponents; a win off a discard is paid only by
  the discarder; a dealer win doubles the payment.
- Win condition is the standard 4 sets + 1 pair, or seven pairs.
- No minimum-pattern requirement: many regional rule sets require at least one
  scoring pattern (or a minimum point value) to win at all ("no chicken
  hands"). This build allows any complete hand shape to win, even for the
  base 8 points with zero doubles — `evaluateWinClassical` never returns
  `null` for a structurally valid hand, unlike the riichi engine which does
  require ≥1 yaku.

**AI opponents (`js/ai.js`):**
- Discard choice minimizes shanten first, then prefers discarding tiles
  already visible in opponents' discards (genbutsu) for safety, then breaks
  ties by tile usefulness (terminals/isolated honors go first).
- Calls (pon/chi/kan): always calls a legal ron; calls pon/chi/kan only when
  it improves shanten or completes a valuable yakuhai group. It does not
  model reading opponents' hands, defense beyond genbutsu-preference, or
  hand value/efficiency tradeoffs beyond shanten — it plays reasonably, not
  optimally.

## Testing notes

No headless browser (jsdom/playwright/Chromium) was available in the
environment this was built in. Engine logic (`tiles.js`, `hand.js`,
`yaku-riichi.js`, `score-riichi.js`, `score-classical.js`, `game.js`, `ai.js`)
is tested directly in Node (132,000+ assertions, including two 30-game
randomized full-hanchan simulations per ruleset with tile-conservation and
score-invariant checks). The DOM/UI layer (`ui.js` + `index.html`) is
exercised by `js/test/ui-integration.test.js`, which loads the real script
bundle into a Node `vm` sandbox against a small hand-rolled DOM shim
(`js/test/dom-shim.js`) and drives real games end-to-end through the actual
button/click handlers. This is a reasonable substitute for a real browser but
is not a replacement for manually clicking through the page — no manual
in-browser test pass was performed.
