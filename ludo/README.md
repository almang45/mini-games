# Ludo

Ludo for 2-4 players on the classic cross board, built as static HTML/CSS/JS
with no build step and no server. Play Red against AI opponents, or put
everyone on one device.

Seats are coloured in turn order: Red, Green, Yellow, Blue. Two players sit
opposite each other (Red and Yellow); three leave Blue out.

## Rules

- Roll a 6 to bring a token out of your yard onto your start square.
- Tokens move clockwise round the 52-square loop, then up your own coloured
  column. Home needs an exact roll; a move that would overshoot isn't allowed.
- Landing on an opponent's token sends it back to its yard. Every opponent
  token on that square goes. Start squares and the stars (eight squares past
  each start) are safe: tokens there can't be captured.
- Rolling a 6, capturing, or getting a token home earns another roll. A third
  6 in a row ends the turn without moving.
- With no legal move the turn passes (after a 6, you still roll again).
- The first player with all four tokens home wins.

Rule choices: there are no blocks (two of your tokens on a square don't stop
anyone passing), and you don't need to have captured a token before entering
your home column, as some house rules require. When exactly one move is
legal it is played for you.

## AI

| Level  | Play |
|--------|------|
| Easy   | A random legal move |
| Normal | Scores every legal move: get a token home, capture (more for a token far along), bring a token out, enter the home column or a safe square, step out of reach of an opponent one roll behind, and avoid stopping where one can hit you |

Normal beats Easy in about 92% of two-player games, and wins about 79% of
games against three Easy players.

## Layout

- `index.html`: the page, its styles and the UI wiring: the board geometry,
  token placement, the die and step-by-step token movement.
- `js/ludo.js`: rules and AI, with no DOM code (`window.LUDO`, or
  `require()` in Node). A token's position is its own progress (-1 yard,
  0-50 loop, 51-55 home column, 56 home); `loopSquare` maps it onto the
  shared loop.
- `js/test/ludo.test.js`: Node tests for leaving the yard, three 6s, exact
  home, captures (including safe squares, home columns and doubled tokens),
  winning and the AI's choices, plus full games at every player count and
  Normal against Easy.

## Tests

```
node ludo/js/test/ludo.test.js
```
