# Backgammon

Backgammon with the standard 15-checker setup, built as static HTML/CSS/JS
with no build step and no server. You can play White or Black against the AI,
or two players can share one device. Games are scored 1, 2 (gammon) or 3
(backgammon) and the page keeps a running match total. There is no doubling
cube.

## Rules

- Each side moves its checkers round to its own home board and then bears them
  off. The first to bear off all fifteen wins.
- Each die moves one checker that many points, and doubles give four moves. A
  checker can't land on a point held by two or more enemy checkers. Landing on
  a single enemy checker (a blot) hits it to the bar.
- A checker on the bar has to re-enter in the opponent's home board before any
  other checker of that side can move.
- Bearing off starts once all fifteen checkers are home. A die higher than the
  highest occupied point bears off the rearmost checker.
- You have to use both dice if you can, and all four on doubles. If only one
  die can be played, it must be the larger one when either could be. With no
  legal move the turn passes.

The opening roll is one die each, and the higher roll moves first using both.

## Playing

Roll, click a checker, then click where it goes. Destinations include
moves that carry one checker on with both dice. If two routes reach the same
point, the shorter one is taken, then the one that hits more. Undo move takes
back moves within the current turn. Done ends the turn once every die that can
be used has been. Escape drops the picked checker.

## AI

Every distinct position reachable with the roll is scored by a hand-tuned
evaluation:

- In contact positions it scores the pip count difference, made points
  weighted by where they are (home board, bar point, anchors), primes,
  checkers on the bar (worse against a stronger home board), and each blot's
  exact chance of being hit next roll times what it would cost.
- In a pure race it scores the pip count, less a small penalty for wastage.

| Level  | Play |
|--------|------|
| Easy   | Medium's choice, but 40% of its turns are random |
| Medium | The best position by the evaluation (1 ply) |
| Hard   | Takes Medium's top six and averages the opponent's best reply over all 21 rolls (2 ply), about 0.2 s at most per turn |

Self-play over 100 games each:

- Medium beats random play 100/100.
- Medium beats Easy 83/100.
- Hard beats Medium 59% across both colours.

## Layout

- `index.html`: the page, its styles, and the UI wiring.
- `js/backgammon.js`: rules and AI, with no DOM code (`window.BACKGAMMON`, or
  `require()` in Node).
- `js/test/backgammon.test.js`: Node tests covering:
  - hitting and undo
  - entering from the bar, including a closed board that forces a pass
  - every bear-off rule, and the use-both-dice and larger-die rules
  - doubles
  - single, gammon and backgammon results
  - exact hit odds
  - the AI's opening moves
  - conservation of 15 checkers through full games, and Medium beating
    random play

## Tests

```
node backgammon/js/test/backgammon.test.js
```
