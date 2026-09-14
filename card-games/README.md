# Card Table

A small collection of classic card games — static HTML/CSS/JS, no build step,
no server. Open `index.html` directly in a browser.

Eight games, each seatable from 1-4 players depending on the game:

- **Hearts** — 4 players, trick-taking, avoid points, dodge the moon
- **Spades** — 4 players in two partnerships, bid tricks, spades trump, nil and bags, to 500
- **Crazy Eights** — 2-4 players, shed your hand, wild 8s
- **President** — 3-4 players, shed your hand, climbing sets
- **Big Two** — 4 players, shed your hand, singles/pairs/triples/5-card poker hands
- **Gin Rummy** — 2 players, draw and discard into melds, knock or go gin, to 100
- **Chinese Poker** — 4 players, one deal, arrange 3 poker hands and score head-to-head
- **Blackjack** — 1-4 players vs. the dealer, hit/stand/double, 15-round session

Every seat is independently set to **Human**, **AI**, or **Off** (where the
game allows fewer than 4 players) from the start screen — so "you vs 3 AI",
"4 humans passing the device", and any mix in between are all the same
control, not separate modes. Switching to a game with a lower seat maximum
(Gin Rummy's 2) turns the surplus seats Off, AI seats before human ones.
Player-facing rules (table layout, controls,
per-game rules, glossary) live in `guide.html` — linked from the start
screen. This README is the developer-facing companion: what's implemented,
what's simplified, and how it's tested.

## Project layout

```
index.html                  page shell / lobby + table screens
css/style.css                styling (table, cards, seats, modals)
css/guide.css                 rules-guide-only layout/typography
js/core/cards.js             card model: deck build, shuffle, rank helpers
js/core/dom.js               generic DOM helpers (card rendering, seat layout)
js/games/hearts.js           Hearts rules engine + AI
js/games/spades.js           Spades rules engine + AI
js/games/crazy-eights.js     Crazy Eights rules engine + AI
js/games/president.js        President rules engine + AI
js/games/big-two.js          Big Two rules engine + AI
js/games/gin-rummy.js        Gin Rummy rules engine + AI (meld search, lay-offs)
js/games/chinese-poker.js    Chinese Poker rules engine + AI
js/games/blackjack.js        Blackjack rules engine + AI
js/ui/hearts-ui.js           binds Hearts state to the shared table shell
js/ui/spades-ui.js           binds Spades state to the shared table shell
js/ui/crazy-eights-ui.js     binds Crazy Eights state to the shared table shell
js/ui/president-ui.js        binds President state to the shared table shell
js/ui/big-two-ui.js          binds Big Two state to the shared table shell
js/ui/gin-rummy-ui.js        binds Gin Rummy state to the shared table shell
js/ui/chinese-poker-ui.js    binds Chinese Poker state to the shared table shell
js/ui/blackjack-ui.js        binds Blackjack state to the shared table shell
js/app.js                    lobby + table controller (screens, seat setup,
                              AI pacing, hot-seat handoff, modals)
js/test/*.test.js            plain Node test scripts (run with `node js/test/x.test.js`)
```

Run all tests (from inside this `card-games/` folder): `for f in js/test/*.test.js; do node "$f" || exit 1; done`

Every `js/core/*.js` and `js/games/*.js` file follows the same small UMD
pattern: `module.exports` under Node (used by the tests), `window.X` in the
browser (used by `index.html`'s plain `<script>` tags) — no bundler either
way. `js/ui/*.js` are browser-only (they read `window.CARDS`/`window.HEARTS`/
etc., which the Node tests populate manually before requiring them — see
`js/test/ui-smoke.test.js`).

## Known simplifications / rule choices

**Hearts:**
- Pass cycle is left → right → across → hold, repeating every 4 hands (the
  standard cycle); there's no option to disable passing entirely.
- Game ends the first time any player's cumulative score reaches 100; the
  lowest score wins. No tie-break beyond that (ties share the win).
- Shooting the moon zeroes the shooter and charges the other three 26 each;
  there's no alternate house rule to instead *subtract* 26 from the shooter.
- Scores don't persist between browser sessions — refreshing starts over.

**Spades:**
- Fixed partnerships (seats across from each other); bids are 1-13 or Nil.
  No Blind Nil, no minimum team bid, no bonus for taking all 13 tricks.
- A failed Nil costs 100, and its tricks still count toward the partner's
  contract and bags; the penalty is the whole cost of failing.
- Every 10 accumulated bags costs 100 (bags roll over past 10).
- The game ends when a team reaches 500 with scores unequal (ties keep
  playing), or when a team falls to -200.
- The human's bid stepper starts at the AI's suggested bid for that hand.

**Gin Rummy:**
- Aces are low (A-2-3 is a run, Q-K-A isn't); deadwood counts A=1, 2-10 face
  value, J/Q/K=10. Melds are always arranged for minimum deadwood by an exact
  search over candidate sets/runs, so players never arrange melds by hand.
- No first-turn upcard offer, no Big Gin, and no game/line/box bonuses or
  shutout doubling — hand points accumulate to 100.
- Lay-offs are applied automatically and greedily after the defender's own
  best arrangement, which can miss the rare case where breaking a defender
  meld would lay off more.
- A non-knock discard that leaves 2 or fewer stock cards voids the hand.

**Crazy Eights:**
- The only special card is the wild 8 — no skip/reverse/draw-two/draw-four
  variants some house rules add.
- Drawing is minimal: draw exactly one card when you have no legal play. If
  it's playable you may play it immediately or keep it and pass; if not,
  your turn ends automatically. (Some house rules have you draw repeatedly
  until you *can* play — not implemented here.)
- No cross-hand point scoring — the first empty hand simply wins the game,
  rather than tallying opponents' remaining-card points toward a match total.
- Deal size is 7 cards for a 2-player game, 5 cards for 3-4 players (a common
  convention, not the only one in circulation).

**President:**
- No jokers, and no rank other than the standard 13 (2 is the highest card,
  3 the lowest, ace second-highest — no "1" or wild rank).
- No "revolution" (four-of-a-kind inverting rank order for the rest of the
  hand) and no "8 clears the pile" house rule — pure climbing, nothing
  resets the pile except everyone else passing.
- No card exchange between the previous round's President/Bum at the start
  of a new round — this build plays a single round to a full finishing
  order and stops there rather than looping into a persistent multi-round
  match with the exchange rule.
- The first leader is whoever holds the 3 of Clubs (not a house-rule
  variant based on a different lowest card).

**Big Two:**
- Combo sizes are restricted to 1, 2, 3, and 5 (single/pair/triple/5-card
  poker hand) — sizes of 4 or 6+ are never legal, matching the most common
  ruleset.
- 5-card hands rank by standard poker category order (straight < flush <
  full house < four-of-a-kind < straight flush) — some house rules order
  flush and straight differently; this build picks the poker-standard order
  and documents the choice rather than trying to support both.
- The leader is whoever holds the 3 of Diamonds (the common convention for
  this game, distinct from President's 3 of Clubs).
- Single-round game to a full finishing order, same as President — no
  persistent multi-round match or score carryover.

**Chinese Poker:**
- Single round per game — deal, arrange, score, done. No multi-round match,
  no running point total across deals.
- Standard 9-category poker hand ranking for Middle/Back (high card through
  straight flush); the 3-card Front hand only recognizes high card, pair, or
  trips (a 3-card hand can't form a straight or flush under this build's
  rules).
- No royalty/bonus scoring (e.g. extra points for trips in front, four-of-a-
  kind, or a straight flush) — every row win/loss is worth exactly ±1 point,
  for 18 total row comparisons across all 6 seat pairings.
- Submitting a fouled hand (rows not in ascending strength) is accepted, not
  rejected — it simply auto-loses all 3 rows to every opponent, matching how
  the real game penalizes a foul.

**Blackjack:**
- The dealer is not a seat — every player plays independently against the
  dealer, not against each other.
- Flat 25-chip bet every round; there's no betting UI or ability to vary the
  wager.
- Only Hit, Stand, and (on the initial 2 cards, chips permitting) Double
  Down are implemented — no splitting pairs, no surrender, no insurance
  against a dealer up-card Ace.
- Dealer stands on all 17s, including a soft 17 (Ace + 6) — a common but not
  universal house rule (some casinos hit soft 17).
- A single deck, reshuffled fresh every round (no multi-deck shoe, no card
  counting considerations).
- Fixed 15-round session, then the game ends and seats are ranked by final
  chip count — not an open-ended "play until you're broke" session.

**AI opponents (all eight games):** heuristic, not a full game-tree search —
they play legally and reasonably (Hearts: duck under the current trick
winner when possible, dump dangerous cards — the Queen of Spades and high
spades/hearts — when void; Spades: bid a rule-of-thumb trick count from
high cards, spade length and short suits, lead sure winners while tricks
are still needed, duck with the highest losing card when bidding Nil or once
the contract is made, and don't overtake a partner who is already winning;
Gin Rummy: take the discard only when it lands in a meld, discard for the
lowest resulting deadwood and shed high unconnected cards first, knock
early but hold out for a low count mid-hand to avoid undercuts; Crazy Eights: hold 8s back until forced, prefer
suits it holds more of; President/Big Two: lead the lowest legal group, beat
the pile as cheaply as possible; Chinese Poker: build the strongest possible
Back hand first, then the strongest Middle that still keeps Front ≤ Middle
≤ Back, falling back to the least-bad foul if no valid split exists;
Blackjack: mimic dealer strategy — hit anything under hard 17, double only a
hard 10 or 11) but don't model deeper strategy like deliberately holding
back a winning play, reading opponents' hands, card counting, or (Hearts)
angling to shoot the moon themselves.

## Testing notes

No headless browser (Playwright/Puppeteer/jsdom) was available in the
environment this was built in, so testing happens on two levels:

1. **Engine tests** (`cards.test.js`, `hearts.test.js`, `spades.test.js`,
   `crazy-eights.test.js`, `president.test.js`, `big-two.test.js`,
   `gin-rummy.test.js`, `chinese-poker.test.js`, `blackjack.test.js`)
   exercise each rules engine directly in Node: rule checks against
   hand-built scenarios (forced leads, moon shots, illegal plays,
   pile-clearing edge cases around a player finishing mid-round, hand
   evaluation and foul detection, blackjack settlement math via rigged
   fixture states, Spades contract/Nil/bag scoring, Gin Rummy meld search,
   lay-offs and knock/undercut/gin settlement), deck conservation, and dozens
   of full randomized AI-vs-AI
   games per player count to catch stuck states, non-terminating games, or a
   degenerate AI.
2. **`js/test/ui-smoke.test.js`** loads the *real* `js/app.js` (plus every
   `js/games/*.js` and `js/ui/*.js`) into a small hand-rolled DOM shim
   (`js/test/dom-shim.js`) under Node, then drives full games end-to-end
   through the actual exported controller — not a re-implementation of it —
   for every game, seat count, "vs AI" and full hot-seat configuration,
   including the wild-suit modal and the hot-seat "pass the device"
   interstitial. This is a reasonable substitute for a real browser but is
   not a replacement for manually clicking through the page — no manual
   in-browser test pass was performed.

`app.js` exposes its internal controller (`selectGame`, `startGame`,
`playCard`, `clickAction`, etc.) via the same `module.exports` guard used
everywhere else in this codebase, purely so the smoke test can drive it; the
guard is a no-op in the browser (`typeof module === "undefined"` there).
