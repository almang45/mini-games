# Klondike Solitaire

Classic single-player card game — static HTML/CSS/JS, a single `index.html`
file, no build step, no server.

Standard 52-card deal: 7 tableau columns (1-7 cards, top face-up), a
stock/waste with a Draw 1 / Draw 3 toggle, and four suit foundations built
Ace up through King. Click a card to select it (and everything stacked on
top of it), then click a column or foundation to move it there; double-click
a top card to send it straight to its foundation when possible. Includes
undo, an auto-finish button once the whole tableau is face-up, a move/timer
readout, and zoom controls.

Simple enough to stay in one file — there's no separate `css/`/`js/` split
and no automated test suite here, matching Mahjong Solitaire's precedent in
this collection. It was verified with a scripted, seeded-shuffle Playwright
run (deterministic deal, tableau/foundation moves, illegal-move rejection,
and undo all checked against a known expected deck) rather than a permanent
test file.
