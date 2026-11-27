# Ludo

Ludo for 2-4 players on the classic cross board, built as static HTML/CSS/JS
with no build step and no server of its own. Play Red against AI opponents,
put everyone on one device, or play online on up to four devices through the
relay (see the root README, "Online play").

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

## Online

Pick the number of players, choose "Online - up to 4 devices", then Host a
game and share the code or link. The room has one seat per colour, in seat
order (the host is Red). Seats nobody has taken are played by the host's AI
at the host's level, and the lobby says so.

- Players who join before the first roll are seated at once. Anyone who joins
  later watches the game in progress; the host's New Game seats everyone who
  is connected.
- A player who drops pauses the game until they are back (the seat token is
  kept for the tab, so a reload rejoins). A player who presses Leave, or stays
  away for 2½ minutes, is handed to the host's AI and the game carries on; if
  they come back, or someone else takes the seat over, they watch until the
  host's next New Game. The host works out who is missing from who is
  connected, so this also happens when the host itself was offline or
  reloading at the moment they left.
- Only the device whose turn it is acts: it rolls the die and sends the value,
  so every device applies the same roll. That trusts each player's own die;
  a modified page could pick its rolls. Moves out of turn, illegal moves and
  moves carrying anything but a roll or a token are refused, and the host's
  record wins any disagreement. A host that reloads without its saved copy
  takes the game back from the guests only if all of them hand back the same
  one.

`createOnlineAdapter` in `js/ludo.js` is the adapter for
`shared/net/turn-sync.js`; its config names which device plays each seat.

## Layout

- `index.html`: the page, its styles and the UI wiring: the board geometry,
  token placement, the die and step-by-step token movement.
- `js/ludo.js`: rules, AI and the online adapter, with no DOM code (`window.LUDO`, or
  `require()` in Node). A token's position is its own progress (-1 yard,
  0-50 loop, 51-55 home column, 56 home); `loopSquare` maps it onto the
  shared loop.
- `js/test/ludo.test.js`: Node tests for leaving the yard, three 6s, exact
  home, captures (including safe squares, home columns and doubled tokens),
  winning and the AI's choices, plus full games at every player count and
  Normal against Easy.
- `js/test/ludo-online.test.js`: online play through TurnSync: a full
  four-seat game with two guests and a host-played AI seat kept identical on
  every device, joining mid-game, a dropped player pausing play, and refused
  dice, out-of-turn moves and bad configs.

## Tests

```
node ludo/js/test/ludo.test.js
node ludo/js/test/ludo-online.test.js
```
