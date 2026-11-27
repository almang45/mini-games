# Dots and Boxes

The pencil-and-paper game on a 3x3 to 6x6 board of boxes, built as static
HTML/CSS/JS with no build step. You can play the AI (going first or
second), two players can share one device, or two to four players can play
online, each on their own device.

Players take turns drawing a line between two neighbouring dots. Drawing the
fourth side of a box claims it, and then you must draw again. When every line
is drawn, the player with the most boxes wins. An even board can end in a
draw.

## AI

All levels always take a box that's on offer. Easy plays a random line half
the time. Medium never draws a box's third side while a safe line remains,
and when none does, it gives away the smallest chain.

Hard plays the chain endgame properly:

- **Control.** When 14 or fewer safe lines are left, it searches them to the
  end, a game of who has to open the first chain. It scores each final
  position with the chain values below, so it fights for control.
- **Chain values.** Once only chains and loops are left, it values them
  recursively. When a chain is opened, the taker can take it all and move
  on, or take all but two boxes (four in a loop) and make the opener move
  again. It opens the component that loses least, and opens a 2-chain in the
  middle so it can't be declined.
- **The double-cross.** With the last two boxes of a chain (or the last
  four of a loop) to take, it hands them over instead when keeping control
  is worth more. It takes other boxes first so that option stays open.

The chain model treats a box with three or more open sides (a junction) as
the edge of the board. That's a standard simplification, and where Hard can
still misjudge an endgame.

| Board | Hard against Medium (self-play, 40 games, both sides) |
|-------|------------------------------------------------------|
| 3x3 | 35 wins |
| 4x4 | 28 wins, 4 draws |
| 5x5 | 32 wins |
| 6x6 | 34 wins, 2 draws |

Hard takes well under 0.2 s per move.

## Online

Pick **Online - up to 4 devices**, choose 2, 3 or 4 players and a board, and
press **Host a game**. Share the five-character code or link; everyone who
opens it takes the next free seat (Red, Blue, Green, Purple, in turn order).
The host's AI plays any seat nobody took, at the host's AI level, so a room
can start with one person and fill up. Until the first line is drawn, a
player joining or leaving re-seats the game; after that a newcomer watches
until the host presses New Game.

The pages talk through the shared relay (`shared/net/`, `relay/`); see the
root README. The host's device owns the game: only it starts rounds and picks
the board, and it replays its record to any device that disagrees.

- A player who drops pauses the game for everyone until they reconnect.
- If they give the seat up, or stay away for 2.5 minutes, the host's AI takes
  over their seat for the rest of the round. The host works that out from who
  is connected, so it also happens after the host itself reconnects or
  reloads.
- With more than two players the AI skips its endgame search (a two-player
  negamax) and plays the chain heuristics alone.

## Layout

- `index.html`: the page (an SVG board), its styles, and the UI wiring.
- `js/dots-boxes.js`: rules and AI, with no DOM code (`window.DOTS_BOXES`,
  or `require()` in Node).
- `js/test/dots-boxes-online.test.js`: three- and four-player rules, the
  online config, and full games over `TurnSync` with guests, an AI seat, a
  drop, a seat handed to the AI and refused moves.
- `js/test/dots-boxes.test.js`: Node tests covering:
  - line and box geometry
  - extra turns, one line completing two boxes, undo and illegal moves
  - chain values for known positions
  - chain and loop detection
  - the middle opening of a 2-chain
  - the double-cross on a chain and on a loop, both when it pays and when
    it doesn't
  - safe openings
  - full games on every size, with Hard beating Medium and Medium beating
    Easy

## Tests

```
node dots-boxes/js/test/dots-boxes.test.js
node dots-boxes/js/test/dots-boxes-online.test.js
```
